"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Grade {
  id: string;
  name: string;
  streams: { id: string; name: string }[];
}

export default function NewStudentPage() {
  const router = useRouter();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedGrade, setSelectedGrade] = useState("");

  const fetchGrades = useCallback(async () => {
    const res = await fetch("/api/grades");
    if (res.ok) {
      const data = await res.json();
      setGrades(data.grades || []);
    }
  }, []);

  useEffect(() => {
    fetchGrades();
  }, [fetchGrades]);

  const currentGrade = grades.find((g) => g.id === selectedGrade);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      nemisNumber: formData.get("nemisNumber") as string,
      admissionNumber: formData.get("admissionNumber") as string,
      dateOfBirth: formData.get("dateOfBirth") as string,
      gender: formData.get("gender") as string,
      streamId: formData.get("streamId") as string,
      isBoarding: formData.get("isBoarding") === "on",
      photoUrl: formData.get("photoUrl") as string,
      medicalNotes: formData.get("medicalNotes") as string,
      previousSchool: formData.get("previousSchool") as string,
    };

    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to enrol student");

      router.push(`/admin/students/${json.student.id}`);
    } catch (err: any) {
      setErrors({ form: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to students
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Enrol New Student</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 space-y-6">
        {errors.form && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
            {errors.form}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name *
            </label>
            <input
              name="firstName"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name *
            </label>
            <input
              name="lastName"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NEMIS Number *
            </label>
            <input
              name="nemisNumber"
              required
              placeholder="e.g. 1234567890"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admission Number
            </label>
            <input
              name="admissionNumber"
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              name="dateOfBirth"
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender
            </label>
            <select
              name="gender"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grade *
            </label>
            <select
              required
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select grade</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stream *
            </label>
            <select
              name="streamId"
              required
              disabled={!selectedGrade}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">Select stream</option>
              {currentGrade?.streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photo URL
            </label>
            <input
              name="photoUrl"
              type="url"
              placeholder="https://... (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Previous School
            </label>
            <input
              name="previousSchool"
              placeholder="If transfer student"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medical Notes
            </label>
            <textarea
              name="medicalNotes"
              rows={3}
              placeholder="Allergies, conditions, etc. (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t">
          <input
            type="checkbox"
            name="isBoarding"
            id="isBoarding"
            className="w-4 h-4 text-blue-600 rounded"
          />
          <label htmlFor="isBoarding" className="text-sm text-gray-700">
            Boarding student
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Link
            href="/admin/students"
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Enrolling..." : "Enrol Student"}
          </button>
        </div>
      </form>
    </div>
  );
}