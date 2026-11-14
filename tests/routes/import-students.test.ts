import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/import/students/route';
import * as rateLimitModule from '@/lib/rate-limit';
import * as queueModule from '@/lib/queue';
import * as auditModule from '@/lib/audit';
import Papa from 'papaparse';

// --- Mocks ---
const authMock = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const studentFindMany = vi.fn();
const studentCreate = vi.fn();
const userCreate = vi.fn();
const guardianCreate = vi.fn();
const guardianFindFirst = vi.fn();
const schoolFindUnique = vi.fn();
const streamFindMany = vi.fn();

const redisSetex = vi.fn().mockResolvedValue('OK');
const redisGet = vi.fn();
const redisDel = vi.fn().mockResolvedValue(1);

vi.mocked(auditModule.getRequestMetadata).mockReturnValue({
  ipAddress: '1.2.3.4',
  userAgent: 'test',
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findMany: (...a: unknown[]) => userFindMany(...a),
      create: (...a: unknown[]) => userCreate(...a),
    },
    student: {
      findMany: (...a: unknown[]) => studentFindMany(...a),
      create: (...a: unknown[]) => studentCreate(...a),
    },
    guardian: {
      findFirst: (...a: unknown[]) => guardianFindFirst(...a),
      create: (...a: unknown[]) => guardianCreate(...a),
    },
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
    stream: { findMany: (...a: unknown[]) => streamFindMany(...a) },
    $transaction: vi.fn(async (cb: any) => {
      const tx = {
        user: { findMany: userFindMany, create: userCreate },
        student: { findMany: studentFindMany, create: studentCreate },
        guardian: { findFirst: guardianFindFirst, create: guardianCreate },
      };
      return await cb(tx);
    }),
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    setex: (...a: unknown[]) => redisSetex(...a),
    get: (...a: unknown[]) => redisGet(...a),
    del: (...a: unknown[]) => redisDel(...a),
  },
}));

// ✅ Define mocks directly inside the factory to avoid hoisting issues
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
  getRequestMetadata: vi.fn().mockReturnValue({ ipAddress: '1.2.3.4', userAgent: 'test' }),
}));

vi.mock('@/lib/queue', () => ({
  smsQueue: { add: vi.fn().mockResolvedValue({ id: 'sms-job-1' }) },
}));

vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn(),
  },
}));

// --- Helpers ---
const makeRequest = (formData: FormData) => {
  return new Request('http://localhost/api/import/students', {
    method: 'POST',
    body: formData,
  }) as any;
};

const setupAuth = (role: string = 'admin', schoolId: string = 'school-A') => {
  authMock.mockResolvedValue({ userId: 'clerk-1' });
  userFindUnique.mockResolvedValue({
    id: 'u-1',
    clerkId: 'clerk-1',
    role,
    schoolId,
    isActive: true,
    deletedAt: null,
  });
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(Papa.parse).mockReturnValue({
    data: [
      {
        first_name: 'John',
        last_name: 'Doe',
        nemis_number: 'N123',
        admission_number: 'A1',
        date_of_birth: '2010-01-01',
        gender: 'male',
        grade_name: 'Grade 7',
        stream_name: 'A',
        is_boarding: 'false',
        guardian_first_name: 'Jane',
        guardian_last_name: 'Doe',
        guardian_phone: '254712345678',
        guardian_relationship: 'mother',
      },
    ],
    errors: [],
    meta: {},
  } as any);

  vi.mocked(auditModule.getRequestMetadata).mockReturnValue({
    ipAddress: '1.2.3.4',
    userAgent: 'test',
  });

  setupAuth();
  schoolFindUnique.mockResolvedValue({ id: 'school-A', name: 'Test School' });
  streamFindMany.mockResolvedValue([{ id: 'stream-1', grade: { name: 'Grade 7' }, name: 'A' }]);
  studentFindMany.mockResolvedValue([]); // No existing NEMIS
  userFindMany.mockResolvedValue([]); // No existing users
  guardianFindFirst.mockResolvedValue(null);

  // ✅ Reset mocks to default resolved values using vi.mocked
  vi.mocked(rateLimitModule.checkRateLimit).mockResolvedValue({
    success: true,
    limit: 0,
    remaining: 0,
    reset: 0,
  });
  vi.mocked(queueModule.smsQueue.add).mockResolvedValue({
    id: 'sms-job-1',
  } as any);
});

