"use client";

import { useEffect, useState } from "react";
import { 
  MapPin, RefreshCw, School, Settings2, Save, Loader2, Navigation 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface SchoolSettings {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadius: number;
}

export default function SchoolSettingsPage() {
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);

  async function loadSettings() {
    setLoading(true);
    try {
      const response = await fetch("/api/school/settings");
      if (!response.ok) throw new Error("Unable to load school settings.");
      setSettings(await response.json());
    } catch (error) {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      // NOTE: Ensure your /api/school/settings route supports PUT/PATCH
      const res = await fetch("/api/school/settings", {
        method: "PUT", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("School settings updated successfully");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleCaptureLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((prev) => prev ? {
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        } : null);
        setCapturing(false);
        toast.success("Location captured successfully");
      },
      () => {
        setCapturing(false);
        toast.error("Location access denied. Please enable GPS.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (loading) return <div className="p-8 text-center text-sm text-slate-500">Loading school settings...</div>;
  if (!settings) return <div className="p-8 text-center text-sm text-rose-500">No settings found.</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header>
        <div className="flex items-center gap-3">
          <Settings2 className="h-6 w-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-900">School Settings</h1>
        </div>
        <p className="mt-2 text-slate-500">Manage your school profile and attendance geofence.</p>
      </header>

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. School Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="h-5 w-5 text-emerald-600" />
              School Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">School Name *</Label>
                <Input
                  id="name"
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={settings.phone || ""}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="2547XXXXXXXX"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={settings.email || ""}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Geofence Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-emerald-600" />
              Attendance Geofence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* GPS Capture Button */}
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCaptureLocation}
                disabled={capturing}
                className="flex items-center gap-2"
              >
                {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                {capturing ? "Capturing..." : "Capture My Location"}
              </Button>
              <p className="text-sm text-slate-500">
                Stand at the school gate and click to auto-fill coordinates.
              </p>
            </div>

            {/* Manual Coordinate Inputs */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={settings.latitude ?? ""}
                  onChange={(e) => setSettings({ ...settings, latitude: parseFloat(e.target.value) || null })}
                  placeholder="e.g. -1.2921"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={settings.longitude ?? ""}
                  onChange={(e) => setSettings({ ...settings, longitude: parseFloat(e.target.value) || null })}
                  placeholder="e.g. 36.8219"
                />
              </div>
            </div>

            {/* Radius Slider */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="radius">Geofence Radius</Label>
                <span className="text-sm font-medium text-slate-700">{settings.geofenceRadius} metres</span>
              </div>
              <input
                id="radius"
                type="range"
                min="50"
                max="500"
                step="10"
                value={settings.geofenceRadius}
                onChange={(e) => setSettings({ ...settings, geofenceRadius: parseInt(e.target.value) })}
                className="w-full accent-emerald-600"
              />
              <p className="text-xs text-slate-500">
                Teachers must be within this radius to check in. (50m - 500m)
              </p>
            </div>

            {/* Map Preview Placeholder (Per Design Docs) */}
            <div className="mt-4 h-64 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
              <p className="text-sm text-slate-500">
                [Leaflet.js Map Preview will render here showing pin at {settings.latitude}, {settings.longitude}]
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}