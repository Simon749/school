"use client";

import { useState, useEffect } from "react";

interface Term {
  id: string;
  name: string;
  isCurrent: boolean;
}

export default function FeeDefaultersExportPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    // Fetch available terms
    const fetchTerms = async () => {
      try {
        const res = await fetch("/api/terms");
        const data = await res.json();
        setTerms(data);
        // Auto-select current term
        const currentTerm = data.find((t: Term) => t.isCurrent);
        if (currentTerm) {
          setSelectedTermId(currentTerm.id);
        }
      } catch (err) {
        console.error("Failed to fetch terms:", err);
      }
    };
    fetchTerms();
  }, []);

  const handleExport = async () => {
    if (!selectedTermId) {
      alert("Please select a term");
      return;
    }

    setIsExporting(true);
    setStatus("Queuing export...");

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "fees-defaulters",
          filters: { termId: selectedTermId },
          format: "pdf",
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
    }, 2000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Fee Defaulters Report
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate a PDF report of all students with outstanding fee balances.
        </p>
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Term
          </label>
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
          >
            <option value="">Select a term...</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name} {term.isCurrent && "(Current)"}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting || !selectedTermId}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
            isExporting || !selectedTermId
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isExporting ? "Generating PDF..." : "Export to PDF"}
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
                Download PDF
              </a>
            )}
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          What's included in this report:
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• All active students with outstanding balances</li>
          <li>• Student name, admission number, and stream</li>
          <li>• Total fees due, total paid, and remaining balance</li>
          <li>• Summary totals at the bottom</li>
          <li>• Sorted by balance (highest first)</li>
        </ul>
      </div>
    </div>
  );
}