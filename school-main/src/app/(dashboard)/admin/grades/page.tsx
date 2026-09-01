"use client";

import { useState, useEffect, useCallback } from "react";

interface Stream {
  id: string;
  name: string;
  capacity: number;
  _count: { students: number };
}

interface Grade {
  id: string;
  name: string;
  level: number;
  cbcStage: string;
  streams: Stream[];
}

export default function GradesPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Inline edit state
  const [editingStream, setEditingStream] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", capacity: 40 });

  // Add stream state
  const [addingToGrade, setAddingToGrade] = useState<string | null>(null);
  const [newStream, setNewStream] = useState({ name: "", capacity: 40 });

  const [saving, setSaving] = useState(false);

  const fetchGrades = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/grades");
      if (!res.ok) throw new Error("Failed to load grades");
      const data = await res.json();
      setGrades(data.grades);
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGrades();
  }, [fetchGrades]);

  async function handleCreate(gradeId: string) {
    if (!newStream.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gradeId, ...newStream }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create stream");
      setAddingToGrade(null);
      setNewStream({ name: "", capacity: 40 });
      await fetchGrades();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(stream: Stream) {
    setEditingStream(stream.id);
    setEditForm({ name: stream.name, capacity: stream.capacity });
  }

  async function handleSaveEdit(streamId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/streams/${streamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update stream");
      setEditingStream(null);
      await fetchGrades();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(streamId: string) {
    if (!confirm("Are you sure? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/streams/${streamId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete stream");
      await fetchGrades();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading grades and streams...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchGrades}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Grades & Streams</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your school's grade structure and class streams.
        </p>
      </div>

      <div className="grid gap-6">
        {grades.map((grade) => {
          const totalStudents = grade.streams.reduce(
            (sum, s) => sum + s._count.students,
            0
          );

          return (
            <div
              key={grade.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-gray-900">
                    {grade.name}
                  </h2>
                  <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full capitalize">
                    {grade.cbcStage.replace("_", " ")}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {totalStudents} student{totalStudents !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="p-6 space-y-3">
                {grade.streams.length === 0 && (
                  <p className="text-sm text-gray-400 italic">
                    No streams configured yet.
                  </p>
                )}

                {grade.streams.map((stream) => {
                  const utilization =
                    stream.capacity > 0
                      ? Math.round((stream._count.students / stream.capacity) * 100)
                      : 0;
                  const isOverCapacity = stream._count.students > stream.capacity;

                  return (
                    <div
                      key={stream.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                    >
                      {editingStream === stream.id ? (
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm({ ...editForm, name: e.target.value })
                            }
                            className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <input
                            type="number"
                            value={editForm.capacity}
                            min={1}
                            max={100}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                capacity: parseInt(e.target.value) || 40,
                              })
                            }
                            className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-500">capacity</span>
                          <div className="ml-auto flex items-center gap-3">
                            <button
                              onClick={() => handleSaveEdit(stream.id)}
                              disabled={saving}
                              className="text-xs font-medium text-green-700 hover:text-green-800"
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingStream(null)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-4 min-w-0">
                            <span className="font-semibold text-gray-900 w-12 shrink-0">
                              {stream.name}
                            </span>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <span>
                                {stream._count.students} / {stream.capacity} students
                              </span>
                              {isOverCapacity && (
                                <span className="text-[10px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                                  Over capacity
                                </span>
                              )}
                              {!isOverCapacity && utilization >= 90 && (
                                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                  {utilization}% full
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <button
                              onClick={() => startEdit(stream)}
                              className="text-xs font-medium text-blue-600 hover:text-blue-800"
                            >
                              Rename / Capacity
                            </button>
                            <button
                              onClick={() => handleDelete(stream.id)}
                              disabled={stream._count.students > 0}
                              className={`text-xs font-medium ${
                                stream._count.students > 0
                                  ? "text-gray-400 cursor-not-allowed"
                                  : "text-red-600 hover:text-red-800"
                              }`}
                              title={
                                stream._count.students > 0
                                  ? "Cannot delete: students are enrolled"
                                  : "Delete stream"
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {addingToGrade === grade.id ? (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <input
                      type="text"
                      value={newStream.name}
                      onChange={(e) =>
                        setNewStream({ ...newStream, name: e.target.value })
                      }
                      placeholder="Stream name (e.g. B)"
                      className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <input
                      type="number"
                      value={newStream.capacity}
                      min={1}
                      max={100}
                      onChange={(e) =>
                        setNewStream({
                          ...newStream,
                          capacity: parseInt(e.target.value) || 40,
                        })
                      }
                      className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-500">capacity</span>
                    <div className="ml-auto flex items-center gap-3">
                      <button
                        onClick={() => handleCreate(grade.id)}
                        disabled={saving || !newStream.name.trim()}
                        className="text-xs font-medium text-green-700 hover:text-green-800 disabled:opacity-50"
                      >
                        {saving ? "Adding..." : "Add"}
                      </button>
                      <button
                        onClick={() => setAddingToGrade(null)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAddingToGrade(grade.id);
                      setNewStream({ name: "", capacity: 40 });
                    }}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 mt-1"
                  >
                    + Add Stream
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}