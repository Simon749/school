"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { WizardShell } from "@/components/onboarding/WizardShell";

export default function Step6DonePage() {
  const searchParams = useSearchParams();
  const schoolId = searchParams.get("schoolId");

  return (
    <WizardShell currentStep={6}>
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">School Setup Complete!</h2>
        <p className="text-gray-600 mb-8">
          Your school is configured and ready. Here's what's set up:
        </p>

        <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto mb-8">
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-center gap-2">✓ School identity saved</li>
            <li className="flex items-center gap-2">✓ Academic calendar configured</li>
            <li className="flex items-center gap-2">✓ Grades and streams created</li>
            <li className="flex items-center gap-2 text-gray-400">
              ○ Fee structure (you can set this up later in the bursar panel)
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3 max-w-xs mx-auto">
          <Link
            href="/admin/students/import"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 text-center"
          >
            Import Students via CSV
          </Link>
          <Link
            href="/admin/teachers/new"
            className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 text-center"
          >
            Add Teachers Manually
          </Link>
          <Link
            href="/admin"
            className="px-6 py-3 text-blue-600 text-sm font-medium hover:text-blue-800 text-center"
          >
            Go to Dashboard →
          </Link>
        </div>
      </div>
    </WizardShell>
  );
}