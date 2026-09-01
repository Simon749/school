// src/components/assessment/CreateAssessmentDialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAssessmentSchema, CreateAssessmentInput } from "@/lib/validations/assessment.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CreateAssessmentDialogProps {
  streams: { id: string; name: string }[];
  learningAreas: { id: string; name: string }[];
  terms: { id: string; name: string }[];
  onSuccess: () => void;
}

export function CreateAssessmentDialog({ streams, learningAreas, terms, onSuccess }: CreateAssessmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<CreateAssessmentInput>({
    resolver: zodResolver(createAssessmentSchema),
    defaultValues: { type: "cat" },
  });

  const onSubmit = async (data: CreateAssessmentInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create assessment");
      }

      toast.success("Assessment created successfully");
      setOpen(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>+ New Assessment</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Assessment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input {...register("title")} placeholder="e.g., Term 1 Math CAT 1" />
              {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select onValueChange={(v) => setValue("type", v as any)} defaultValue="cat">
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cat">CAT</SelectItem>
                  <SelectItem value="exam">Exam</SelectItem>
                  <SelectItem value="assignment">Assignment</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="portfolio">Portfolio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Term</Label>
              <Select onValueChange={(v: string | null) => {
                if (v) setValue("termId", v);
              }}>
                <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                <SelectContent>
                  {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.termId && <p className="text-sm text-red-500">{errors.termId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Stream</Label>
              <Select onValueChange={(v: string | null) => {
                if (v) setValue("streamId", v);
              }}>
                <SelectTrigger><SelectValue placeholder="Select stream" /></SelectTrigger>
                <SelectContent>
                  {streams.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.streamId && <p className="text-sm text-red-500">{errors.streamId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Learning Area</Label>
              <Select onValueChange={(v: string | null) => {
                if (v) setValue("learningAreaId", v);
              }}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {learningAreas.map((la) => <SelectItem key={la.id} value={la.id}>{la.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.learningAreaId && <p className="text-sm text-red-500">{errors.learningAreaId.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" {...register("assessmentDate")} />
              {errors.assessmentDate && <p className="text-sm text-red-500">{errors.assessmentDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Max Marks</Label>
              <Input type="number" {...register("maxMarks")} placeholder="e.g., 50" />
            </div>
            <div className="space-y-2">
              <Label>Weight (%)</Label>
              <Input type="number" {...register("weightPercent")} placeholder="e.g., 20" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Instructions (Optional)</Label>
            <Textarea {...register("instructions")} placeholder="Instructions for students or grading notes..." />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}