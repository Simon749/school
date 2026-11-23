// src/components/results/MarksEntryTable.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
}
interface SubStrand {
  id: string;
  name: string;
  strandName: string;
}
interface ExistingResult {
  id: string;
  studentId: string;
  marksObtained: number | string | null;
  teacherComment: string | null;
  resultStatus?: 'scored' | 'absent' | 'not_entered';
  rubricScores: { id: string; subStrandId: string; score: string; comment: string | null }[];
}

interface MarksEntryTableProps {
  assessmentId: string;
  students: Student[];
  subStrands: SubStrand[];
  existingResults: ExistingResult[];
  isLocked: boolean;
  hasRubric: boolean;
  maxMarks?: number;
}

type ResultStatus = 'scored' | 'absent' | 'not_entered';
type StudentState = {
  marksObtained: string;
  teacherComment: string;
  resultStatus: ResultStatus;
  rubricScores: Record<string, string>;
};
type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const emptyStudentState = (): StudentState => ({
  marksObtained: '',
  teacherComment: '',
  resultStatus: 'not_entered',
  rubricScores: {},
});

export function MarksEntryTable({
  assessmentId,
  students,
  subStrands,
  existingResults,
  isLocked,
  hasRubric,
  maxMarks,
}: MarksEntryTableProps) {
  const router = useRouter();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isPublishing, setIsPublishing] = useState(false);
  const [studentStates, setStudentStates] = useState<Record<string, StudentState>>(() => {
    const initial: Record<string, StudentState> = {};
    for (const student of students) {
      const existing = existingResults.find((result) => result.studentId === student.id);
      const rubricScores = Object.fromEntries(
        (existing?.rubricScores ?? []).map((score) => [score.subStrandId, score.score])
      );
      const marks = existing?.marksObtained;
      initial[student.id] = {
        marksObtained: marks == null ? '' : String(marks),
        teacherComment: existing?.teacherComment ?? '',
        resultStatus:
          existing?.resultStatus ??
          (marks != null || Object.keys(rubricScores).length > 0 ? 'scored' : 'not_entered'),
        rubricScores,
      };
    }
    return initial;
  });

  // Keep the latest values outside React's render cycle so a debounced save
  // never captures the previous render's state.
  const latestStatesRef = useRef(studentStates);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);

  const buildPayload = useCallback(() => {
    return Object.entries(latestStatesRef.current).map(([studentId, state]) => ({
      studentId,
      resultStatus: state.resultStatus,
      marksObtained:
        state.resultStatus === 'absent'
          ? 0
          : state.marksObtained.trim() === ''
            ? null
            : Number(state.marksObtained),
      teacherComment: state.teacherComment.trim() || null,
      rubricScores: hasRubric
        ? Object.entries(state.rubricScores)
            .filter(([, score]) => score !== '')
            .map(([subStrandId, score]) => ({ subStrandId, score }))
        : undefined,
    }));
  }, [hasRubric]);

  const saveLatest = useCallback(async (): Promise<boolean> => {
    if (isLocked) return true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (savePromiseRef.current) {
      const previousSucceeded = await savePromiseRef.current;
      if (!previousSucceeded) return false;
      if (savedRevisionRef.current < revisionRef.current) return saveLatest();
      return true;
    }

    if (savedRevisionRef.current === revisionRef.current) return true;

    const savingRevision = revisionRef.current;
    const payload = buildPayload();
    setSaveStatus('saving');

    const request = (async () => {
      try {
        const response = await fetch(`/api/assessments/${assessmentId}/results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ results: payload }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || 'Unable to save assessment results');
        }
        savedRevisionRef.current = savingRevision;
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save results');
        return false;
      }
    })();

    savePromiseRef.current = request;
    const succeeded = await request;
    if (savePromiseRef.current === request) savePromiseRef.current = null;

    if (!mountedRef.current) return succeeded;
    if (!succeeded) {
      setSaveStatus('error');
      return false;
    }
    if (savedRevisionRef.current < revisionRef.current) {
      setSaveStatus('dirty');
      return saveLatest();
    }
    setSaveStatus('saved');
    return true;
  }, [assessmentId, buildPayload, isLocked]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveLatest();
    }, 1200);
  }, [saveLatest]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      // Do not claim a pending request was saved. The explicit Save button and
      // publish action both flush pending changes before proceeding.
    };
  }, []);

  const updateStudent = (studentId: string, patch: Partial<StudentState>) => {
    const current = latestStatesRef.current[studentId] ?? emptyStudentState();
    const next = { ...current, ...patch };
    latestStatesRef.current = { ...latestStatesRef.current, [studentId]: next };
    setStudentStates(latestStatesRef.current);
    revisionRef.current += 1;
    setSaveStatus('dirty');
    scheduleSave();
  };

  const updateMarks = (studentId: string, value: string) => {
    const parsed = value.trim() === '' ? null : Number(value);
    if (
      parsed !== null &&
      (!Number.isFinite(parsed) ||
        parsed < 0 ||
        (maxMarks != null && parsed > maxMarks))
    ) {
      toast.error(
        maxMarks != null
          ? `Enter a mark between 0 and ${maxMarks}`
          : 'Enter a valid non-negative mark'
      );
      return;
    }
    updateStudent(studentId, {
      marksObtained: value,
      resultStatus: value.trim() === '' ? 'not_entered' : 'scored',
    });
  };

  const updateRubricScore = (studentId: string, subStrandId: string, score: string) => {
    const current = latestStatesRef.current[studentId] ?? emptyStudentState();
    const rubricScores = { ...current.rubricScores, [subStrandId]: score };
    const hasAnyScore = Object.values(rubricScores).some(Boolean);
    updateStudent(studentId, {
      rubricScores,
      resultStatus:
        current.resultStatus === 'absent' ? 'absent' : hasAnyScore ? 'scored' : 'not_entered',
    });
  };

  const updateResultStatus = (studentId: string, status: Exclude<ResultStatus, 'scored'>) => {
    const current = latestStatesRef.current[studentId] ?? emptyStudentState();
    updateStudent(studentId, {
      resultStatus: status,
      marksObtained:
        status === 'absent' ? '0' : status === 'not_entered' ? '' : current.marksObtained,
      rubricScores: status === 'absent' || status === 'not_entered' ? {} : current.rubricScores,
    });
  };

  const handlePublish = async () => {
    if (
      !confirm('Publish these results to parents? They will be able to see them immediately.')
    ) {
      return;
    }
    setIsPublishing(true);
    try {
      const saved = await saveLatest();
      if (!saved) {
        throw new Error('Some changes could not be saved. Resolve the save error before publishing.');
      }
      const response = await fetch(`/api/assessments/${assessmentId}/publish`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to publish results');
      }
      toast.success('Results published successfully!');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to publish results.');
    } finally {
      setIsPublishing(false);
    }
  };

  const statusLabel: Record<ResultStatus, string> = {
    scored: 'Scored',
    absent: 'Absent (0)',
    not_entered: 'Not entered',
  };

  return (
    <div
      className="space-y-4"
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
          void saveLatest();
        }
      }}
    >
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2" aria-live="polite">
          {saveStatus === 'saving' && <Badge variant="outline">Saving...</Badge>}
          {saveStatus === 'dirty' && <Badge variant="outline">Unsaved changes</Badge>}
          {saveStatus === 'saved' && <Badge variant="secondary">All changes saved</Badge>}
          {saveStatus === 'error' && <Badge variant="destructive">Save failed</Badge>}
        </div>
        <div className="flex gap-2">
          {!isLocked && (
            <>
              <Button
                variant="outline"
                onClick={() => void saveLatest()}
                disabled={
                  saveStatus === 'saving' || saveStatus === 'saved' || saveStatus === 'idle'
                }
              >
                Save changes
              </Button>
              <Button onClick={handlePublish} disabled={isPublishing || saveStatus === 'saving'}>
                {isPublishing ? 'Publishing...' : 'Publish to Parents'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Adm No</TableHead>
              <TableHead>Student Name</TableHead>
              <TableHead className="min-w-[150px]">Result status</TableHead>
              {!hasRubric && (
                <TableHead className="w-[140px]">
                  Marks {maxMarks != null ? `(/ ${maxMarks})` : ''}
                </TableHead>
              )}
              {hasRubric &&
                subStrands.map((ss) => (
                <TableHead key={ss.id} className="min-w-[120px]">
                  <div className="text-xs font-normal text-muted-foreground">{ss.strandName}</div>
                  <div className="text-sm font-medium">{ss.name}</div>
                </TableHead>
              ))}
              <TableHead className="w-[200px]">Teacher Comment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => {
              const state = studentStates[student.id] ?? emptyStudentState();
              return (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">{student.admissionNumber || '-'}</TableCell>
                  <TableCell>{student.firstName} {student.lastName}</TableCell>
                  <TableCell>
                    <Select
                      value={state.resultStatus}
                      onValueChange={(value: string | null) =>
                        updateResultStatus(
                          student.id,
                          (value || 'not_entered') as Exclude<ResultStatus, 'scored'>
                        )
                      }
                      disabled={isLocked}
                    >
                      <SelectTrigger className="min-w-[140px]">
                        <SelectValue>{statusLabel[state.resultStatus]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_entered">Not entered</SelectItem>
                        <SelectItem value="scored" disabled>Scored</SelectItem>
                        <SelectItem value="absent">Absent (0)</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {!hasRubric && (
                    <TableCell>
                      <Input
                        type="number"
                        value={state.marksObtained}
                        onChange={(event) => updateMarks(student.id, event.target.value)}
                        disabled={isLocked || state.resultStatus === 'absent'}
                        max={maxMarks}
                        min={0}
                        step="0.01"
                      />
                    </TableCell>
                  )}

                  {hasRubric &&
                    subStrands.map((ss) => (
                    <TableCell key={ss.id}>
                      <Select
                        value={state.rubricScores[ss.id] ?? ''}
                        onValueChange={(value: string | null) =>
                          updateRubricScore(student.id, ss.id, value || '')
                        }
                        disabled={isLocked || state.resultStatus === 'absent'}
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EE">EE</SelectItem>
                          <SelectItem value="ME">ME</SelectItem>
                          <SelectItem value="AE">AE</SelectItem>
                          <SelectItem value="BE">BE</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  ))}

                  <TableCell>
                    <Textarea
                      value={state.teacherComment}
                      onChange={(event) =>
                        updateStudent(student.id, { teacherComment: event.target.value })
                      }
                      disabled={isLocked}
                      className="min-h-[60px]"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Mark a learner as Absent only when their absence is confirmed. Not entered blocks
        publication.
      </p>
    </div>
  );
}
