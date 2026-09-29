"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ItAdminExportPage() {
  const [exportType, setExportType] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (type: string) => {
    setExportType(type);
    setIsExporting(true);
    
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;
    const maxAttempts = 30; // Stop polling after 30 seconds

    try {
      // 1. Enqueue the job
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, format: "csv" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to queue export");

      const jobId = data.jobId;
      toast.info("Export queued. Generating file...");

      // 2. Poll for completion with a safety timeout
      pollInterval = setInterval(async () => {
        attempts++;
        
        // SAFETY NET: Stop polling if it takes too long
        if (attempts > maxAttempts) {
          if (pollInterval !== null) clearInterval(pollInterval);
          toast.error("Export is taking too long. Please check if the worker is running.");
          setIsExporting(false);
          setExportType("");
          return;
        }

        const statusRes = await fetch(`/api/export/status?jobId=${jobId}`);
        const statusData = await statusRes.json();

        if (statusData.state === "completed") {
          if (pollInterval !== null) clearInterval(pollInterval);
          toast.success("Export ready! Downloading...");
          window.open(`/api/export/download?jobId=${jobId}`, "_blank");
          setIsExporting(false);
          setExportType("");
        } else if (statusData.state === "failed") {
          if (pollInterval !== null) clearInterval(pollInterval);
          toast.error(`Export failed: ${statusData.failedReason}`);
          setIsExporting(false);
          setExportType("");
        }
      }, 1000); 

    } catch (error: unknown) {
      if (pollInterval !== null) clearInterval(pollInterval);
      console.error(error);
      toast.error(error.message || "Export failed");
      setIsExporting(false);
      setExportType("");
    }
  };

  const exports = [
    { id: "students", title: "Student Roster", desc: "All active students with stream and guardian details." },
    { id: "fees-defaulters", title: "Fee Defaulters", desc: "Students with outstanding fee balances for the current term." },
    { id: "attendance-student", title: "Attendance Summary", desc: "Term-level attendance statistics for all students." },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Data Exports</h1>
        <p className="text-slate-500">Generate CSV reports for school records and compliance.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {exports.map((exp) => (
          <Card key={exp.id}>
            <CardHeader>
              <CardTitle>{exp.title}</CardTitle>
              <CardDescription>{exp.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                variant={exp.id === "students" ? "default" : "outline"}
                onClick={() => handleExport(exp.id)}
                disabled={isExporting}
              >
                {isExporting && exportType === exp.id ? "Generating..." : "Download CSV"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}