// src/app/api/results/reports/[id]/pdf/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renderToStream } from "@react-pdf/renderer";
import { TermReportPDF } from "@/lib/pdf/term-report-template";
import { TermReportData } from '@/types/reports';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reportId = params.id;

  const report = await prisma.termReport.findUnique({
    where: { id: reportId },
    include: {
      school: { select: { name: true } },
      student: { select: { firstName: true, lastName: true, admissionNumber: true } },
      term: { select: { name: true } },
      stream: { include: { grade: { select: { name: true } } } },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Verify access (parent can only see published reports for their children)
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { guardians: true },
  });

  const isParent = user?.role === "parent";
  const isGuardian = user?.guardians?.some((g) => g.studentId === report.studentId);

  if (isParent && !isGuardian) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (isParent && !report.publishedAt) {
    return NextResponse.json({ error: "Report not yet published" }, { status: 403 });
  }

  try {
    const pdfData = {
      schoolName: report.school.name,
      termName: report.term.name || "Current Term",
      studentName: `${report.student.firstName} ${report.student.lastName}`,
      admissionNumber: report.student.admissionNumber || "N/A",
      className: `${report.stream.grade.name} ${report.stream.name}`,
      classTeacherComment: report.classTeacherComment,
      principalComment: report.principalComment,
      conduct: report.conduct,
      overallScore: report.overallScore ? Number(report.overallScore) : null,
      totalLessons: report.totalLessons,
      lessonsAttended: report.lessonsAttended,
    };

    const pdfStream = await renderToStream(<TermReportPDF data={pdfData} />);

    // Convert stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of pdfStream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="report-${report.student.firstName}-${report.term.name}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}

function data({ data }: { data: TermReportData; }): Element {
  throw new Error("Function not implemented.");
}
