'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

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

interface Option {
  id: string;
  name: string;
}

interface CreateAssessmentDialogProps {
  streams: Option[];
  learningAreas: Option[];
  terms: Option[];
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

function FormInput({
  label,
  required,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input {...props} />
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export function CreateAssessmentDialog({ streams, learningAreas, terms, onSuccess }: CreateAssessmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateAssessmentInput>({
    resolver: zodResolver(createAssessmentSchema),
    defaultValues: {
      type: 'cat',
      assessmentDate: new Date().toISOString().slice(0, 10), // required field, pre-filled with today
    },
  });

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
        throw new Error(err.error || 'Failed to create assessment');
      }
      toast.success('Assessment created as draft');
      setOpen(false);
      reset({ type: 'cat', assessmentDate: new Date().toISOString().slice(0, 10) });
      onSuccess?.();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
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
            Set up a CBC assessment for a class and learning area you are timetabled to teach this term.
          </DialogDescription>
        </DialogHeader>

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
                  items={terms.map((t) => ({ value: t.id, label: t.name }))}
                  error={errors.termId?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="streamId"
              render={({ field }) => (
                <FormSelect
                  label="Stream"
                  required
                  placeholder="Select stream"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={streams.map((s) => ({ value: s.id, label: s.name }))}
                  error={errors.streamId?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="learningAreaId"
              render={({ field }) => (
                <FormSelect
                  label="Learning Area"
                  required
                  placeholder="Select subject"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={learningAreas.map((la) => ({ value: la.id, label: la.name }))}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isSubmitting ? 'Creating…' : 'Create Draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}