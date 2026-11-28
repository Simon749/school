'use client';

import { forwardRef, useEffect, useId, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import type {
  ClassOption,
  SubjectOption,
  TeachingCombo,
  TermOption,
} from '@/lib/assessments/teaching-options';

import {
  createAssessmentSchema,
  type CreateAssessmentInput,
} from '@/lib/validations/assessment.schema';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateAssessmentDialogProps {
  terms: TermOption[];
  /** Classes as "Grade 5 A": the grade AND the stream. */
  classes: ClassOption[];
  learningAreas: SubjectOption[];
  /** Exactly the term + class + subject combinations this teacher is timetabled to teach. */
  combos: TeachingCombo[];
  onSuccess?: () => void;
}

const TYPE_OPTIONS: { value: CreateAssessmentInput['type']; label: string }[] = [
  { value: 'cat', label: 'CAT' },
  { value: 'exam', label: 'Exam' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'knec_external', label: 'KNEC External' },
];

/** A Base-UI select that shows the LABEL (not the raw id) via the `items` prop. */
function FormSelect({
  label,
  required,
  placeholder,
  value,
  onChange,
  items,
  error,
}: {
  label: string;
  required?: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {/* items => Select.Value renders the label instead of the raw UUID */}
      <Select value={value || undefined} onValueChange={(v) => onChange(String(v ?? ''))} items={items}>
        <FormControlledTrigger>
          <SelectValue placeholder={placeholder} />
        </FormControlledTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem key={it.value} value={it.value}>
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

// Thin wrapper so the trigger fills the column width (repo trigger is w-fit by default)
function FormControlledTrigger({ children }: { children: React.ReactNode }) {
  return <SelectTrigger className="w-full">{children}</SelectTrigger>;
}

const FormInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean; error?: string }
>(function FormInput({ label, required, error, ...props }, ref) {
  // The label is tied to its input (screen readers, and clicking the label focuses the field).
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
});

export function CreateAssessmentDialog({
  terms,
  classes,
  learningAreas,
  combos,
  onSuccess,
}: CreateAssessmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateAssessmentInput>({
    resolver: zodResolver(createAssessmentSchema),
    defaultValues: {
      type: 'cat',
      assessmentDate: new Date().toISOString().slice(0, 10), // required field, pre-filled with today
    },
  });

  const termId = watch('termId');
  const streamId = watch('streamId');
  const learningAreaId = watch('learningAreaId');

  const termItems = terms.filter((t) => combos.some((c) => c.termId === t.id));
  const classItems = classes.filter((c) =>
    combos.some((x) => x.termId === termId && x.streamId === c.id)
  );
  const areaItems = learningAreas.filter((a) =>
    combos.some((x) => x.termId === termId && x.streamId === streamId && x.learningAreaId === a.id)
  );

  // Keep Term -> Class -> Subject consistent: a choice that is no longer valid is cleared, and when
  // only one choice is left it is picked for the teacher (no pointless clicking).
  useEffect(() => {
    const valid = Array.from(new Set(combos.map((c) => c.termId)));
    if (!valid.includes(termId ?? '')) {
      const current = terms.find((t) => t.isCurrent && valid.includes(t.id));
      setValue('termId', (current?.id ?? valid[0]) as string);
    }
  }, [combos, terms, termId, setValue]);

  useEffect(() => {
    const valid = Array.from(
      new Set(combos.filter((c) => c.termId === termId).map((c) => c.streamId))
    );
    if (!valid.includes(streamId ?? '')) {
      setValue('streamId', (valid.length === 1 ? valid[0] : undefined) as string);
    }
  }, [combos, termId, streamId, setValue]);

  useEffect(() => {
    const valid = combos
      .filter((c) => c.termId === termId && c.streamId === streamId)
      .map((c) => c.learningAreaId);
    if (!valid.includes(learningAreaId ?? '')) {
      setValue('learningAreaId', (valid.length === 1 ? valid[0] : undefined) as string);
    }
  }, [combos, termId, streamId, learningAreaId, setValue]);

  const hasTimetable = combos.length > 0;

  const onSubmit = async (data: CreateAssessmentInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail =
          Array.isArray(err.details) && err.details.length > 0
            ? err.details.map((d: { message?: string }) => d.message).filter(Boolean).join(' ')
            : '';
        throw new Error(detail || err.error || 'Could not create the assessment.');
      }
      toast.success('Assessment created as draft');
      setOpen(false);
      reset({ type: 'cat', assessmentDate: new Date().toISOString().slice(0, 10) });
      onSuccess?.();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the assessment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>+ New Assessment</Button>} />
      {/* sm:max-w-2xl overrides the dialog base's sm:max-w-sm → no more horizontal scroll */}
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Assessment</DialogTitle>
          <DialogDescription>
            Set up a CBC assessment for a class and subject you are timetabled to teach.
          </DialogDescription>
        </DialogHeader>

        {!hasTimetable && (
          <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            You are not timetabled to teach any class yet, so there is nothing to set an assessment
            for. Ask the school admin to add you to the timetable.
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormInput
              label="Title"
              required
              placeholder="e.g., Term 1 Math CAT 1"
              {...register('title')}
              error={errors.title?.message}
            />
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <FormSelect
                  label="Type"
                  required
                  placeholder="Select type"
                  value={field.value}
                  onChange={field.onChange}
                  items={TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
                  error={errors.type?.message}
                />
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="termId"
              render={({ field }) => (
                <FormSelect
                  label="Term"
                  required
                  placeholder="Select term"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={termItems.map((t) => ({ value: t.id, label: t.name }))}
                  error={errors.termId?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="streamId"
              render={({ field }) => (
                <FormSelect
                  label="Class"
                  required
                  placeholder="Select class"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={classItems.map((c) => ({ value: c.id, label: c.label }))}
                  error={errors.streamId?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="learningAreaId"
              render={({ field }) => (
                <FormSelect
                  label="Subject"
                  required
                  placeholder="Select subject"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={areaItems.map((a) => ({ value: a.id, label: a.name }))}
                  error={errors.learningAreaId?.message}
                />
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormInput
              label="Date"
              required
              type="date"
              {...register('assessmentDate')}
              error={errors.assessmentDate?.message}
            />
            <FormInput
              label="Max Marks"
              type="number"
              min={1}
              placeholder="e.g., 50"
              {...register('maxMarks', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              error={errors.maxMarks?.message}
            />
            <FormInput
              label="Weight (%)"
              type="number"
              min={0}
              max={100}
              placeholder="e.g., 20"
              {...register('weightPercent', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              error={errors.weightPercent?.message}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Instructions (optional)</Label>
            <Textarea
              placeholder="Instructions for students or grading notes…"
              rows={3}
              {...register('instructions')}
            />
            {errors.instructions && (
              <p className="text-xs font-medium text-destructive">{errors.instructions.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !hasTimetable}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isSubmitting ? 'Creating…' : 'Create Draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}