import { describe, expect, it } from 'vitest';
import { bulkUpsertResultsSchema } from '../../src/lib/validations/results.schema';

const studentId = '11111111-1111-4111-8111-111111111111';

describe('bulkUpsertResultsSchema', () => {
  it('preserves an unentered mark as null instead of coercing it to zero', () => {
    const parsed = bulkUpsertResultsSchema.safeParse({
      results: [{ studentId, resultStatus: 'not_entered', marksObtained: null }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.results[0].marksObtained).toBeNull();
  });

  it('accepts zero as a real scored mark', () => {
    const parsed = bulkUpsertResultsSchema.safeParse({
      results: [{ studentId, resultStatus: 'scored', marksObtained: 0 }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.results[0].marksObtained).toBe(0);
  });

  it('converts a numeric input string without treating an empty string as zero', () => {
    const parsed = bulkUpsertResultsSchema.safeParse({
      results: [{ studentId, resultStatus: 'scored', marksObtained: '17.5' }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.results[0].marksObtained).toBe(17.5);
  });

  it('preserves an empty input as an unentered mark', () => {
    const parsed = bulkUpsertResultsSchema.safeParse({
      results: [{ studentId, resultStatus: 'not_entered', marksObtained: '' }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.results[0].marksObtained).toBeNull();
  });

  it('accepts an explicit absence with a zero mark', () => {
    const parsed = bulkUpsertResultsSchema.safeParse({
      results: [{ studentId, resultStatus: 'absent', marksObtained: 0 }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.results[0].resultStatus).toBe('absent');
      expect(parsed.data.results[0].marksObtained).toBe(0);
    }
  });

  it('rejects unknown result states', () => {
    const parsed = bulkUpsertResultsSchema.safeParse({
      results: [{ studentId, resultStatus: 'excused', marksObtained: null }],
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects duplicate student rows in one save request', () => {
    const parsed = bulkUpsertResultsSchema.safeParse({
      results: [
        { studentId, resultStatus: 'scored', marksObtained: 10 },
        { studentId, resultStatus: 'absent', marksObtained: 0 },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
