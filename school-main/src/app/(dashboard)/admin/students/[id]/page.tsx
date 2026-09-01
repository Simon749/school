"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  UserCircle,
  Users,
  School,
  Calendar,
  MapPin,
  AlertCircle,
  Trash2,
} from "lucide-react";

interface Guardian {
  id: string;
  relationship: string;
  isPrimary: boolean;
  canPickup: boolean;
  user: {
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
  };
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  nemisNumber: string;
  admissionNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  isBoarding: boolean;
  status: string;
  photoUrl: string | null;
  medicalNotes: string | null;
  previousSchool: string | null;
  stream: { name: string; grade: { name: string }; capacity: number };
  guardians: Guardian[];
}

export default function StudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Student>>({});
  const [saving, setSaving] = useState(false);

  const fetchStudent = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setStudent(data.student);
      setEditForm(data.student);
    } catch (err) {
      router.push("/admin/students");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchStudent();
  }, [fetchStudent]);

  async function handleSave() {
    if (!student) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          nemisNumber: editForm.nemisNumber,
          admissionNumber: editForm.admissionNumber,
          dateOfBirth: editForm.dateOfBirth,
          gender: editForm.gender,
          isBoarding: editForm.isBoarding,
          photoUrl: editForm.photoUrl,
          medicalNotes: editForm.medicalNotes,
          previousSchool: editForm.previousSchool,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setStudent(json.student);
      setIsEditing(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure? This will soft-delete the student record.")) return;
    try {
      const res = await fetch(`/api/students/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/admin/students");
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">Loading student profile...</div>
    );
  }

  if (!student) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to students
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
              {student.photoUrl ? (
                <img src={student.photoUrl} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <UserCircle className="w-10 h-10" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {student.firstName} {student.lastName}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500">NEMIS: {student.nemisNumber}</span>
                {student.status !== "active" && (
                  <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">
                    {student.status.replace("_", " ")}
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
                    setEditForm(student);
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
        {/* Main details */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
              Personal Details
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="First Name"
                value={student.firstName}
                editing={isEditing}
                onChange={(v) => setEditForm({ ...editForm, firstName: v })}
                editValue={editForm.firstName || ""}
              />
              <Field
                label="Last Name"
                value={student.lastName}
                editing={isEditing}
                onChange={(v) => setEditForm({ ...editForm, lastName: v })}
                editValue={editForm.lastName || ""}
              />
              <Field
                label="NEMIS Number"
                value={student.nemisNumber}
                editing={isEditing}
                onChange={(v) => setEditForm({ ...editForm, nemisNumber: v })}
                editValue={editForm.nemisNumber || ""}
              />
              <Field
                label="Admission Number"
                value={student.admissionNumber || "—"}
                editing={isEditing}
                onChange={(v) => setEditForm({ ...editForm, admissionNumber: v })}
                editValue={editForm.admissionNumber || ""}
              />
              <Field
                label="Date of Birth"
                value={student.dateOfBirth || "—"}
                editing={isEditing}
                type="date"
                onChange={(v) => setEditForm({ ...editForm, dateOfBirth: v })}
                editValue={editForm.dateOfBirth || ""}
              />
              <div>
                <label className="text-xs font-medium text-gray-500">Gender</label>
                {isEditing ? (
                  <select
                    value={editForm.gender || ""}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                ) : (
                  <p className="mt-1 text-sm text-gray-900 capitalize">{student.gender || "—"}</p>
                )}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500">Photo URL</label>
                {isEditing ? (
                  <input
                    type="url"
                    value={editForm.photoUrl || ""}
                    onChange={(e) => setEditForm({ ...editForm, photoUrl: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                ) : (
                  <p className="mt-1 text-sm text-gray-900 truncate">{student.photoUrl || "—"}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
              Medical & History
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500">Medical Notes</label>
                {isEditing ? (
                  <textarea
                    value={editForm.medicalNotes || ""}
                    onChange={(e) => setEditForm({ ...editForm, medicalNotes: e.target.value })}
                    rows={3}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                ) : (
                  <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                    {student.medicalNotes || "No medical notes recorded."}
                  </p>
                )}
              </div>
              <Field
                label="Previous School"
                value={student.previousSchool || "—"}
                editing={isEditing}
                onChange={(v) => setEditForm({ ...editForm, previousSchool: v })}
                editValue={editForm.previousSchool || ""}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
              Enrolment
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <School className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Grade & Stream</p>
                  <p className="text-sm font-medium text-gray-900">
                    {student.stream.grade.name} {student.stream.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Boarding Status</p>
                  <p className="text-sm font-medium text-gray-900">
                    {student.isBoarding ? "Boarding" : "Day Scholar"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Stream Capacity</p>
                  <p className="text-sm font-medium text-gray-900">
                    {student.stream.capacity} students max
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Guardians
              </h2>
              <Link
                href={`/admin/students/${id}/guardians`}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                + Add
              </Link>
            </div>

            {student.guardians.length === 0 ? (
              <div className="text-center py-4">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No guardians linked</p>
                <Link
                  href={`/admin/students/${id}/guardians`}
                  className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                >
                  Link a guardian
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {student.guardians.map((g) => (
                  <div
                    key={g.id}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-gray-900">
                        {g.user.firstName} {g.user.lastName}
                      </span>
                      {g.isPrimary && (
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 capitalize">{g.relationship}</p>
                    {g.user.phone && <p className="text-xs text-gray-500">{g.user.phone}</p>}
                    {!g.canPickup && (
                      <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Cannot pick up
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  type = "text",
  onChange,
  editValue,
}: {
  label: string;
  value: string;
  editing: boolean;
  type?: string;
  onChange: (v: string) => void;
  editValue: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {editing ? (
        <input
          type={type}
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