"use client";

import { useEffect, useState } from "react";
import { MapPin, RefreshCw, School, Settings2 } from "lucide-react";

interface SchoolSettings {
  name: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadius: number;
}

export default function SchoolSettingsPage() {
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/school/settings");
      if (!response.ok) throw new Error("Unable to load school settings.");
      setSettings(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load school settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-900">School settings</h1>
        </div>
        <p className="mt-2 text-slate-500">Review the school profile and attendance location settings.</p>
      </header>

      {loading && <p className="text-sm text-slate-500">Loading school settings...</p>}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={loadSettings} className="inline-flex items-center gap-2 font-medium hover:underline">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {settings && (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <School className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-900">School profile</h2>
            </div>
            <dl className="mt-6 space-y-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">School name</dt>
                <dd className="mt-1 text-slate-900">{settings.name}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-900">Attendance geofence</h2>
            </div>
            <dl className="mt-6 space-y-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Centre point</dt>
                <dd className="mt-1 text-slate-900">
                  {settings.latitude !== null && settings.longitude !== null
                    ? `${settings.latitude}, ${settings.longitude}`
                    : "Not configured"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Allowed radius</dt>
                <dd className="mt-1 text-slate-900">{settings.geofenceRadius} metres</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
