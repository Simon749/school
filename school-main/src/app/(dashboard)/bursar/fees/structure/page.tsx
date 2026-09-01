"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type FeeItem = { name: string; amount: number; isMandatory: boolean; isOptionalActivity: boolean; priorityOrder: number };

export default function FeeStructurePage() {
  const [terms, setTerms] = useState<{ id: string; name: string; isCurrent: boolean }[]>([]);
  const [termId, setTermId] = useState("");
  const [name, setName] = useState("Term Fees");
  const [items, setItems] = useState<FeeItem[]>([
    { name: "Tuition", amount: 0, isMandatory: true, isOptionalActivity: false, priorityOrder: 1 },
  ]);
  const [structures, setStructures] = useState<any[]>([]);
  const [streamId, setStreamId] = useState("");
  const [streams, setStreams] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/terms").then((r) => r.json()).then((d) => {
      setTerms(d.terms || []);
      const current = d.terms?.find((t: any) => t.isCurrent);
      if (current) setTermId(current.id);
    });
    fetch("/api/grades").then((r) => r.json()).then((d) => {
      const all = (d.grades || []).flatMap((g: any) => g.streams.map((s: any) => ({ ...s, grade: g })));
      setStreams(all);
    });
  }, []);

  useEffect(() => {
    if (!termId) return;
    fetch(`/api/fees/structure?termId=${termId}`).then((r) => r.json()).then((d) => setStructures(d.structures || []));
  }, [termId]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/fees/structure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termId, name, appliesTo: "all", items }),
    });
    if (res.ok) {
      const d = await res.json();
      setStructures((p) => [...p, d.structure]);
      alert("Fee structure saved");
    }
    setSaving(false);
  }

  async function handleAssign(structureId: string) {
    if (!streamId) return alert("Select a stream");
    const res = await fetch("/api/fees/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structureId, streamId }),
    });
    const d = await res.json();
    alert(`Assigned to ${d.assigned} fee records`);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Fee Structure</h1>

      <div className="rounded-xl border bg-white p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Term</label>
            <select value={termId} onChange={(e) => setTermId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Structure name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Fee items</p>
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input placeholder="Name" value={item.name} onChange={(e) => {
                const next = [...items]; next[i].name = e.target.value; setItems(next);
              }} className="flex-1 rounded border px-2 py-1.5 text-sm" />
              <input type="number" placeholder="Amount" value={item.amount || ""} onChange={(e) => {
                const next = [...items]; next[i].amount = Number(e.target.value); setItems(next);
              }} className="w-28 rounded border px-2 py-1.5 text-sm" />
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={item.isMandatory} onChange={(e) => {
                  const next = [...items]; next[i].isMandatory = e.target.checked; setItems(next);
                }} /> Mandatory
              </label>
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setItems([...items, { name: "", amount: 0, isMandatory: true, isOptionalActivity: false, priorityOrder: items.length + 1 }])}
            className="flex items-center gap-1 text-sm text-blue-600"><Plus className="h-4 w-4" /> Add item</button>
        </div>

        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Saving..." : "Save structure"}
        </button>
      </div>

      {structures.length > 0 && (
        <div className="rounded-xl border bg-white p-6 space-y-4">
          <h2 className="font-semibold">Assign to stream</h2>
          <select value={streamId} onChange={(e) => setStreamId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
            <option value="">Select stream</option>
            {streams.map((s) => <option key={s.id} value={s.id}>{s.grade.name} {s.name}</option>)}
          </select>
          {structures.map((s) => (
            <div key={s.id} className="flex items-center justify-between border rounded-lg p-3">
              <span>{s.name} ({s.feeItems?.length} items)</span>
              <button onClick={() => handleAssign(s.id)} className="text-sm text-blue-600 font-medium">Assign</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