describe('POST /api/import/students (R6-05)', () => {
  describe('Authentication & Rate Limiting', () => {
    it('returns 401 for anonymous users', async () => {
      authMock.mockResolvedValue({ userId: null });
      const formData = new FormData();
      const res = await POST(makeRequest(formData));
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin/it_admin roles', async () => {
      setupAuth('teacher');
      const formData = new FormData();
      const res = await POST(makeRequest(formData));
      expect(res.status).toBe(403);
    });

    it('returns 429 if rate limit is exceeded', async () => {
      // ✅ Override the mock for this specific test
      vi.mocked(rateLimitModule.checkRateLimit).mockResolvedValue({
        success: false,
        limit: 0,
        remaining: 0,
        reset: 0,
      });
      const formData = new FormData();
      const res = await POST(makeRequest(formData));
      expect(res.status).toBe(429);
    });
  });

  describe('Preview Flow', () => {
    it('returns preview token and valid counts for a good CSV', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['fake csv']), 'students.csv');
      // execute is not 'true', so it defaults to preview

      const res = await POST(makeRequest(formData));
      const data = await res.json();

      console.log('PREVIEW RESPONSE:', JSON.stringify(data, null, 2));

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.previewToken).toBeDefined();
      expect(data.validCount).toBe(1);
      expect(data.errorCount).toBe(0);
      expect(redisSetex).toHaveBeenCalled();
    });
  });

  describe('Execute Flow', () => {
    it('returns 400 if preview token is missing or expired', async () => {
      redisGet.mockResolvedValue(null); // Expired or invalid
      const formData = new FormData();
      formData.append('execute', 'true');
      formData.append('previewToken', 'expired-token');

      const res = await POST(makeRequest(formData));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/expired or not found/i);
    });

    it('successfully processes valid rows, reuses existing parents, and queues SMS', async () => {
      const validRows = [
        {
          first_name: 'John',
          last_name: 'Doe',
          nemis_number: 'N123',
          admission_number: 'A1',
          date_of_birth: '2010-01-01',
          gender: 'Male',
          grade_name: 'Grade 7',
          stream_name: 'A',
          is_boarding: false,
          guardian_first_name: 'Jane',
          guardian_last_name: 'Doe',
          guardian_phone: '254712345678',
          guardian_relationship: 'Mother',
          streamId: 'stream-1',
          cleanPhone: '254712345678',
        },
      ];
      redisGet.mockResolvedValue(JSON.stringify(validRows));

      // Simulate parent already exists (Dedupe logic)
      userFindMany.mockResolvedValue([{ id: 'existing-parent-1', phone: '254712345678' }]);
      studentCreate.mockResolvedValue({ id: 'stu-1' });
      guardianCreate.mockResolvedValue({ id: 'g-1' });

      const formData = new FormData();
      formData.append('execute', 'true');
      formData.append('previewToken', 'valid-token-123');

      const res = await POST(makeRequest(formData));
      const data = await res.json();

      console.log('EXECUTE RESPONSE:', JSON.stringify(data, null, 2));

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.successCount).toBe(1);

      // Verify parent was NOT created (reused instead)
      expect(userCreate).not.toHaveBeenCalled();

      // Verify student and guardian were created
      expect(studentCreate).toHaveBeenCalled();
      expect(guardianCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'existing-parent-1',
            studentId: 'stu-1',
          }),
        })
      );

      // Verify SMS was queued
      expect(vi.mocked(queueModule.smsQueue.add)).toHaveBeenCalledWith(
        'send-welcome-sms',
        expect.any(Object)
      );

      // Verify audit was logged
      expect(vi.mocked(auditModule.logAudit)).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student.import.bulk',
          newData: expect.objectContaining({ successCount: 1 }),
        })
      );

      // Verify Redis cleanup
      expect(redisDel).toHaveBeenCalledWith('import:preview:school-A:valid-token-123');
    });
  });
});
