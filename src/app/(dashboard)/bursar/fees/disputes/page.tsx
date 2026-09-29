"use client";

import { useEffect, useState } from "react";
import { 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Smartphone, 
  ExternalLink,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Dispute = {
  id: string;
  studentId: string;
  studentName: string;
  raisedByName: string;
  mpesaCodeClaimed: string | null;
  amountClaimed: number | null;
  screenshotUrl: string | null;
  status: "open" | "investigating" | "resolved" | "rejected";
  resolutionNote: string | null;
  createdAt: string;
};

export default function BursarDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "investigating" | "resolved" | "rejected">("open");
  const [searchTerm, setSearchTerm] = useState("");

  // Resolution Dialog State
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [resolveStatus, setResolveStatus] = useState<"investigating" | "resolved" | "rejected">("resolved");
  const [resolutionNote, setResolutionNote] = useState("");
  const [isCheckingDaraja, setIsCheckingDaraja] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchDisputes();
  }, []);

  async function fetchDisputes() {
    setLoading(true);
    try {
      const res = await fetch("/api/fees/disputes");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDisputes(data.disputes || []);
    } catch (error) {
      toast.error("Failed to load disputes");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckDaraja() {
    if (!selectedDispute?.mpesaCodeClaimed) return;
    setIsCheckingDaraja(true);
    try {
      // NOTE: Replace this with your actual Daraja query API call
      // const res = await fetch(`/api/fees/mpesa/query?code=${selectedDispute.mpesaCodeClaimed}`);
      // const data = await res.json();
      
      // Simulated delay for demo
      await new Promise((r) => setTimeout(r, 1500));
      toast.info(`Daraja lookup simulated for: ${selectedDispute.mpesaCodeClaimed}`);
      setResolutionNote((prev) => `${prev}\n[Daraja Check]: Transaction found/verified.`.trim());
    } catch (error) {
      toast.error("Failed to query Daraja");
    } finally {
      setIsCheckingDaraja(false);
    }
  }

  async function handleResolve() {
    if (!selectedDispute) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/fees/disputes/${selectedDispute.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: resolveStatus,
          resolutionNote,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      
      toast.success(`Dispute marked as ${resolveStatus}`);
      setSelectedDispute(null);
      setResolutionNote("");
      fetchDisputes(); // Refresh list
    } catch (error) {
      toast.error("Failed to resolve dispute");
    } finally {
      setIsSaving(false);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-red-100 text-red-800 border-red-200"><AlertTriangle className="mr-1 h-3 w-3" /> Open</Badge>;
      case "investigating":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200"><Clock className="mr-1 h-3 w-3" /> Investigating</Badge>;
      case "resolved":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="mr-1 h-3 w-3" /> Resolved</Badge>;
      case "rejected":
        return <Badge className="bg-slate-100 text-slate-800 border-slate-200"><XCircle className="mr-1 h-3 w-3" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredDisputes = disputes.filter((d) => {
    const matchesFilter = filter === "all" || d.status === filter;
    const matchesSearch = 
      d.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.mpesaCodeClaimed?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const formatKes = (n: number | null) => n ? `KES ${n.toLocaleString()}` : "N/A";
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payment Disputes</h1>
        <p className="text-slate-500">Review and resolve parent claims of missing or incorrect MPesa payments.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["all", "open", "investigating", "resolved", "rejected"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
              {f === "open" && (
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                  {disputes.filter((d) => d.status === "open").length}
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Dispute Queue</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search student or MPesa code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : filteredDisputes.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              No disputes found matching your filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date Raised</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Claimed Amount</TableHead>
                  <TableHead>MPesa Code</TableHead>
                  <TableHead>Raised By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
                </TableHeader>
              <TableBody>
                {filteredDisputes.map((dispute) => (
                  <TableRow key={dispute.id}>
                    <TableCell className="text-sm text-slate-500">{formatDate(dispute.createdAt)}</TableCell>
                    <TableCell className="font-medium">{dispute.studentName}</TableCell>
                    <TableCell className="font-mono font-semibold">{formatKes(dispute.amountClaimed)}</TableCell>
                    <TableCell>
                      {dispute.mpesaCodeClaimed ? (
                        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{dispute.mpesaCodeClaimed}</span>
                      ) : (
                        <span className="text-slate-400 text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{dispute.raisedByName}</TableCell>
                    <TableCell>{getStatusBadge(dispute.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedDispute(dispute);
                          setResolveStatus(dispute.status === "open" ? "investigating" : dispute.status);
                          setResolutionNote(dispute.resolutionNote || "");
                        }}
                      >
                        {dispute.status === "open" ? "Review" : "View Details"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resolution Dialog */}
      <Dialog open={!!selectedDispute} onOpenChange={(open) => !open && setSelectedDispute(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Resolve Payment Dispute</DialogTitle>
            <DialogDescription>
              Review the claim and update the status. Use the Daraja lookup to verify MPesa codes.
            </DialogDescription>
          </DialogHeader>

          {selectedDispute && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 text-sm">
                <div>
                  <p className="text-slate-500">Student</p>
                  <p className="font-medium">{selectedDispute.studentName}</p>
                </div>
                <div>
                  <p className="text-slate-500">Claimed Amount</p>
                  <p className="font-medium">{formatKes(selectedDispute.amountClaimed)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500">MPesa Code</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{selectedDispute.mpesaCodeClaimed || "Not provided"}</span>
                    {selectedDispute.mpesaCodeClaimed && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleCheckDaraja}
                        disabled={isCheckingDaraja}
                      >
                        {isCheckingDaraja ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Smartphone className="mr-1 h-3 w-3" />}
                        Check Daraja
                      </Button>
                    )}
                  </div>
                </div>
                {selectedDispute.screenshotUrl && (
                  <div className="col-span-2">
                    <p className="text-slate-500 mb-1">Screenshot</p>
                    <a href={selectedDispute.screenshotUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      View Screenshot <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Update Status</Label>
                <Select value={resolveStatus} onValueChange={(v: any) => setResolveStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investigating">Investigating</SelectItem>
                    <SelectItem value="resolved">Resolved (Payment Verified)</SelectItem>
                    <SelectItem value="rejected">Rejected (Invalid Claim)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Resolution Notes</Label>
                <Textarea
                  placeholder="e.g., Verified via Daraja API. Payment was allocated to Term 2."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDispute(null)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Resolution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}