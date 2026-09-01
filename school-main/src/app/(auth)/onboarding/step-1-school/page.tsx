"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WizardShell, StepNav } from "@/components/onboarding/WizardShell";
import { schoolIdentitySchema } from "@/lib/validations/onboarding";
import { z } from "zod";

export default function Step1SchoolPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolId = searchParams.get("schoolId");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      knecCode: formData.get("knecCode") as string,
      county: formData.get("county") as string,
      subCounty: formData.get("subCounty") as string,
      phone: formData.get("phone") as string,
      email: formData.get("email") as string,
      logoUrl: formData.get("logoUrl") as string,
    };

    const parsed = schoolIdentitySchema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0]] = issue.message;
      });
      setErrors(fieldErrors);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/onboarding/step-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, schoolId: schoolId || undefined }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");

      // Redirect to next step with schoolId
      router.push(`/onboarding/step-3-calendar?schoolId=${json.school.id}`);
    } catch (err: any) {
      setErrors({ form: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardShell currentStep={1}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Step 1: School Identity</h2>
        <p className="text-sm text-gray-500 mt-1">
          Let's start with the basics about your school.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              School Name *
            </label>
            <input
              name="name"
              type="text"
              defaultValue="EduTrack Pilot School"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Bright Star Academy"
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              KNEC Code
            </label>
            <input
              name="knecCode"
              type="text"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              County *
            </label>
            <input
              name="county"
              type="text"
              defaultValue="Nairobi"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.county && <p className="text-xs text-red-600 mt-1">{errors.county}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sub-County *
            </label>
            <input
              name="subCounty"
              type="text"
              defaultValue="Westlands"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.subCounty && <p className="text-xs text-red-600 mt-1">{errors.subCounty}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone (254XXXXXXXXX) *
            </label>
            <input
              name="phone"
              type="tel"
              defaultValue="254712345678"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              name="email"
              type="email"
              defaultValue="admin@testschool.edu"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Logo URL
            </label>
            <input
              name="logoUrl"
              type="url"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://... (optional)"
            />
          </div>
        </div>

        {errors.form && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{errors.form}</p>
        )}

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Continue →"}
          </button>
        </div>
      </form>
    </WizardShell>
  );
}