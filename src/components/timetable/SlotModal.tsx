"use client";

import { useState, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  initialData?: {
    periodId: string;
    dayOfWeek: number;
    existingSlot?: any;
  };
  periods: any[];
  learningAreas: any[];
  teachers: any[];
  streams: any[];
  selectedStreamId?: string;
}

export function SlotModal({
  open,
  onClose,
  onSave,
  onDelete,
  initialData,
  periods,
  learningAreas,
  teachers,
  streams,
  selectedStreamId,
}: Props) {
  const [learningAreaId, setLearningAreaId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [room, setRoom] = useState("");
  const [streamId, setStreamId] = useState(selectedStreamId || "");
  const [isDoubleLesson, setIsDoubleLesson] = useState(false);
  const [secondPeriodId, setSecondPeriodId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const existingSlot = initialData?.existingSlot;

  useEffect(() => {
    if (open) {
      if (existingSlot) {
        setLearningAreaId(existingSlot.learningAreaId || "");
        setTeacherId(existingSlot.teacherId || "");
        setRoom(existingSlot.room || "");
        setStreamId(existingSlot.streamId || "");
        setIsDoubleLesson(existingSlot.isDoubleLesson || false);
        setSecondPeriodId(existingSlot.secondPeriodId || "");
      } else {
        setLearningAreaId("");
        setTeacherId("");
        setRoom("");
        setStreamId(selectedStreamId || "");
        setIsDoubleLesson(false);
        setSecondPeriodId("");
      }
      setError("");
    }
  }, [open, existingSlot, selectedStreamId]);

  if (!open || !initialData) return null;

  const data = initialData;
  const { periodId, dayOfWeek } = data;
  const currentPeriod = periods.find((p) => p.id === data.periodId);
  const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][data.dayOfWeek];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!learningAreaId || !teacherId || !streamId) {
      setError("Learning area, teacher, and stream are required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onSave({
        id: existingSlot?.id,
        termId: existingSlot?.termId,
        streamId,
        periodId: data.periodId,
        dayOfWeek: data.dayOfWeek,
        learningAreaId,
        teacherId,
        room,
        isDoubleLesson,
        secondPeriodId: isDoubleLesson ? secondPeriodId : null,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save slot");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!existingSlot || !onDelete) return;
    if (!confirm("Delete this slot?")) return;
    setLoading(true);
    try {
      await onDelete(existingSlot.id);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  const nextPeriod = periods.find(
    (p) => p.orderIndex === (currentPeriod?.orderIndex || 0) + 1 && !p.isBreak
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {existingSlot ? "Edit Slot" : "Add Slot"}
            </h3>
            <p className="text-xs text-gray-500">
              {currentPeriod?.name} on {dayLabel} · {currentPeriod?.startTime?.slice(0, 5)}–{currentPeriod?.endTime?.slice(0, 5)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stream</label>
            <select
              required
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select stream</option>
              {streams.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.grade.name} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Learning Area</label>
            <select
              required
              value={learningAreaId}
              onChange={(e) => setLearningAreaId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select subject</option>
              {learningAreas.map((la: any) => (
                <option key={la.id} value={la.id}>
                  {la.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
            <select
              required
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select teacher</option>
              {teachers.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.user.firstName} {t.user.lastName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. Room 7"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="border rounded-lg p-3 bg-gray-50">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isDoubleLesson}
                onChange={(e) => {
                  setIsDoubleLesson(e.target.checked);
                  if (e.target.checked && nextPeriod) {
                    setSecondPeriodId(nextPeriod.id);
                  } else {
                    setSecondPeriodId("");
                  }
                }}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Double lesson</span>
            </label>
            {isDoubleLesson && nextPeriod && (
              <p className="text-xs text-gray-500 mt-1 ml-6">
                Spans into {nextPeriod.name}
              </p>
            )}
            {isDoubleLesson && !nextPeriod && (
              <p className="text-xs text-amber-600 mt-1 ml-6">
                No subsequent period available.
              </p>
            )}
          </div>

          <div className="flex justify-between items-center pt-4">
            {existingSlot && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="text-sm font-medium text-red-600 hover:text-red-800"
              >
                Delete
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Saving..." : existingSlot ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}