"use client";

import { useState, useEffect } from "react";

interface Stream {
  id: string;
  name: string;
  grade: { name: string };
}

interface LearningArea {
  id: string;
  name: string;
}

interface Term {
  id: string;
  name: string;
  isCurrent: boolean;
}

export default function MarkbookExportPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [learningAreas, setLearningAreas] = useState<LearningArea[]>([]);
  
  const [selectedStreamId, setSelectedStreamId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [selectedLearningAreaId, setSelectedLearningAreaId] = useState("");
  
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [streamsRes, termsRes, areasRes] = await Promise.all([
          fetch("/api/streams"),
          fetch("/api/terms"),
          fetch("/api/learning-areas"),
        ]);
        
        const streamsData = await streamsRes.json();
        const termsData = await termsRes.json();
        const areasData = await areasRes.json();
        
        setStreams(streamsData);
        setTerms(termsData);
        setLearningAreas(areasData);
        
        // Auto-select current term
        const currentTerm = termsData.find((t: Term) => t.isCurrent);
        if (currentTerm) setSelectedTermId(currentTerm.id);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      }
    };
    fetchData();
  }, []);

  const handleExport = async () => {
    if (!selectedStreamId || !selectedTermId) {
      alert("Please select stream and term");
      return;
    }

    setIsExporting(true);
    setStatus("Queuing export...");
    setDownloadUrl(null);

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "results-markbook",
          filters: {
            streamId: selectedStreamId,
            termId: selectedTermId,
            learningAreaId: selectedLearningAreaId || undefined,
          },
          format: "csv",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

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
          Export Class Markbook
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Export all assessment results for a class as a CSV spreadsheet.
        </p>
      </div>

      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stream
            </label>
            <select
              value={selectedStreamId}
              onChange={(e) => setSelectedStreamId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">Select stream...</option>
              {streams.map((stream) => (
                <option key={stream.id} value={stream.id}>
                  {stream.grade.name} {stream.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Term
            </label>
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">Select term...</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name} {term.isCurrent && "(Current)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Learning Area (Optional)
            </label>
            <select
              value={selectedLearningAreaId}
              onChange={(e) => setSelectedLearningAreaId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">All learning areas</option>
              {learningAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting || !selectedStreamId || !selectedTermId}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
            isExporting || !selectedStreamId || !selectedTermId
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

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          What's included in this export:
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• All students in the selected stream</li>
          <li>• All published assessments for the term</li>
          <li>• Student marks for each assessment</li>
          <li>• Sorted by student name</li>
          <li>• Only includes published/locked assessments (not drafts)</li>
        </ul>
      </div>
    </div>
  );
}