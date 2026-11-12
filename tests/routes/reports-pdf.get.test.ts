import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const reportFindFirst = vi.fn();
const teacherFindFirst = vi.fn();
const guardianFindFirst = vi.fn();
// ✅ Define the mock function at the top level
const assessmentResultFindMany = vi.fn().mockResolvedValue([]);

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    termReport: { findFirst: (...a: unknown[]) => reportFindFirst(...a) },
    teacher: { findFirst: (...a: unknown[]) => teacherFindFirst(...a) },
    guardian: { findFirst: (...a: unknown[]) => guardianFindFirst(...a) },
    assessmentResult: { findMany: (...a: unknown[]) => assessmentResultFindMany(...a) },
  },
}));
vi.mock('@/lib/pdf/term-report-template', () => ({ TermReportPDF: () => null }));
vi.mock('@react-pdf/renderer', () => ({
  renderToStream: async () =>
    (async function* () {
      yield Buffer.from('%PDF-fake');
    })(),
}));

import { GET } from '@/app/api/results/reports/[id]/pdf/route';

const call = () =>
  GET(new Request('http://x/api/results/reports/r-1/pdf') as never, { params: { id: 'r-1' } });

const signedInAs = (role: string, over: Record<string, unknown> = {}) => {
  authMock.mockResolvedValue({ userId: 'clerk_1' });
  userFindUnique.mockResolvedValue({
    id: 'u-1',
    clerkId: 'clerk_1',
    role,
    schoolId: 'school-A',
    isActive: true,
    deletedAt: null,
    ...over,
  });
};

const report = (over: Record<string, unknown> = {}) => ({
  id: 'r-1',
  schoolId: 'school-A',
  studentId: 'stu-1',
  streamId: 'stream-7A',
  publishedAt: new Date('2026-04-10'),
  classTeacherComment: 'Good',
  principalComment: null,
  conduct: 'good',
  overallScore: null,
  totalLessons: 10,
  lessonsAttended: 9,
  school: { name: 'Test School', county: 'Nairobi' }, // Added county just in case
  student: { firstName: 'Amara', lastName: 'Otieno', admissionNumber: 'A1', nemisNumber: '123456789' }, // Added nemisNumber
  term: {
    name: 'Term 1',
    academicYear: { name: '2026' } 
  },
  stream: { name: 'A', grade: { name: 'Grade 7' } },
  ...over,
});

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    reportFindFirst,
    teacherFindFirst,
    guardianFindFirst,
    assessmentResultFindMany // ✅ Add to reset list
  ]) {
    m.mockReset();
  }
  reportFindFirst.mockResolvedValue(report());
  teacherFindFirst.mockResolvedValue(null);
  guardianFindFirst.mockResolvedValue(null);
  assessmentResultFindMany.mockResolvedValue([]); // ✅ Ensure it returns an empty array
});

describe('GET /api/results/reports/[id]/pdf (SEC-25)', () => {
  it('401 when anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await call()).status).toBe(401);
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it('403 for a Clerk user who has no row in our database (this used to download any report)', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_ghost' });
    userFindUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(403);
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it('403 for a deactivated user (SEC-21)', async () => {
    signedInAs('admin', { isActive: false });
    expect((await call()).status).toBe(403);
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it.each(['bursar', 'it_admin'])('403 for role %s without reading the report', async (role) => {
    signedInAs(role);
    expect((await call()).status).toBe(403);
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it("looks the report up INSIDE the caller's school (a report from another school is a 404)", async () => {
    signedInAs('admin');
    reportFindFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(reportFindFirst.mock.calls[0]![0]!.where).toEqual({ id: 'r-1', schoolId: 'school-A' });
  });

  it.each(['admin', 'deputy'])(
    '%s can download any report in their school, even unpublished',
    async (role) => {
      signedInAs(role);
      reportFindFirst.mockResolvedValue(report({ publishedAt: null }));
      const res = await call();
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
    }
  );

  describe('teachers', () => {
    it('the class teacher of that stream can download', async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({
        isClassTeacher: true,
        classTeacherStreamId: 'stream-7A',
      });
      expect((await call()).status).toBe(200);
      expect(teacherFindFirst.mock.calls[0]![0]!.where).toMatchObject({
        userId: 'u-1',
        schoolId: 'school-A',
      });
    });

    it("another class's teacher gets 404", async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({
        isClassTeacher: true,
        classTeacherStreamId: 'stream-8B',
      });
      expect((await call()).status).toBe(404);
    });

    it('a subject teacher who is not a class teacher gets 404', async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({ isClassTeacher: false, classTeacherStreamId: null });
      expect((await call()).status).toBe(404);
    });

    it('a user with role teacher but no teacher record gets 404', async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue(null);
      expect((await call()).status).toBe(404);
    });
  });

  describe('parents', () => {
    it('a linked, active guardian can download a published report', async () => {
      signedInAs('parent');
      guardianFindFirst.mockResolvedValue({ id: 'g-1' });
      expect((await call()).status).toBe(200);
      expect(guardianFindFirst.mock.calls[0]![0]!.where).toEqual({
        userId: 'u-1',
        studentId: 'stu-1',
        isActive: true,
      });
    });

    it("a parent who is not this child's guardian gets 404 (existence is not confirmed)", async () => {
      signedInAs('parent');
      guardianFindFirst.mockResolvedValue(null);
      expect((await call()).status).toBe(404);
    });

    it('a linked guardian cannot see an UNPUBLISHED report', async () => {
      signedInAs('parent');
      guardianFindFirst.mockResolvedValue({ id: 'g-1' });
      reportFindFirst.mockResolvedValue(report({ publishedAt: null }));
      const res = await call();
      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/not found/i);
    });
  });

  it('builds a safe download filename (no quotes, spaces or non-ASCII from names)', async () => {
    signedInAs('admin');
    reportFindFirst.mockResolvedValue(
      report({
        student: { firstName: 'O\'Brien "Q"\r\nX-Evil: 1', lastName: 'Ñ', admissionNumber: null },
        term: { name: 'Term 1 — 2026', academicYear: { name: '2026' } },
      })
    );
    const res = await call();
    expect(res.status).toBe(200);
    const cd = res.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]*)"/.exec(cd)?.[1] ?? '';
    expect(filename).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
    expect(cd).not.toMatch(/[\r\n]/);
  });

  it('marks the PDF as private and not cacheable', async () => {
    signedInAs('admin');
    const res = await call();
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});