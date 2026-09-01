"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, GraduationCap, Users, ShieldCheck } from "lucide-react";

interface Teacher {
  id: string;
  tscNumber: string | null;
  employmentType: string;
  isClassTeacher: boolean;
  specialisation: string | null;
  user: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    nationalId: string | null;
    isActive: boolean;
  };
  classTeacherStream: { name: string; grade: { name: string } } | null;
}

export default function TeachersPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/teachers?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setTeachers(data.teachers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teachers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {teachers.length} teacher{teachers.length !== 1 ? "s" : ""} on staff
          </p>
        </div>
        <Link
          href="/admin/teachers/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add Teacher
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, TSC number, or National ID..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-3">Teacher</th>
                <th className="px-6 py-3">TSC / Type</th>
                <th className="px-6 py-3">Class Teacher</th>
                <th className="px-6 py-3">Specialisation</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    Loading teachers...
                  </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    No teachers found.{" "}
                    <Link href="/admin/teachers/new" className="text-blue-600 hover:underline">
                      Add your first teacher
                    </Link>
                  </td>
                </tr>
              ) : (
                teachers.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/admin/teachers/${t.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {t.user.firstName} {t.user.lastName}
                      </div>
                      <div className="text-xs text-gray-500">{t.user.email || t.user.phone || "No contact"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900">{t.tscNumber || "—"}</div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        t.employmentType === "tsc"
                          ? "bg-blue-50 text-blue-700 border-blue-100"
                          : "bg-gray-50 text-gray-600 border-gray-100"
                      }`}>
                        {t.employmentType.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {t.isClassTeacher && t.classTeacherStream ? (
                        <div className="flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-sm text-gray-900">
                            {t.classTeacherStream.grade.name} {t.classTeacherStream.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-xs truncate">
                      {t.specialisation || "—"}
                    </td>
                    <td className="px-6 py-4">
                      {t.user.isActive ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100">
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/teachers/${t.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}