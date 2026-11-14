import { describe, expect, it, vi, beforeEach } from 'vitest';
import { processMpesaCallback } from '@/../workers/mpesa-callback';

// Import the modules we want to mock so we can use vi.mocked()
import * as allocationModule from '@/lib/fees/allocation';
import * as receiptModule from '@/lib/fees/receipt';

// --- Database Mocks ---
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    paymentAttempt: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    feePayment: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
    $transaction: vi.fn(async (cb: any) => {
      const tx = {
        feePayment: { create: mockCreate },
        paymentAttempt: { update: mockUpdate },
      };
      return await cb(tx);
    }),
  },
}));

// --- Module Mocks (Hoisted automatically by Vitest) ---
vi.mock('@/lib/fees/allocation');
vi.mock('@/lib/fees/receipt');

// --- Test Data ---
const MOCK_ATTEMPT = {
  id: 'att-1',
  schoolId: 'school-A',
  studentId: 'stu-1',
  termId: 'term-1',
  checkoutRequestId: 'ws_CO_123456789',
  amount: 5000,
  phone: '254712345678',
  status: 'pending',
};

const MOCK_SUCCESS_PAYLOAD = {
  checkoutRequestId: 'ws_CO_123456789',
  resultCode: 0,
  resultDesc: 'The service request is processed successfully.',
  callbackMetadata: {
    Item: [
      { Name: 'MpesaReceiptNumber', Value: 'QKH1234567' },
      { Name: 'Amount', Value: '5000.00' },
      { Name: 'PhoneNumber', Value: '254712345678' },
      { Name: 'FullName', Value: 'John Doe' },
    ],
  },
  sourceIp: '196.201.214.10',
};

beforeEach(() => {
  vi.clearAllMocks();

  // ✅ This is the rock-solid way to set mock return values in Vitest
  vi.mocked(allocationModule.allocatePayment).mockResolvedValue({
    allocations: [],
    overpayment: 0,
    fullyCoveredItemIds: [],
  });
  vi.mocked(receiptModule.generateReceiptNumber).mockResolvedValue('REC-000123');
  mockCreate.mockResolvedValue({ id: 'payment-123' });
});

describe('MPesa Callback Worker (R3-02 / R3-04)', () => {
  it('successfully processes a valid callback and creates a FeePayment', async () => {
    mockFindUnique.mockResolvedValue(MOCK_ATTEMPT);

    await processMpesaCallback(MOCK_SUCCESS_PAYLOAD);

    // 1. Should have fetched the attempt
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { checkoutRequestId: 'ws_CO_123456789' },
    });

    // 2. Should have created the FeePayment inside the transaction
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: 'school-A',
        studentId: 'stu-1',
        amount: 5000,
        paymentMethod: 'mpesa',
        mpesaCode: 'QKH1234567',
        mpesaPhone: '254712345678',
        mpesaName: 'John Doe',
        receiptNumber: 'REC-000123',
        allocations: [],
        overpaymentAmount: 0,
      }),
    });

    // 3. Should have updated the attempt to 'completed'
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: expect.objectContaining({
        status: 'completed',
        paymentId: expect.any(String),
      }),
    });
  });

  it('marks the attempt as failed when ResultCode is not 0', async () => {
    mockFindUnique.mockResolvedValue(MOCK_ATTEMPT);

    const failedPayload = {
      ...MOCK_SUCCESS_PAYLOAD,
      resultCode: 1032,
      resultDesc: 'Request cancelled by user.',
      callbackMetadata: null,
    };

    await processMpesaCallback(failedPayload);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: expect.objectContaining({
        status: 'failed',
        failureReason: 'Request cancelled by user.',
      }),
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws an error if the callback amount does not match the attempt amount', async () => {
    mockFindUnique.mockResolvedValue(MOCK_ATTEMPT);

    const mismatchedPayload = {
      ...MOCK_SUCCESS_PAYLOAD,
      callbackMetadata: {
        Item: [
          { Name: 'MpesaReceiptNumber', Value: 'QKH1234567' },
          { Name: 'Amount', Value: '4000.00' }, // Mismatch!
          { Name: 'PhoneNumber', Value: '254712345678' },
        ],
      },
    };

    await expect(processMpesaCallback(mismatchedPayload)).rejects.toThrow(
      'Amount mismatch: expected 5000, got 4000'
    );

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws an error if the callback phone number does not match', async () => {
    mockFindUnique.mockResolvedValue(MOCK_ATTEMPT);

    const mismatchedPhonePayload = {
      ...MOCK_SUCCESS_PAYLOAD,
      callbackMetadata: {
        Item: [
          { Name: 'MpesaReceiptNumber', Value: 'QKH1234567' },
          { Name: 'Amount', Value: '5000.00' },
          { Name: 'PhoneNumber', Value: '254799999999' }, // Mismatch!
        ],
      },
    };

    await expect(processMpesaCallback(mismatchedPhonePayload)).rejects.toThrow('Phone mismatch');

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('silently ignores callbacks for unknown CheckoutRequestIDs (idempotent)', async () => {
    mockFindUnique.mockResolvedValue(null);

    await processMpesaCallback(MOCK_SUCCESS_PAYLOAD);

    expect(mockFindUnique).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
