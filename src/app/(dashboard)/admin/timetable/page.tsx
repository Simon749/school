'use client';

import { useState, useEffect, useCallback } from 'react';
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { SlotModal } from '@/components/timetable/SlotModal';
import { Send, Loader2, Plus } from 'lucide-react';

interface Period {
  id: string; name: string; startTime: string; endTime: string;
  isBreak: boolean; orderIndex: number;
}
interface Slot {
  id: string; periodId: string; dayOfWeek: number; room: string | null;
  isDoubleLesson: boolean; isPublished: boolean; termId: string;
  learningArea: { id: string; name: string; color: string | null };
  teacher: { id: string; user: { firstName: string; lastName: string } };
  stream: { id: string; name: string; grade: { name: string } };
  secondPeriod: { id: string; name: string } | null;
  learningAreaId: string; teacherId: string; streamId: string; secondPeriodId: string | null;
}

export default function TimetableBuilderPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [learningAreas, setLearningAreas] = useState<any[]>([]);
  const [currentTermId, setCurrentTermId] = useState<string>('');
  const [selectedStreamId, setSelectedStreamId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<any>(null);

  // 1) Resolve the current term — handle BOTH array and {terms} shapes, fall back to first term.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/terms')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('terms request failed'))))
      .then((raw) => {
        if (cancelled) return;
        const list: any[] = Array.isArray(raw) ? raw : raw?.terms ?? [];
        if (list.length === 0) {
          setError('No term found. Create an academic year + term first.');
          setLoading(false);
          return;
        }
        const current = list.find((t) => t.isCurrent) ?? list[0]; // ← fallback fixes the stuck spinner
        setCurrentTermId(current.id);
      })
      .catch(() => { if (!cancelled) { setError('Could not load terms.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // 2) Load timetable data once the term is known.
  const loadTimetable = useCallback(async () => {
    if (!currentTermId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ termId: currentTermId });
      if (selectedStreamId) params.set('streamId', selectedStreamId);
      if (selectedTeacherId) params.set('teacherId', selectedTeacherId);
      const res = await fetch(`/api/timetable?${params}`);
      if (!res.ok) throw new Error('Failed to load timetable');
      const data = await res.json();
      setPeriods(data.periods ?? []);
      setSlots(data.slots ?? []);
      setStreams(data.streams ?? []);
      setTeachers(data.teachers ?? []);
      setLearningAreas(data.learningAreas ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load timetable');
    } finally {
      setLoading(false);
    }
  }, [currentTermId, selectedStreamId, selectedTeacherId]);

  useEffect(() => { loadTimetable(); }, [loadTimetable]);

  async function handleSaveSlot(data: any) {
    const res = await fetch('/api/timetable/slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, termId: currentTermId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.conflict?.message ?? json.error ?? 'Save failed');
    setSlots((prev) => [...prev.filter((s) => s.id !== json.slot.id), json.slot]);
  }

  async function handleDeleteSlot(id: string) {
    const res = await fetch(`/api/timetable/slot/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  function confirmDeleteSlot(id: string) {
    if (!confirm('Delete this lesson?')) return;
    handleDeleteSlot(id).catch((e) => alert(e.message));
  }

  async function handlePublish() {
    if (!confirm('Publish this timetable? Teachers will see their schedules.')) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/timetable/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termId: currentTermId }),
      });
      if (!res.ok) throw new Error('Publish failed');
      const json = await res.json();
      alert(`Published ${json.publishedCount} slots.`);
      setSlots((prev) => prev.map((s) => ({ ...s, isPublished: true })));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPublishing(false);
    }
  }

  function openAddSchedule() {
    const firstPeriod = periods.find((p) => !p.isBreak);
    setModalData({ periodId: firstPeriod?.id ?? '', dayOfWeek: 1, existingSlot: undefined });
    setModalOpen(true);
  }

  const unpublishedCount = slots.filter((s) => !s.isPublished).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timetable Builder</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unpublishedCount > 0 ? (
              <span className="text-amber-600 font-medium">{unpublishedCount} unpublished slots</span>
            ) : (
              <span className="text-green-600 font-medium">All slots published</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedStreamId}
            onChange={(e) => { setSelectedStreamId(e.target.value); setSelectedTeacherId(''); }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Filter by Stream</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>{s.grade.name} {s.name}</option>
            ))}
          </select>
          <select
            value={selectedTeacherId}
            onChange={(e) => { setSelectedTeacherId(e.target.value); setSelectedStreamId(''); }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Filter by Teacher</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>
            ))}
          </select>
          <button
            onClick={openAddSchedule}
            disabled={loading || periods.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Add Schedule
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || unpublishedCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
            <Send className="w-4 h-4" /> Publish
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center">{error}</div>
      ) : loading ? (
        <div className="text-center py-12 text-gray-400">Loading timetable...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <TimetableGrid
            periods={periods}
            slots={slots}
            showStreamInfo={!!selectedTeacherId}
            onCellClick={(periodId, dayOfWeek, existingSlot) => {
              setModalData({ periodId, dayOfWeek, existingSlot });
              setModalOpen(true);
            }}
            onDeleteSlot={confirmDeleteSlot}
          />
        </div>
      )}

      <SlotModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveSlot}
        onDelete={modalData?.existingSlot ? handleDeleteSlot : undefined}
        initialData={modalData}
        periods={periods}
        learningAreas={learningAreas}
        teachers={teachers}
        streams={streams}
        selectedStreamId={selectedStreamId}
      />
    </div>
  );
}