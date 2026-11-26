// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: () => undefined }) }));
vi.mock('sonner', () => ({ toast: { success: () => undefined, error: () => undefined } }));

import TeacherTodayPage from '@/app/(dashboard)/teacher/page';

const fetchMock = vi.fn();
const apiReturns = (body: unknown) =>
  fetchMock.mockResolvedValue({ ok: true, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const base = { slots: [], dayOfWeek: 2, isWeekend: false, school: null, date: '2026-11-24' };
const panel = (today: Record<string, number>, flagged = 0) => ({
  classTeacherPanel: {
    stream: { id: 's', name: 'A', grade: 'Grade 5' },
    studentCount: 24,
    today: { total: 24, present: 0, late: 0, absent: 0, other: 0, notMarked: 24, ...today },
    attendanceTrend: [],
    flaggedStudents: Array.from({ length: flagged }, (_, i) => ({ studentId: `x${i}`, name: 'X', absences: 2 })),
  },
});

describe('My Class card', () => {
  it('shows "Not taken yet" when no register was taken: never "24/24" and never "24 absent"', async () => {
    apiReturns({ ...base, ...panel({}) });
    render(createElement(TeacherTodayPage));
    expect(await screen.findByText('Grade 5 A')).toBeTruthy();
    expect(screen.getByText('Not taken yet')).toBeTruthy();
    expect(screen.queryByText('24/24')).toBeNull();
    expect(screen.queryByText(/24 absent/)).toBeNull();
  });

  it('shows the real counts once a register exists, with the unmarked kept separate', async () => {
    apiReturns({ ...base, ...panel({ present: 18, late: 2, absent: 3, notMarked: 1 }, 4) });
    render(createElement(TeacherTodayPage));
    expect(await screen.findByText('20/24')).toBeTruthy();
    expect(screen.getByText(/3 absent · 1 not marked/)).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy(); // needs attention (real list length, not a constant)
  });

  it('has no hard-coded "Pending Work" figure', async () => {
    apiReturns({ ...base, ...panel({ present: 24, notMarked: 0 }) });
    render(createElement(TeacherTodayPage));
    await screen.findByText('Grade 5 A');
    expect(screen.queryByText('Pending Work')).toBeNull();
  });

  it('a teacher who is NOT a class teacher gets no My Class card and no placeholder class', async () => {
    apiReturns({ ...base, classTeacherPanel: null });
    render(createElement(TeacherTodayPage));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText('MY CLASS')).toBeNull();
    expect(screen.queryByText('Grade 5 A')).toBeNull();
    expect(screen.queryByText('24 learners')).toBeNull();
  });

  it('Open Class and Class analytics lead to the right places', async () => {
    apiReturns({ ...base, ...panel({}) });
    render(createElement(TeacherTodayPage));
    await screen.findByText('Grade 5 A');
    screen.getByRole('button', { name: 'Open Class' }).click();
    screen.getByRole('button', { name: /Class analytics/ }).click();
    expect(push).toHaveBeenNthCalledWith(1, '/teacher/classroom');
    expect(push).toHaveBeenNthCalledWith(2, '/teacher/classroom/analytics');
  });
});
