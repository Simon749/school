"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WizardShell, StepNav } from "@/components/onboarding/WizardShell";
import { gradeStreamSchema } from "@/lib/validations/onboarding";

const ALL_GRADES = [
  { name: "PP1", level: 0, cbcStage: "pre_primary" as const },
  { name: "PP2", level: 1, cbcStage: "pre_primary" as const },
  { name: "Grade 1", level: 2, cbcStage: "lower_primary" as const },
  { name: "Grade 2", level: 3, cbcStage: "lower_primary" as const },
  { name: "Grade 3", level: 4, cbcStage: "lower_primary" as const },
  { name: "Grade 4", level: 5, cbcStage: "upper_primary" as const },
  { name: "Grade 5", level: 6, cbcStage: "upper_primary" as const },
  { name: "Grade 6", level: 7, cbcStage: "upper_primary" as const },
  { name: "Grade 7", level: 8, cbcStage: "jss" as const },
  { name: "Grade 8", level: 9, cbcStage: "jss" as const },
  { name: "Grade 9", level: 10, cbcStage: "jss" as const },
];

export default function Step4GradesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolId = searchParams.get("schoolId");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [streams, setStreams] = useState<Record<string, { name: string; capacity: number }[]>>(
    () => {
      const initial: Record<string, { name: string; capacity: number }[]> = {};
      ALL_GRADES.forEach((g) => {
        initial[g.name] = [{ name: "A", capacity: 40 }];
      });
      return initial;
    }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const toggleGrade = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const addStream = (gradeName: string) => {
    const current = streams[gradeName] || [];
    const nextLetter = String.fromCharCode(65 + current.length); // A, B, C...
    setStreams({
      ...streams,
      [gradeName]: [...current, { name: nextLetter, capacity: 40 }],
    });
  };

  const updateStream = (
    gradeName: string,
    idx: number,
    field: "name" | "capacity",
    value: string
  ) => {
    const current = [...(streams[gradeName] || [])];
    current[idx] = {
      ...current[idx],
      [field]: field === "capacity" ? parseInt(value) || 40 : value,
    };
    setStreams({ ...streams, [gradeName]: current });
  };

  const removeStream = (gradeName: string, idx: number) => {
    const current = [...(streams[gradeName] || [])];
    current.splice(idx, 1);
    setStreams({ ...streams, [gradeName]: current });
  };

  async function handleSubmit() {
    if (!schoolId) {
      setErrors({ form: "Missing school ID. Go back to Step 1." });
      return;
    }

    setLoading(true);
    setErrors({});

    const grades = ALL_GRADES.filter((g) => selected.has(g.name)).map((g) => ({
      ...g,
      streams: streams[g.name] || [],
    }));

    const parsed = gradeStreamSchema.safeParse({ grades });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        fieldErrors[issue.path.join(".")] = issue.message;
      });
      setErrors(fieldErrors);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/onboarding/step-4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, grades: parsed.data.grades }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");

      router.push(`/onboarding/step-6-done?schoolId=${schoolId}`);
    } catch (err: any) {
      setErrors({ form: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardShell currentStep={4}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Step 4: Grades & Streams</h2>
        <p className="text-sm text-gray-500 mt-1">
          Select which grades your school offers and configure streams.
        </p>
      </div>

      <div className="space-y-4">
        {ALL_GRADES.map((grade) => {
          const isSelected = selected.has(grade.name);
          return (
            <div
              key={grade.name}
              className={`border rounded-lg p-4 transition-colors ${
                isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleGrade(grade.name)}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <div>
                    <span className="font-semibold text-gray-900">{grade.name}</span>
                    <span className="text-xs text-gray-500 ml-2 capitalize">
                      ({grade.cbcStage.replace("_", " ")})
                    </span>
                  </div>
                </label>
              </div>

              {isSelected && (
                <div className="ml-8 space-y-2">
                  <p className="text-xs font-medium text-gray-600 mb-2">Streams:</p>
                  {(streams[grade.name] || []).map((stream, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <input
                        type="text"
                        value={stream.name}
                        onChange={(e) => updateStream(grade.name, idx, "name", e.target.value)}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                        placeholder="A"
                      />
                      <input
                        type="number"
                        value={stream.capacity}
                        onChange={(e) =>
                          updateStream(grade.name, idx, "capacity", e.target.value)
                        }
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                        min={1}
                        max={100}
                      />
                      <span className="text-xs text-gray-500">students max</span>
                      {idx > 0 && (
                        <button
                          onClick={() => removeStream(grade.name, idx)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addStream(grade.name)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add another stream
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {errors.form && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg mt-4">{errors.form}</p>
      )}

      <StepNav
        step={4}
        schoolId={schoolId || ""}
        backHref="/onboarding/step-3-calendar"
        isNextDisabled={selected.size === 0 || loading}
      />

      <div className="flex justify-end mt-4">
        <button
          onClick={handleSubmit}
          disabled={loading || selected.size === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue →"}
        </button>
      </div>
    </WizardShell>
  );
}