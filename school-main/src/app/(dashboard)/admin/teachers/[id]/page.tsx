"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Edit2, Save, X, Trash2, Mail, Phone, UserCircle, GraduationCap } from "lucide-react";

interface Teacher {
  id: string;
  tscNumber: string | null;
  employmentType: string;
  isClassTeacher: boolean;
  specialisation: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    nationalId: string | null;
    isActive: boolean;
    clerkId: string | null;
  };
  classTeacherStream: { name: string; grade: { name: string } } | null;
}

export default function TeacherProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const fetchTeacher = useCallback(async () => {
    try {
      const res = await fetch(`/api/teachers/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setTeacher(data.teacher);
      setEditForm({
        firstName: data.teacher.user.firstName,
        lastName: data.teacher.user.lastName,
        email: data.teacher.user.email || "",
        phone: data.teacher.user.phone || "",
        nationalId: data.teacher.user.nationalId || "",
        tscNumber: data.teacher.tscNumber || "",
        employmentType: data.teacher.employmentType,
        specialisation: data.teacher.specialisation ? data.teacher.specialisation.split(", ") : [],
        isClassTeacher: data.teacher.isClassTeacher,
        classTeacherStreamId: data.teacher.classTeacherStream?.id || "",
      });
    } catch (err) {
      router.push("/admin/teachers");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchTeacher();
  }, [fetchTeacher]);

  async function handleSave() {
    if (!teacher) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/teachers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setTeacher(json.teacher);
      setIsEditing(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this teacher? Their user account will also be deactivated.")) return;
    try {
      const res = await fetch(`/api/teachers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/admin/teachers");
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;
  if (!teacher) return null;

  const hasClerkLink = !!teacher.user.clerkId;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/teachers"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to teachers
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
              <UserCircle className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {teacher.user.firstName} {teacher.user.lastName}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500">{teacher.user.email || "No email"}</span>
                {!hasClerkLink && (
                  <span className="text-[10px] font-medium px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                    Pending signup
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    fetchTeacher();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border rounded-lg"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border rounded-lg"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Personal Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" value={teacher.user.firstName} editing={isEditing} editValue={editForm.firstName} onChange={(v: string) => setEditForm({ ...editForm, firstName: v })} />
              <Field label="Last Name" value={teacher.user.lastName} editing={isEditing} editValue={editForm.lastName} onChange={(v: string) => setEditForm({ ...editForm, lastName: v })} />
              <Field label="National ID" value={teacher.user.nationalId || "—"} editing={isEditing} editValue={editForm.nationalId} onChange={(v: string) => setEditForm({ ...editForm, nationalId: v })} />
              <Field label="TSC Number" value={teacher.tscNumber || "—"} editing={isEditing} editValue={editForm.tscNumber} onChange={(v: string) => setEditForm({ ...editForm, tscNumber: v })} />
              <div>
                <label className="text-xs font-medium text-gray-500">Employment Type</label>
                {isEditing ? (
                  <select
                    value={editForm.employmentType}
                    onChange={(e) => setEditForm({ ...editForm, employmentType: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="tsc">TSC</option>
                    <option value="bom">BOM</option>
                  </select>
                ) : (
                  <p className="mt-1 text-sm text-gray-900 uppercase">{teacher.employmentType}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Contact</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-400" />
                {isEditing ? (
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                ) : (
                  <span className="text-sm text-gray-900">{teacher.user.email || "—"}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-400" />
                {isEditing ? (
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                ) : (
                  <span className="text-sm text-gray-900">{teacher.user.phone || "—"}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Assignment</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Class Teacher</p>
                  <p className="text-sm font-medium text-gray-900">
                    {teacher.isClassTeacher && teacher.classTeacherStream
                      ? `${teacher.classTeacherStream.grade.name} ${teacher.classTeacherStream.name}`
                      : "Not assigned"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Specialisation</p>
                <p className="text-sm text-gray-900">{teacher.specialisation || "—"}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Account Status</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Active</span>
                <span className={teacher.user.isActive ? "text-green-700" : "text-gray-400"}>
                  {teacher.user.isActive ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Can log in</span>
                <span className={hasClerkLink ? "text-green-700" : "text-amber-700"}>
                  {hasClerkLink ? "Yes" : "Pending invitation"}
                </span>
              </div>
            </div>
            {!hasClerkLink && (
              <p className="text-xs text-amber-700 mt-3 bg-amber-50 p-2 rounded border border-amber-100">
                This teacher has not signed up yet. Invite them via your Clerk dashboard or send them the login link.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, editing, editValue, onChange }: any) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {editing ? (
        <input
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      ) : (
        <p className="mt-1 text-sm text-gray-900">{value}</p>
      )}
    </div>
  );
}