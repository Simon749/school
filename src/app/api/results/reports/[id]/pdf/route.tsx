import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { renderToStream } from '@react-pdf/renderer';
import { TermReportPDF } from '@/lib/pdf/term-report-template';

function safeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(['admin', 'deputy', 'teacher', 'parent']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  // 1. Fetch the base report and related metadata
  const report = await prisma.termReport.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      school: { select: { name: true, county: true } },
      student: { select: { firstName: true, lastName: true, admissionNumber: true, nemisNumber: true } },
      term: { select: { name: true, academicYear: { select: { name: true } } } },
      stream: { include: { grade: { select: { name: true } } } },
    },
  });

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // 2. Strict Role-Based Access Checks (SEC-25)
  if (user.role === 'teacher') {
    const teacher = await prisma.teacher.findFirst({
      where: { userId: user.id, schoolId: user.schoolId },
      select: { isClassTeacher: true, classTeacherStreamId: true },
    });
    if (!teacher?.isClassTeacher || teacher.classTeacherStreamId !== report.streamId) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
  }

  if (user.role === 'parent') {
    const guardian = await prisma.guardian.findFirst({
      where: { userId: user.id, studentId: report.studentId, isActive: true },
      select: { id: true },
    });
    // Parents can ONLY see PUBLISHED reports. Return 404 to avoid leaking existence.
    if (!guardian || !report.publishedAt) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
  }

  // 3. Fetch CBC Assessment Results to build the Learning Area table
  const assessmentResults = await prisma.assessmentResult.findMany({
    where: {
      studentId: report.studentId,
      assessment: {
        termId: report.termId,
        schoolId: user.schoolId,
        status: 'published',
      },
    },
    include: {
      assessment: { select: { learningArea: { select: { name: true } } } },
      rubricScores: { include: { subStrand: { select: { name: true } } } },
    },
  });

  // Aggregate scores and comments per Learning Area
  const laMap = new Map<string, { scores: string[]; comments: string[] }>();
  for (const result of assessmentResults) {
    const laName = result.assessment.learningArea.name;
    if (!laMap.has(laName)) laMap.set(laName, { scores: [], comments: [] });
    const entry = laMap.get(laName)!;
    
    result.rubricScores.forEach((rs) => {
      if (rs.score && !entry.scores.includes(rs.score)) entry.scores.push(rs.score);
      if (rs.comment && !entry.comments.includes(rs.comment)) entry.comments.push(rs.comment);
    });
  }

  const cbcTableData = Array.from(laMap.entries()).map(([laName, data]) => ({
    learningArea: laName,
    performanceLevel: data.scores.length > 0 ? data.scores.join(', ') : 'N/A',
    comment: data.comments.join('; ') || 'No specific comments',
  }));

  // 4. Prepare PDF Data
  const pdfData = {
    schoolName: report.school.name,
    county: report.school.county || 'Kenya',
    termName: report.term.name || 'Current Term',
    academicYear: report.term.academicYear.name,
    studentName: `${report.student.firstName} ${report.student.lastName}`,
    upiNumber: report.student.nemisNumber, // UPI is the NEMIS number
    admissionNumber: report.student.admissionNumber || 'N/A',
    className: `${report.stream.grade.name} ${report.stream.name}`,
    classTeacherComment: report.classTeacherComment || 'No comment provided.',
    principalComment: report.principalComment || 'No comment provided.',
    conduct: report.conduct || 'Not rated',
    totalLessons: report.totalLessons || 0,
    lessonsAttended: report.lessonsAttended || 0,
    cbcTableData,
    closingDate: new Date().toLocaleDateString('en-GB'),
    nextTermBegins: 'As per school calendar',
  };

  // 5. Generate and Stream PDF
  try {
    const pdfStream = await renderToStream(<TermReportPDF data={pdfData} />);
    const chunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const filename = [
      safeFilenamePart(report.student.firstName),
      safeFilenamePart(report.student.lastName),
      safeFilenamePart(report.term.name ?? 'Report'),
    ].filter(Boolean).join('-') || 'term-report';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}.pdf"`,
        'Cache-Control': 'private, no-store', // SEC-25: Never cache academic records
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}