// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock('sonner', () => ({ toast: { success: () => undefined, error: () => undefined } }));

import { MarksEntryTable } from '@/components/results/MarksEntryTable';

const students = [
  { id: 's1', firstName: 'Amara', lastName: 'Otieno', admissionNumber: '001' },
  { id: 's2', firstName: 'Baraka', lastName: 'Mwangi', admissionNumber: '002' },
];

const fetchMock = vi.fn();

function mount(over: Record<string, unknown> = {}) {
  return render(
    createElement(MarksEntryTable, {
      assessmentId: 'a-1',
      students,
      subStrands: [],
      existingResults: [],
      isLocked: false,
      hasRubric: false,
      maxMarks: 50,
      ...over,
    })
  );
}
const marksBox = (name: string) => screen.getByLabelText(`Marks for ${name}`) as HTMLInputElement;
const savedRows = (call = 0) => JSON.parse(fetchMock.mock.calls[call]![1].body).results;
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MarksEntryTable: auto-save sends what is on screen NOW', () => {
  it('saves the LAST keystroke (regression: the timer used to send the state from before it)', async () => {
    mount();
    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '4' } });
    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '45' } });
    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '46' } });
    await advance(2100);

    expect(fetchMock).toHaveBeenCalledTimes(1); // debounced into ONE save
    const amara = savedRows().find((r: { studentId: string }) => r.studentId === 's1');
    expect(amara.marksObtained).toBe(46); // the final value, not 45
  });

  it('saves an edit made to a different learner right after another', async () => {
    mount();
    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '30' } });
    fireEvent.change(marksBox('Baraka Mwangi'), { target: { value: '41' } });
    await advance(2100);
    const rows = savedRows();
    expect(rows.find((r: { studentId: string }) => r.studentId === 's1').marksObtained).toBe(30);
    expect(rows.find((r: { studentId: string }) => r.studentId === 's2').marksObtained).toBe(41);
  });
});

describe('MarksEntryTable: honest save status', () => {
  it('says "Unsaved changes" until the server confirms, then "All changes saved"', async () => {
    mount();
    expect(screen.getByText('All changes saved')).toBeTruthy();
    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '20' } });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.queryByText('All changes saved')).toBeNull();
    await advance(2100);
    expect(screen.getByText('All changes saved')).toBeTruthy();
  });

  it('when the server refuses, says "Not saved" with a Retry, and never claims it saved', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Server said no' }) });
    mount();
    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '20' } });
    await advance(2100);
    expect(screen.getByText('Not saved')).toBeTruthy();
    expect(screen.queryByText('All changes saved')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Server said no');

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(screen.getByText('All changes saved')).toBeTruthy();
  });

  it('does not send marks above the maximum; shows the problem next to the learner', async () => {
    mount();
    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '51' } });
    await advance(2100);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/maximum is 50/i)).toBeTruthy();
    expect(screen.getByText('Not saved')).toBeTruthy();
  });
});

describe('MarksEntryTable: absent learners and publishing', () => {
  it('ticking Absent clears the mark, disables the box, and saves isAbsent with no marks', async () => {
    mount();
    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '33' } });
    const absentTicks = screen.getAllByLabelText(/Absent \(counts as zero\)/);
    fireEvent.click(absentTicks[0]!);
    expect(marksBox('Amara Otieno').value).toBe('');
    expect(marksBox('Amara Otieno').disabled).toBe(true);
    await advance(2100);
    const amara = savedRows().find((r: { studentId: string }) => r.studentId === 's1');
    expect(amara).toMatchObject({ isAbsent: true, marksObtained: null });
  });

  it('Publish stays disabled while any learner is blank, and enables when each has a mark or ABS', async () => {
    mount();
    const publish = () => screen.getByRole('button', { name: /Publish to Parents/ }) as HTMLButtonElement;
    expect(publish().disabled).toBe(true);
    expect(screen.getByText(/2 still blank/)).toBeTruthy();

    fireEvent.change(marksBox('Amara Otieno'), { target: { value: '0' } }); // a real zero counts
    expect(publish().disabled).toBe(true);
    fireEvent.click(screen.getAllByLabelText(/Absent \(counts as zero\)/)[1]!);
    expect(publish().disabled).toBe(false);
  });

  it('a published (read-only) table lets an ABSENT learner be given a special-exam mark, nobody else', async () => {
    mount({
      isLocked: true,
      canRecordSpecialExam: true,
      existingResults: [
        { id: 'r1', studentId: 's1', marksObtained: 40, isAbsent: false, teacherComment: null, rubricScores: [] },
        { id: 'r2', studentId: 's2', marksObtained: null, isAbsent: true, teacherComment: null, rubricScores: [] },
      ],
    });
    expect(marksBox('Amara Otieno').disabled).toBe(true);
    expect(screen.queryByLabelText(/Absent \(counts as zero\)/)).toBeNull(); // no editing controls
    expect(screen.getAllByRole('button', { name: 'Record special exam' })).toHaveLength(1); // only Baraka
  });
});
