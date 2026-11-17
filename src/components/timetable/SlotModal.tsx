'use client';

import { useState, useEffect } from 'react';

type Period = {
  id: string; name?: string; orderIndex?: number;
  startTime?: string; endTime?: string; isBreak?: boolean;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  initialData?: { periodId: string; dayOfWeek: number; existingSlot?: any };
  periods: Period[];
  learningAreas: unknown[];
  teachers: unknown[];
  streams: unknown[];
  selectedStreamId?: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SlotModal({
  open, onClose, onSave, onDelete, initialData,
  periods, learningAreas, teachers, streams, selectedStreamId,
}: Props) {
  const [periodId, setPeriodId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [learningAreaId, setLearningAreaId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [room, setRoom] = useState('');
  const [streamId, setStreamId] = useState(selectedStreamId || '');
  const [isDoubleLesson, setIsDoubleLesson] = useState(false);
  const [secondPeriodId, setSecondPeriodId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const existingSlot = initialData?.existingSlot;

  useEffect(() => {
    if (open) {
      if (existingSlot) {
        setPeriodId(existingSlot.periodId ?? initialData?.periodId ?? '');
        setDayOfWeek(existingSlot.dayOfWeek ?? initialData?.dayOfWeek ?? 0);
        setLearningAreaId(existingSlot.learningAreaId || '');
        setTeacherId(existingSlot.teacherId || '');
        setRoom(existingSlot.room || '');
        setStreamId(existingSlot.streamId || selectedStreamId || '');
        setIsDoubleLesson(existingSlot.isDoubleLesson || false);
        setSecondPeriodId(existingSlot.secondPeriodId || '');
      } else {
        setPeriodId(initialData?.periodId || '');
        setDayOfWeek(initialData?.dayOfWeek || 0);
        setLearningAreaId('');
        setTeacherId('');
        setRoom('');
        setStreamId(selectedStreamId || '');
        setIsDoubleLesson(false);
        setSecondPeriodId('');
      }
      setError('');
    }
  }, [open, existingSlot, selectedStreamId, initialData]);

  if (!open || !initialData) return null;

  const currentPeriod = periods.find((p) => p.id === periodId);
  const nonBreakPeriods = periods.filter((p) => !p.isBreak);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!periodId || !dayOfWeek || !learningAreaId || !teacherId || !streamId) {
      setError('Period, day, learning area, teacher and stream are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSave({
        id: existingSlot?.id,
        termId: existingSlot?.termId,
        streamId,
        periodId,
        dayOfWeek,
        learningAreaId,
        teacherId,
        room,
        isDoubleLesson,
        secondPeriodId: isDoubleLesson ? secondPeriodId : null,
      });
      onClose();
    } catch (err: any) {
      setError((err as Error).message || 'Failed to save slot');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!existingSlot || !onDelete) return;
    if (!confirm('Delete this slot?')) return;
    setLoading(true);
    try {
      await onDelete(existingSlot.id);
      onClose();
    } catch (err: any) {
      setError((err as Error).message || 'Failed to delete');
    } finally {
      setLoading(false);
    }
  }

  const nextPeriod = nonBreakPeriods.find(
    (p) => p.orderIndex === (currentPeriod?.orderIndex || 0) + 1,
  );

  const selectCls =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {existingSlot ? 'Edit Slot' : 'Add Slot'}
            </h3>
            <p className="text-xs text-gray-500">
              {currentPeriod ? currentPeriod.name : 'Pick a period'}
              {dayOfWeek ? ` on ${DAY_LABELS[dayOfWeek]}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Day *</label>
              <select required value={dayOfWeek || ''} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={selectCls}>
                <option value="">Day</option>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>{DAY_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period *</label>
              <select required value={periodId} onChange={(e) => setPeriodId(e.target.value)} className={selectCls}>
                <option value="">Period</option>
                {nonBreakPeriods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stream *</label>
            <select required value={streamId} onChange={(e) => setStreamId(e.target.value)} className={selectCls}>
              <option value="">Select stream</option>
              {streams.map((s: any) => (
                <option key={s.id} value={s.id}>{s.grade.name} {s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Learning Area *</label>
            <select required value={learningAreaId} onChange={(e) => setLearningAreaId(e.target.value)} className={selectCls}>
              <option value="">Select subject</option>
              {learningAreas.map((la: any) => (
                <option key={la.id} value={la.id}>{la.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teacher *</label>
            <select required value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={selectCls}>
              <option value="">Select teacher</option>
              {teachers.map((t: any) => (
                <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
            <input
              type="text" value={room} onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. Room 7" className={selectCls}
            />
          </div>

          <div className="border rounded-lg p-3 bg-gray-50">
            <label className="flex items-center gap-2">
              <input
                type="checkbox" checked={isDoubleLesson}
                onChange={(e) => {
                  setIsDoubleLesson(e.target.checked);
                  setSecondPeriodId(e.target.checked && nextPeriod ? nextPeriod.id : '');
                }}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Double lesson</span>
            </label>
            {isDoubleLesson && nextPeriod && (
              <p className="text-xs text-gray-500 mt-1 ml-6">Spans into {nextPeriod.name}</p>
            )}
            {isDoubleLesson && !nextPeriod && (
              <p className="text-xs text-amber-600 mt-1 ml-6">No subsequent period available.</p>
            )}
          </div>

          <div className="flex justify-between items-center pt-4">
            {existingSlot && onDelete ? (
              <button type="button" onClick={handleDelete} disabled={loading}
                className="text-sm font-medium text-red-600 hover:text-red-800">Delete</button>
            ) : (<div />)}
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" disabled={loading}
                className="px-6 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {loading ? 'Saving...' : existingSlot ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}