import { Worker, Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { envOr, requireEnv } from '@/lib/env';
import { ExportJobData } from '@/lib/export/queue';
import Papa from 'papaparse';
import { PutObjectCommand, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { FeeDefaultersPDF } from '@/lib/export/pdf-templates/fee-defaulters';

let s3Client: S3Client | null = null;
function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: envOr('AWS_REGION', 'af-south-1'),
      credentials: {
        accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }
  return s3Client;
}

// ✅ R6-06: Sanitize CSV cells to prevent formula injection (=, +, -, @, \t, \r)
function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@') || str.startsWith('\t') || str.startsWith('\r')) {
    return `'${str}`; // Prefix with single quote to force text interpretation in Excel/Sheets
  }
  return str;
}

async function generateAttendanceClassExport(data: ExportJobData): Promise<string> {
  const { schoolId, filters } = data;
  const { streamId, startDate, endDate } = filters;

  const attendances = await prisma.studentLessonAttendance.findMany({
    where: {
      schoolId,
      date: { gte: new Date(startDate as string), lte: new Date(endDate as string) },
      slot: { streamId: streamId as string },
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
    orderBy: [{ date: 'asc' }, { slot: { period: { orderIndex: 'asc' } } }],
  });

  const csvData = attendances.map((a: any) => ({
    Date: a.date.toISOString().split('T')[0],
    Period: sanitizeCsvCell(a.slot.period.name),
    Time: `${a.slot.period.startTime} - ${a.slot.period.endTime}`,
    Learning_Area: sanitizeCsvCell(a.slot.learningArea.name),
    Admission_No: sanitizeCsvCell(a.student.admissionNumber),
    Student_Name: sanitizeCsvCell(`${a.student.firstName} ${a.student.lastName}`),
    Status: sanitizeCsvCell(a.status),
    Absence_Reason: sanitizeCsvCell(a.absenceReason),
    Marked_By: sanitizeCsvCell(a.markedBy),
  }));

  return Papa.unparse(csvData);
}

// ✅ R6-06: Secure file paths with schoolId and jobId
async function uploadToS3(
  content: string | Buffer,
  filename: string,
  contentType: string,
  schoolId: string,
  jobId: string
): Promise<string> {
  // Strict school-keyed storage paths to prevent cross-tenant access via guessed job IDs
  const key = `exports/${schoolId}/${jobId}-${filename}`;

  await getS3().send(
    new PutObjectCommand({
      Bucket: requireEnv('AWS_S3_BUCKET'),
      Key: key,
      Body: content,
      ContentType: contentType,
    })
  );

  const command = new GetObjectCommand({
    Bucket: requireEnv('AWS_S3_BUCKET'),
    Key: key,
  });

  return await getSignedUrl(getS3(), command, { expiresIn: 3600 });
}

// ✅ R6-06: Changed queue name from "exports" to "export-queue" to match src/lib/queue/index.ts
export const exportWorker = new Worker(
  'export-queue',
  async (job: Job<ExportJobData>) => {
    const { type, schoolId, filters } = job.data;
    const jobId = job.id || 'unknown-job';

    let content: string | Buffer = '';
    let filename = '';
    let contentType = '';

    switch (type) {
      case 'attendance-class':
        content = await generateAttendanceClassExport(job.data);
        filename = `attendance-${filters.streamId}-${filters.startDate}.csv`;
        contentType = 'text/csv';
        break;

      case 'fees-defaulters': {
        const termId = filters.termId as string;

        const studentsWithFees = await prisma.student.findMany({
          where: { schoolId, status: 'active', deletedAt: null },
          include: {
            stream: { include: { grade: true } },
            studentFees: { where: { termId }, include: { feeItem: true } },
            feePayments: { where: { termId, isReversed: false } },
          },
        });

        const defaulters = studentsWithFees
          .map((student: any) => {
            const totalDue = student.studentFees.reduce(
              (sum: number, fee: any) => sum + (Number(fee.amountDue) - Number(fee.discount || 0)),
              0
            );
            const totalPaid = student.feePayments.reduce(
              (sum: number, payment: any) => sum + Number(payment.amount),
              0
            );
            return {
              studentName: sanitizeCsvCell(`${student.firstName} ${student.lastName}`),
              admissionNumber: sanitizeCsvCell(student.admissionNumber || 'N/A'),
              streamName: sanitizeCsvCell(`${student.stream.grade.name} ${student.stream.name}`),
              totalDue,
              totalPaid,
              balance: totalDue - totalPaid,
            };
          })
          .filter((student: any) => student.balance > 0)
          .sort((a: any, b: any) => b.balance - a.balance);

        const term = await prisma.term.findUnique({
          where: { id: termId },
          select: { name: true },
        });
        const school = await prisma.school.findUnique({
          where: { id: schoolId },
          select: { name: true },
        });

        const pdfBuffer = await renderToBuffer(
          createElement(FeeDefaultersPDF, {
            schoolName: school?.name || 'School',
            termName: term?.name || 'Current Term',
            generatedAt: new Date().toLocaleString('en-KE'),
            defaulters,
          }) as unknown as ReactElement<DocumentProps>
        );

        content = Buffer.from(pdfBuffer);
        filename = `fee-defaulters-${termId}-${Date.now()}.pdf`;
        contentType = 'application/pdf';
        break;
      }

      case 'results-markbook': {
        const markbookStreamId = filters.streamId as string;
        const markbookTermId = filters.termId as string;
        const learningAreaId = filters.learningAreaId as string | undefined;

        const assessments = await prisma.assessment.findMany({
          where: {
            schoolId,
            streamId: markbookStreamId,
            termId: markbookTermId,
            learningAreaId: learningAreaId || undefined,
            status: { in: ['published', 'locked'] },
          },
          include: { learningArea: { select: { name: true } } },
          orderBy: [{ assessmentDate: 'asc' }, { title: 'asc' }],
        });

        const students = await prisma.student.findMany({
          where: {
            schoolId,
            streamId: markbookStreamId,
            status: 'active',
            deletedAt: null,
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });

        const assessmentIds = assessments.map((a: any) => a.id);
        const results = await prisma.assessmentResult.findMany({
          where: {
            assessmentId: { in: assessmentIds },
            studentId: { in: students.map((s: any) => s.id) },
          },
        });

        const resultsMap = new Map<string, string>();
        results.forEach((result: any) => {
          resultsMap.set(
            `${result.assessmentId}-${result.studentId}`,
            result.marksObtained?.toString() || ''
          );
        });

        const csvRows = students.map((student: any) => {
          const row: Record<string, string> = {
            'Admission No': sanitizeCsvCell(student.admissionNumber),
            'Student Name': sanitizeCsvCell(`${student.firstName} ${student.lastName}`),
          };
          assessments.forEach((assessment: any) => {
            const key = `${assessment.title} (${assessment.learningArea.name}) - ${assessment.type}`;
            row[key] = resultsMap.get(`${assessment.id}-${student.id}`) || '';
          });
          return row;
        });

        content = Papa.unparse(csvRows);
        filename = `markbook-${markbookStreamId}-${markbookTermId}-${Date.now()}.csv`;
        contentType = 'text/csv';
        break;
      }

      default:
        throw new Error(`Unknown export type: ${type}`);
    }

    // ✅ R6-06: Pass schoolId and jobId to ensure strict tenant isolation in S3
    const downloadUrl = await uploadToS3(content, filename, contentType, schoolId, jobId);
    return { downloadUrl, filename };
  },
  { connection: redis }
);

exportWorker.on('completed', (job) => console.log(`✅ Export job ${job.id} completed`));
exportWorker.on('failed', (job, err) => console.error(`❌ Export job ${job?.id} failed:`, err));

console.log("✅ Export worker started, waiting for jobs on 'export-queue'...");