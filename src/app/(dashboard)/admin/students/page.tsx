"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, ChevronLeft, ChevronRight, Filter, Users } from "lucide-react";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  nemisNumber: string;
  admissionNumber: string | null;
  gender: string | null;
  isBoarding: boolean;
  status: string;
  stream: { name: string; grade: { name: string } };
  _count: { guardians: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function StudentsPage() {
  const router = useRouter();
  const urlParams = useSearchParams();

  const [students, setStudents] = useState<Student[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [grades, setGrades] = useState<{ id: string; name: string; streams: { id: string; name: string }[] }[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(urlParams.get("search") || "");
  const [gradeId, setGradeId] = useState(urlParams.get("gradeId") || "");
  const [streamId, setStreamId] = useState(urlParams.get("streamId") || "");

  const fetchGrades = useCallback(async () => {
    const res = await fetch("/api/grades");
    if (res.ok) {
      const data = await res.json();
      setGrades(data.grades || []);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(pagination.page));
    params.set("limit", String(pagination.limit));
    if (search) params.set("search", search);
    if (gradeId) params.set("gradeId", gradeId);
    if (streamId) params.set("streamId", streamId);

    try {
      const res = await fetch(`/api/students?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setStudents(data.students);
      setPagination(data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, gradeId, streamId]);

  useEffect(() => {
    fetchGrades();
  }, [fetchGrades]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const selectedGrade = grades.find((g) => g.id === gradeId);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pagination.total} total enrolment{pagination.total !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/admin/students/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Enrol Student
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              placeholder="Search by name, NEMIS, or admission number..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={gradeId}
            onChange={(e) => {
              setGradeId(e.target.value);
              setStreamId("");
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Grades</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <select
            value={streamId}
            onChange={(e) => {
              setStreamId(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            disabled={!gradeId}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">All Streams</option>
            {selectedGrade?.streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">NEMIS / Admission</th>
                <th className="px-6 py-3">Grade & Stream</th>
                <th className="px-6 py-3">Gender</th>
                <th className="px-6 py-3">Boarding</th>
                <th className="px-6 py-3">Guardians</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    Loading students...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    No students found.{" "}
                    <Link href="/admin/students/new" className="text-blue-600 hover:underline">
                      Enrol your first student
                    </Link>
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/admin/students/${s.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {s.firstName} {s.lastName}
                      </div>
                      {s.status !== "active" && (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">
                          {s.status.replace("_", " ")}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div>{s.nemisNumber}</div>
                      {s.admissionNumber && (
                        <div className="text-xs text-gray-400">Adm: {s.admissionNumber}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">
                        {s.stream.grade.name} {s.stream.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 capitalize text-gray-600">{s.gender || "—"}</td>
                    <td className="px-6 py-4">
                      {s.isBoarding ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                          Boarding
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-50 text-gray-500 rounded-full border border-gray-100">
                          Day
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-gray-600">
                        <Users className="w-3.5 h-3.5" />
                        <span>{s._count.guardians}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/students/${s.id}`}
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

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}