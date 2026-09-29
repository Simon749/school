"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Check } from "lucide-react";

interface Stream {
  id: string;
  name: string;
  grade: { name: string };
}

interface LearningArea {
  id: string;
  name: string;
  cbcStage: string;
}

export default function NewTeacherPage() {
  const router = useRouter();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [learningAreas, setLearningAreas] = useState<LearningArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    nationalId: "",
    tscNumber: "",
    employmentType: "bom" as "tsc" | "bom",
    specialisation: [] as string[],
    isClassTeacher: false,
    classTeacherStreamId: "",
  });

  const fetchData = useCallback(async () => {
    const [streamsRes, areasRes] = await Promise.all([
      fetch("/api/grades"),
      fetch("/api/learning-areas"),
    ]);
    if (streamsRes.ok) {
      const data = await streamsRes.json();
      const allStreams = (data.grades || []).flatMap((g: any) =>
        g.streams.map((s: any) => ({ ...s, grade: { name: g.name } }))
      );
      setStreams(allStreams);
    }
    if (areasRes.ok) {
      const data = await areasRes.json();
      setLearningAreas(data.areas || []);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const res = await fetch("/api/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add teacher");

      router.push(`/admin/teachers/${json.teacher.id}`);
    } catch (err: any) {
      setErrors({ form: err.message });
    } finally {
      setLoading(false);
    }
  }

  const toggleSpecialisation = (name: string) => {
    setForm((prev) => ({
      ...prev,
      specialisation: prev.specialisation.includes(name)
        ? prev.specialisation.filter((s) => s !== name)
        : [...prev.specialisation, name],
    }));
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/teachers"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to teachers
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add New Teacher</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 space-y-6">
        {errors.form && (
          <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
            {errors.form}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
            <input
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
            <input
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone (2547XXXXXXXX)</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="2547XXXXXXXX"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">National ID</label>
            <input
              value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">TSC Number</label>
            <input
              value={form.tscNumber}
              onChange={(e) => setForm({ ...form, tscNumber: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type *</label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="employmentType"
                  value="tsc"
                  checked={form.employmentType === "tsc"}
                  onChange={(e) => setForm({ ...form, employmentType: e.target.value as "tsc" | "bom" })}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">TSC (Government)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="employmentType"
                  value="bom"
                  checked={form.employmentType === "bom"}
                  onChange={(e) => setForm({ ...form, employmentType: e.target.value as "tsc" | "bom" })}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">BOM (Board of Management)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Learning Area Specialisations</label>
          <div className="flex flex-wrap gap-2">
            {learningAreas.map((area) => {
              const selected = form.specialisation.includes(area.name);
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => toggleSpecialisation(area.name)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selected
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {selected && <Check className="w-3 h-3 inline mr-1" />}
                  {area.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t pt-6">
          <label className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              checked={form.isClassTeacher}
              onChange={(e) => setForm({ ...form, isClassTeacher: e.target.checked, classTeacherStreamId: "" })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm font-medium text-gray-700">Assign as Class Teacher</span>
          </label>

          {form.isClassTeacher && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stream *</label>
              <select
                required={form.isClassTeacher}
                value={form.classTeacherStreamId}
                onChange={(e) => setForm({ ...form, classTeacherStreamId: e.target.value })}
                className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select stream</option>
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.grade.name} {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t">
          <Link
            href="/admin/teachers"
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
            {loading ? "Adding..." : "Add Teacher"}
          </button>
        </div>
      </form>
    </div>
  );
}