import { Worker, Job } from "bullmq";
import { redis } from "../src/lib/redis";
import { prisma} from "../src/lib/db";
import { ExportJobData } from "../src/lib/export/queue";
import Papa from "papaparse";
import { PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { FeeDefaultersPDF } from "../src/lib/export/pdf-templates/fee-defaulters";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "af-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function generateAttendanceClassExport(data: ExportJobData): Promise<string> {
  const { schoolId, filters } = data;
  const { streamId, startDate, endDate } = filters;

  const attendances = await prisma.studentLessonAttendance.findMany({
    where: {
      schoolId,
      date: { gte: new Date(startDate), lte: new Date(endDate) },
      slot: { streamId },
    },
    include: {
      student: { select: { firstName: true, lastName: true, admissionNumber: true } },
      slot: {
        include: {
          learningArea: { select: { name: true } },
          period: { select: { name: true, startTime: true, endTime: true } },
        },
      },
    },
    orderBy: [{ date: "asc" }, { slot: { period: { orderIndex: "asc" } } }],
  });

  const csvData = attendances.map((a: any) => ({
    Date: a.date.toISOString().split("T")[0],
    Period: a.slot.period.name,
    Time: `${a.slot.period.startTime} - ${a.slot.period.endTime}`,
    Learning_Area: a.slot.learningArea.name,
    Admission_No: a.student.admissionNumber || "",
    Student_Name: `${a.student.firstName} ${a.student.lastName}`,
    Status: a.status,
    Absence_Reason: a.absenceReason || "",
    Marked_By: a.markedBy,
  }));

  return Papa.unparse(csvData);
}

async function uploadToS3(content: string | Buffer, filename: string, contentType: string): Promise<string> {
  const key = `exports/${Date.now()}-${filename}`;
  
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || "edutrack-exports",
      Key: key,
      Body: content,
      ContentType: contentType,
    })
  );

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET || "edutrack-exports",
    Key: key,
  });
  
  return await getSignedUrl(s3, command, { expiresIn: 3600 });
}

const exportWorker = new Worker(
  "exports",
  async (job: Job<ExportJobData>) => {
    const { type } = job.data;
    
    let content: string | Buffer = "";
    let filename = "";
    let contentType = "";

    switch (type) {
      case "attendance-class":
        content = await generateAttendanceClassExport(job.data);
        filename = `attendance-${job.data.filters.streamId}-${job.data.filters.startDate}.csv`;
        contentType = "text/csv";
        break;
      
      case "fees-defaulters": {
        const { termId } = job.data.filters;
        
        const studentsWithFees = await prisma.student.findMany({
          where: { schoolId: job.data.schoolId, status: "active", deletedAt: null },
          include: {
            stream: { include: { grade: true } },
            studentFees: { where: { termId }, include: { feeItem: true } },
            feePayments: { where: { termId, isReversed: false } },
          },
        });

        const defaulters = studentsWithFees
          .map((student: any) => {
            const totalDue = student.studentFees.reduce(
              (sum: number, fee: any) => sum + (fee.amountDue - (fee.discount || 0)), 0
            );
            const totalPaid = student.feePayments.reduce(
              (sum: number, payment: any) => sum + payment.amount, 0
            );
            return {
              studentName: `${student.firstName} ${student.lastName}`,
              admissionNumber: student.admissionNumber || "N/A",
              streamName: `${student.stream.grade.name} ${student.stream.name}`,
              totalDue,
              totalPaid,
              balance: totalDue - totalPaid,
            };
          })
          .filter((student: any) => student.balance > 0)
          .sort((a: any, b: any) => b.balance - a.balance);

        const term = await prisma.term.findUnique({ where: { id: termId }, select: { name: true } });
        const school = await prisma.school.findUnique({ where: { id: job.data.schoolId }, select: { name: true } });
        
        const pdfBuffer = await renderToBuffer(
          createElement(FeeDefaultersPDF, {
            schoolName: school?.name || "School",
            termName: term?.name || "Current Term",
            generatedAt: new Date().toLocaleString("en-KE"),
            defaulters,
          }) as unknown as ReactElement<DocumentProps>
        );

        content = Buffer.from(pdfBuffer);
        filename = `fee-defaulters-${termId}-${Date.now()}.pdf`;
        contentType = "application/pdf";
        break;
      }

      case "results-markbook": {
        const { streamId: markbookStreamId, termId: markbookTermId, learningAreaId } = job.data.filters;
        
        const assessments = await prisma.assessment.findMany({
          where: {
            schoolId: job.data.schoolId,
            streamId: markbookStreamId,
            termId: markbookTermId,
            learningAreaId: learningAreaId || undefined,
            status: { in: ["published", "locked"] },
          },
          include: { learningArea: { select: { name: true } } },
          orderBy: [{ assessmentDate: "asc" }, { title: "asc" }],
        });

        const students = await prisma.student.findMany({
          where: { schoolId: job.data.schoolId, streamId: markbookStreamId, status: "active", deletedAt: null },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        });

        const assessmentIds = assessments.map((a: any) => a.id);
        const results = await prisma.assessmentResult.findMany({
          where: { assessmentId: { in: assessmentIds }, studentId: { in: students.map((s: any) => s.id) } },
        });

        const resultsMap = new Map<string, string>();
        results.forEach((result: any) => {
          resultsMap.set(`${result.assessmentId}-${result.studentId}`, result.marksObtained?.toString() || "");
        });

        const csvRows = students.map((student: any) => {
          const row: Record<string, string> = {
            "Admission No": student.admissionNumber || "",
            "Student Name": `${student.firstName} ${student.lastName}`,
          };
          assessments.forEach((assessment: any) => {
            const key = `${assessment.title} (${assessment.learningArea.name}) - ${assessment.type}`;
            row[key] = resultsMap.get(`${assessment.id}-${student.id}`) || "";
          });
          return row;
        });

        content = Papa.unparse(csvRows);
        filename = `markbook-${markbookStreamId}-${markbookTermId}-${Date.now()}.csv`;
        contentType = "text/csv";
        break;
      }
      
      default:
        throw new Error(`Unknown export type: ${type}`);
    }

    const downloadUrl = await uploadToS3(content, filename, contentType);
    return { downloadUrl, filename };
  },
  { connection: redis }
);

exportWorker.on("completed", (job) => console.log(`Export job ${job.id} completed`));
exportWorker.on("failed", (job, err) => console.error(`Export job ${job?.id} failed:`, err));

console.log("Export worker started, waiting for jobs...");