"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { SlotModal } from "@/components/timetable/SlotModal";
import { Eye, EyeOff, GraduationCap, Users, Send, Loader2 } from "lucide-react";

interface Period {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  orderIndex: number;
}

interface Slot {
  id: string;
  periodId: string;
  dayOfWeek: number;
  room: string | null;
  isDoubleLesson: boolean;
  isPublished: boolean;
  learningArea: { name: string; color: string | null };
  teacher: { user: { firstName: string; lastName: string } };
  stream: { name: string; grade: { name: string } };
  secondPeriod: { id: string; name: string } | null;
  termId: string;
};


export default function TimetableBuilderPage() {
  const router = useRouter();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [learningAreas, setLearningAreas] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [currentTermId, setCurrentTermId] = useState<string>("");
  const [selectedStreamId, setSelectedStreamId] = useState<string>("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get current term first
      const termRes = await fetch("/api/grades"); // reusing to get school context, but we need terms
      // Actually, let's fetch terms separately
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const [termsRes, gradesRes, areasRes, teachersRes] = await Promise.all([
        fetch("/api/terms"), // we'll need this endpoint or use grades
        fetch("/api/grades"),
        fetch("/api/learning-areas"),
        fetch("/api/teachers"),
      ]);

      if (gradesRes.ok) {
        const data = await gradesRes.json();
        const allStreams = (data.grades || []).flatMap((g: any) =>
          g.streams.map((s: any) => ({ ...s, grade: { name: g.name } }))
        );
        setStreams(allStreams);
      }
      if (areasRes.ok) {
        const data = await areasRes.json();
        setLearningAreas(data.areas || []);
      }
      if (teachersRes.ok) {
        const data = await teachersRes.json();
        setTeachers(data.teachers || []);
      }
      // For terms, we don't have a dedicated endpoint yet. Let's fetch from grades and infer, 
      // or better, create a quick terms fetch. Since we don't have /api/terms, I'll use the current term logic.
      // For now, let's fetch timetable data with a dummy termId and let the API tell us.
      // Actually, let's just fetch the first term from the school via a direct call.
    }
    init();
  }, []);

  // Fetch timetable data when filters change
  useEffect(() => {
    if (!currentTermId) return;
    const params = new URLSearchParams();
    params.set("termId", currentTermId);
    if (selectedStreamId) params.set("streamId", selectedStreamId);
    if (selectedTeacherId) params.set("teacherId", selectedTeacherId);

    fetch(`/api/timetable?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setPeriods(data.periods || []);
        setSlots(data.slots || []);
        setStreams(data.streams || []);
        setTeachers(data.teachers || []);
        setLearningAreas(data.learningAreas || []);
        if (!currentTermId && data.slots[0]) {
          setCurrentTermId(data.slots[0].termId);
        }
      })
      .finally(() => setLoading(false));
  }, [currentTermId, selectedStreamId, selectedTeacherId]);

  // Auto-select current term on first load
  useEffect(() => {
    if (!currentTermId) {
      fetch("/api/terms")
        .then((r) => (r.ok ? r.json() : { terms: [] }))
        .then((data) => {
          const current = (data.terms || []).find((t: any) => t.isCurrent);
          if (current) setCurrentTermId(current.id);
        })
        .catch(() => { });
    }
  }, [currentTermId]);

  async function handleSaveSlot(data: any) {
    const res = await fetch("/api/timetable/slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, termId: currentTermId }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.conflict?.message || json.error || "Save failed");
    }
    // Refresh
    setSlots((prev) => {
      const filtered = prev.filter((s) => s.id !== json.slot.id);
      return [...filtered, json.slot];
    });
  }

  async function handleDeleteSlot(id: string) {
    const res = await fetch(`/api/timetable/slot/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  async function handlePublish() {
    if (!confirm("Publish this timetable? Teachers will be able to see their schedules.")) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/timetable/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId: currentTermId }),
      });
      if (!res.ok) throw new Error("Publish failed");
      const json = await res.json();
      alert(`Published ${json.publishedCount} slots.`);
      setSlots((prev) => prev.map((s) => ({ ...s, isPublished: true })));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPublishing(false);
    }
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
            onChange={(e) => {
              setSelectedStreamId(e.target.value);
              setSelectedTeacherId("");
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Filter by Stream</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.grade.name} {s.name}
              </option>
            ))}
          </select>

          <select
            value={selectedTeacherId}
            onChange={(e) => {
              setSelectedTeacherId(e.target.value);
              setSelectedStreamId("");
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Filter by Teacher</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.user.firstName} {t.user.lastName}
              </option>
            ))}
          </select>

          <button
            onClick={handlePublish}
            disabled={publishing || unpublishedCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
            <Send className="w-4 h-4" />
            Publish
          </button>
        </div>
      </div>

      {loading ? (
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