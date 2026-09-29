"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const steps = [
  { id: 1, label: "School Identity", path: "/onboarding/step-1-school" },
  { id: 2, label: "Geofence", path: "/onboarding/step-2-geofence" },
  { id: 3, label: "Calendar", path: "/onboarding/step-3-calendar" },
  { id: 4, label: "Grades & Streams", path: "/onboarding/step-4-grades" },
  { id: 5, label: "Fees", path: "/onboarding/step-5-fees" },
  { id: 6, label: "Done", path: "/onboarding/step-6-done" },
];

export function WizardShell({
  children,
  currentStep,
}: {
  children: ReactNode;
  currentStep: number;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {steps.map((s) => (
              <div
                key={s.id}
                className={`flex flex-col items-center ${
                  s.id === currentStep
                    ? "text-blue-600 font-semibold"
                    : s.id < currentStep
                    ? "text-blue-400"
                    : "text-gray-400"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm mb-1 ${
                    s.id === currentStep
                      ? "bg-blue-600 text-white"
                      : s.id < currentStep
                      ? "bg-blue-200 text-blue-700"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s.id < currentStep ? "✓" : s.id}
                </div>
              </div>
            ))}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(currentStep / 6) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            {steps.map((s) => (
              <span
                key={s.id}
                className={`text-[10px] uppercase tracking-wide ${
                  s.id === currentStep ? "text-blue-600 font-medium" : "text-gray-500"
                }`}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Content card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function StepNav({
  step,
  schoolId,
  backHref,
  nextHref,
  isNextDisabled = false,
}: {
  step: number;
  schoolId: string;
  backHref?: string;
  nextHref?: string;
  isNextDisabled?: boolean;
}) {
  return (
    <div className="flex justify-between items-center mt-8 pt-6 border-t">
      {backHref ? (
        <Link
          href={backHref}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← Back
        </Link>
      ) : (
        <div />
      )}

      {nextHref ? (
        <Link
          href={`${nextHref}?schoolId=${schoolId}`}
          className={`px-6 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 ${
            isNextDisabled ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          Continue →
        </Link>
      ) : null}
    </div>
  );
}