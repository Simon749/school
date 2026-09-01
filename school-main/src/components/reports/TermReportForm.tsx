// src/components/reports/TermReportForm.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { generateTermReportSchema, GenerateTermReportInput } from "@/lib/validations/term-report.schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface TermReportFormProps {
  studentId: string;
  termId?: string;
  existingReport?: {
    classTeacherComment: string | null;
    principalComment: string | null;
    conduct: string | null;
  } | null;
}

export function TermReportForm({ studentId, termId, existingReport }: TermReportFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<GenerateTermReportInput>({
    resolver: zodResolver(generateTermReportSchema),
    defaultValues: {
      studentId,
      termId,
      classTeacherComment: existingReport?.classTeacherComment || "",
      conduct: (existingReport?.conduct as any) || undefined,
    },
  });

  const onSubmit = async (data: GenerateTermReportInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/results/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save report");
      }

      toast.success("Report saved successfully");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label>Class Teacher Comment</Label>
        <Textarea
          {...register("classTeacherComment")}
          placeholder="e.g., Amara has shown excellent progress in Mathematics this term. She participates actively in class discussions..."
          className="min-h-[120px]"
        />
        {errors.classTeacherComment && (
          <p className="text-sm text-red-500">{errors.classTeacherComment.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Conduct Rating</Label>
        <Select
          onValueChange={(v) => setValue("conduct", v as any)}
          defaultValue={existingReport?.conduct || undefined}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select conduct rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="excellent">Excellent</SelectItem>
            <SelectItem value="very_good">Very Good</SelectItem>
            <SelectItem value="good">Good</SelectItem>
            <SelectItem value="fair">Fair</SelectItem>
            <SelectItem value="needs_improvement">Needs Improvement</SelectItem>
          </SelectContent>
        </Select>
        {errors.conduct && <p className="text-sm text-red-500">{errors.conduct.message}</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Report"}
        </Button>
      </div>
    </form>
  );
}