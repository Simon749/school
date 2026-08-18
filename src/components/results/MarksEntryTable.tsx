// src/components/results/MarksEntryTable.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner"; // Ensure you have sonner installed, or swap for your toast lib
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";

interface Student { id: string; firstName: string; lastName: string; admissionNumber: string | null; }
interface SubStrand { id: string; name: string; strandName: string; }
interface ExistingResult {
  id: string; studentId: string; marksObtained: number | null; teacherComment: string | null;
  rubricScores: { id: string; subStrandId: string; score: string; comment: string | null; }[];
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

type StudentState = {
  marksObtained: string;
  teacherComment: string;
  rubricScores: Record<string, string>; // subStrandId -> score (EE/ME/AE/BE)
};

export function MarksEntryTable({
  assessmentId, students, subStrands, existingResults, isLocked, hasRubric, maxMarks,
}: MarksEntryTableProps) {
  const router = useRouter();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [isPublishing, setIsPublishing] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize state from existing results
  const [studentStates, setStudentStates] = useState<Record<string, StudentState>>(() => {
    const initial: Record<string, StudentState> = {};
    students.forEach((student) => {
      const existing = existingResults.find((r) => r.studentId === student.id);
      initial[student.id] = {
        marksObtained: existing?.marksObtained?.toString() ?? "",
        teacherComment: existing?.teacherComment ?? "",
        rubricScores: existing?.rubricScores.reduce((acc, score) => {
          acc[score.subStrandId] = score.score;
          return acc;
        }, {} as Record<string, string>) ?? {},
      };
    });
    return initial;
  });

  // Debounced auto-save (2 seconds of inactivity)
  const triggerSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const payload = Object.entries(studentStates).map(([studentId, state]) => ({
          studentId,
          marksObtained: state.marksObtained ? parseFloat(state.marksObtained) : null,
          teacherComment: state.teacherComment || null,
          rubricScores: hasRubric
            ? Object.entries(state.rubricScores).map(([subStrandId, score]) => ({ subStrandId, score }))
            : undefined,
        }));

        const res = await fetch(`/api/assessments/${assessmentId}/results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results: payload }),
        });

        if (!res.ok) throw new Error("Failed to save");
        setSaveStatus("saved");
      } catch (error) {
        toast.error("Failed to auto-save marks. Please check your connection.");
        setSaveStatus("idle");
      }
    }, 2000);
  }, [studentStates, assessmentId, hasRubric]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  const updateStudentState = (studentId: string, field: keyof StudentState, value: any) => {
    setStudentStates((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
    triggerSave();
  };

  const updateRubricScore = (studentId: string, subStrandId: string, score: string) => {
    setStudentStates((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        rubricScores: { ...prev[studentId].rubricScores, [subStrandId]: score },
      },
    }));
    triggerSave();
  };

  const handlePublish = async () => {
    if (!confirm("Publish these results to parents? They will be able to see them immediately.")) return;
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/publish`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to publish");
      toast.success("Results published successfully!");
      router.refresh();
    } catch (error) {
      toast.error("Failed to publish results.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && <Badge variant="outline">Saving...</Badge>}
          {saveStatus === "saved" && <Badge variant="secondary">All changes saved</Badge>}
        </div>
        {!isLocked && (
          <Button onClick={handlePublish} disabled={isPublishing}>
            {isPublishing ? "Publishing..." : "Publish to Parents"}
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Adm No</TableHead>
              <TableHead>Student Name</TableHead>
              {!hasRubric && maxMarks && (
                <TableHead className="w-[120px]">Marks (/{maxMarks})</TableHead>
              )}
              {hasRubric && subStrands.map((ss) => (
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
              const state = studentStates[student.id];
              return (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">{student.admissionNumber || "-"}</TableCell>
                  <TableCell>{student.firstName} {student.lastName}</TableCell>
                  
                  {!hasRubric && maxMarks && (
                    <TableCell>
                      <Input
                        type="number"
                        value={state.marksObtained}
                        onChange={(e) => updateStudentState(student.id, "marksObtained", e.target.value)}
                        disabled={isLocked}
                        max={maxMarks}
                        min={0}
                      />
                    </TableCell>
                  )}
                  
                  {hasRubric && subStrands.map((ss) => (
                    <TableCell key={ss.id}>
                      <Select
                        value={state.rubricScores[ss.id] || ""}
                        onValueChange={(val) => updateRubricScore(student.id, ss.id, val)}
                        disabled={isLocked}
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
                      onChange={(e) => updateStudentState(student.id, "teacherComment", e.target.value)}
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
    </div>
  );
}