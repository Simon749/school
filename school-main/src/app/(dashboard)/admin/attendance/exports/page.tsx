"use client";

import { useState } from "react";

export default function AttendanceExportsPage() {
  const [streamId, setStreamId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleExport = async () => {
    if (!streamId || !startDate || !endDate) {
      alert("Please fill all fields");
      return;
    }

    setIsExporting(true);
    setStatus("Queuing export...");

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "attendance-class",
          filters: { streamId, startDate, endDate },
          format: "csv",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setJobId(data.jobId);
      pollJobStatus(data.jobId);
    } catch (err: any) {
      alert(err.message);
      setIsExporting(false);
    }
  };

  const pollJobStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/export/status/${id}`);
        const data = await res.json();

        setStatus(data.status);

        if (data.status === "completed") {
          clearInterval(interval);
          setDownloadUrl(data.downloadUrl);
          setIsExporting(false);
        } else if (data.status === "failed") {
          clearInterval(interval);
          alert(`Export failed: ${data.error}`);
          setIsExporting(false);
        }
      } catch (err) {
        clearInterval(interval);
        setIsExporting(false);
      }
    }, 2000); // Poll every 2 seconds
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Attendance Exports
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Export attendance records by class and date range.
        </p>
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stream
            </label>
            <select
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">Select stream...</option>
              {/* Populate from API: /api/streams */}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
            isExporting
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isExporting ? "Exporting..." : "Export to CSV"}
        </button>

        {status && (
          <div className="mt-4 p-3 bg-gray-50 rounded-md text-sm">
            <p className="font-medium">Status: {status}</p>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="mt-2 inline-block text-blue-600 hover:underline"
              >
                Download CSV
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}