import { describe, expect, it } from 'vitest';
import { buildTeachingOptions, type TimetableSlotRow } from '@/lib/assessments/teaching-options';

const slot = (over: Partial<TimetableSlotRow> & { grade?: string; level?: number; stream?: string; area?: string; term?: string }): TimetableSlotRow => {
  const sid = over.streamId ?? 's1';
  const aid = over.learningAreaId ?? 'a1';
  const tid = over.termId ?? 't1';
  return {
    termId: tid,
    streamId: sid,
    learningAreaId: aid,
    term: { id: tid, name: over.term ?? 'Term 2 2026', isCurrent: true },
    stream: { id: sid, name: over.stream ?? 'A', grade: { name: over.grade ?? 'Grade 5', level: over.level ?? 5 } },
    learningArea: { id: aid, name: over.area ?? 'Mathematics' },
  };
};

describe('buildTeachingOptions', () => {
  it('labels a class with its GRADE and stream: "Grade 5 A", never just "A"', () => {
    expect(buildTeachingOptions([slot({})]).classes).toEqual([{ id: 's1', label: 'Grade 5 A' }]);
  });

  it('a subject taught on several days is ONE choice', () => {
    const o = buildTeachingOptions([slot({}), slot({}), slot({})]);
    expect(o.combos).toHaveLength(1);
    expect(o.learningAreas).toHaveLength(1);
  });

  it('keeps each combination separate: Maths in 5A and Science in 6B do not allow Maths in 6B', () => {
    const o = buildTeachingOptions([
      slot({ streamId: 's1', learningAreaId: 'a1', grade: 'Grade 5', level: 5 }),
      slot({ streamId: 's2', learningAreaId: 'a2', grade: 'Grade 6', level: 6, stream: 'B', area: 'Science' }),
    ]);
    expect(o.combos).toEqual([
      { termId: 't1', streamId: 's1', learningAreaId: 'a1' },
      { termId: 't1', streamId: 's2', learningAreaId: 'a2' },
    ]);
    expect(o.combos.some((c) => c.streamId === 's2' && c.learningAreaId === 'a1')).toBe(false);
  });

  it('sorts classes by grade level then stream, so Grade 5 B comes before Grade 10 A', () => {
    const o = buildTeachingOptions([
      slot({ streamId: 'x', grade: 'Grade 10', level: 12, stream: 'A' }),
      slot({ streamId: 'y', grade: 'Grade 5', level: 5, stream: 'B' }),
      slot({ streamId: 'z', grade: 'Grade 5', level: 5, stream: 'A' }),
    ]);
    expect(o.classes.map((c) => c.label)).toEqual(['Grade 5 A', 'Grade 5 B', 'Grade 10 A']);
  });

  it('a term with no name gets a readable fallback, and no slots means no choices', () => {
    const noName = slot({});
    noName.term.name = null;
    expect(buildTeachingOptions([noName]).terms[0]!.name).toBe('Unnamed term');
    expect(buildTeachingOptions([])).toEqual({ combos: [], terms: [], classes: [], learningAreas: [] });
  });
});
