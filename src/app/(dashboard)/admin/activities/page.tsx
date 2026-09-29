"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

export default function AdminActivitiesPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", description: "", feePerTerm: "", maxCapacity: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/activities").then((r) => r.json()).then((d) => setActivities(d.activities || []));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        feePerTerm: Number(form.feePerTerm) || 0,
        maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setActivities((p) => [...p, { ...d.activity, _count: { enrolments: 0 } }]);
      setForm({ name: "", description: "", feePerTerm: "", maxCapacity: "" });
    }
    setSaving(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Co-curricular Activities</h1>

      <form onSubmit={handleCreate} className="rounded-xl border bg-white p-6 space-y-3">
        <input required placeholder="Activity name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-lg border px-3 py-2 text-sm" />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full rounded-lg border px-3 py-2 text-sm" rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" placeholder="Fee per term (KES)" value={form.feePerTerm} onChange={(e) => setForm({ ...form, feePerTerm: e.target.value })}
            className="rounded-lg border px-3 py-2 text-sm" />
          <input type="number" placeholder="Max capacity" value={form.maxCapacity} onChange={(e) => setForm({ ...form, maxCapacity: e.target.value })}
            className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          <Plus className="h-4 w-4" /> {saving ? "Creating..." : "Create activity"}
        </button>
      </form>

      <div className="rounded-xl border bg-white divide-y">
        {activities.map((a) => (
          <div key={a.id} className="p-4 flex justify-between">
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="text-sm text-gray-500">{a.description}</p>
              <p className="text-sm">KES {Number(a.feePerTerm).toLocaleString()}/term · {a._count?.enrolments || 0} enrolled</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
