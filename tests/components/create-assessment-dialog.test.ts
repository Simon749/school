// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock('sonner', () => ({ toast: { success: () => undefined, error: () => undefined } }));

import { CreateAssessmentDialog } from '@/components/assessment/CreateAssessmentDialog';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TERM = U(1);
const STREAM = U(2);
const AREA = U(3);

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// One class and one subject the teacher is timetabled for: everything is chosen automatically.
const oneChoice = {
  terms: [{ id: TERM, name: 'Term 2 2026', isCurrent: true }],
  classes: [{ id: STREAM, label: 'Grade 5 A' }],
  learningAreas: [{ id: AREA, name: 'Mathematics' }],
  combos: [{ termId: TERM, streamId: STREAM, learningAreaId: AREA }],
};

const open = () => fireEvent.click(screen.getByRole('button', { name: /New Assessment/ }));
const titleBox = () => screen.findByPlaceholderText(/Term 1 Math CAT/);
const create = () => fireEvent.click(screen.getByRole('button', { name: 'Create Draft' }));

describe('CreateAssessmentDialog: typed text must reach the form (regression)', () => {
  it('sends the title, date and max marks that were typed (the plain inputs used to lose them)', async () => {
    render(createElement(CreateAssessmentDialog, oneChoice as never));
    open();
    fireEvent.change(await titleBox(), { target: { value: 'Term 2 Math CAT' } });
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-01-13' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., 50'), { target: { value: '50' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., 20'), { target: { value: '20' } });
    fireEvent.change(screen.getByPlaceholderText(/Instructions for students/), {
      target: { value: 'Calculators allowed' },
    });
    create();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/assessments');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      title: 'Term 2 Math CAT',
      type: 'cat',
      assessmentDate: '2026-01-13',
      maxMarks: 50,
      weightPercent: 20,
      instructions: 'Calculators allowed',
      termId: TERM,
      streamId: STREAM,
      learningAreaId: AREA,
    });
  });

  it('does NOT say "Required" under a Title that has been typed, but does when it is empty', async () => {
    render(createElement(CreateAssessmentDialog, oneChoice as never));
    open();
    const box = await titleBox();
    create();
    await waitFor(() =>
      expect(box.parentElement!.textContent).toContain('Give the assessment a title')
    );

    fireEvent.change(box, { target: { value: 'Term 2 Math CAT' } });
    create();
    await waitFor(() => expect(box.parentElement!.textContent).not.toContain('title'));
  });

  it('asks for the maximum marks of a CAT, and explains how', async () => {
    render(createElement(CreateAssessmentDialog, oneChoice as never));
    open();
    fireEvent.change(await titleBox(), { target: { value: 'Term 2 Math CAT' } });
    create();
    expect(await screen.findByText(/Enter the maximum marks/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CreateAssessmentDialog: only what the teacher is timetabled for, and the grade is shown', () => {
  it('shows the class as "Grade 5 A" (not the bare stream name) and picks the only choices', async () => {
    render(createElement(CreateAssessmentDialog, oneChoice as never));
    open();
    await titleBox();
    expect(await screen.findByText('Grade 5 A')).toBeTruthy();
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('Term 2 2026')).toBeTruthy();
  });

  it('with no timetable there is nothing to choose: says so and the button is disabled', async () => {
    render(
      createElement(CreateAssessmentDialog, {
        terms: [],
        classes: [],
        learningAreas: [],
        combos: [],
      } as never)
    );
    open();
    expect(await screen.findByText(/not timetabled to teach any class yet/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create Draft' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('with several classes nothing is guessed: the teacher must choose a class', async () => {
    const A2 = U(4);
    const S2 = U(5);
    render(
      createElement(CreateAssessmentDialog, {
        terms: [{ id: TERM, name: 'Term 2 2026', isCurrent: true }],
        classes: [
          { id: STREAM, label: 'Grade 5 A' },
          { id: S2, label: 'Grade 6 B' },
        ],
        learningAreas: [
          { id: AREA, name: 'Mathematics' },
          { id: A2, name: 'Science' },
        ],
        combos: [
          { termId: TERM, streamId: STREAM, learningAreaId: AREA },
          { termId: TERM, streamId: S2, learningAreaId: A2 },
        ],
      } as never)
    );
    open();
    fireEvent.change(await titleBox(), { target: { value: 'Term 2 Math CAT' } });
    fireEvent.change(screen.getByPlaceholderText('e.g., 50'), { target: { value: '50' } });
    create();
    expect(await screen.findByText('Choose a class')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
