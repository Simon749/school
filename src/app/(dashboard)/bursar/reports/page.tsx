"use client";

import { useEffect, useState } from "react";
import { 
  Search, 
  Printer, 
  Send, 
  AlertTriangle, 
  TrendingUp, 
  Users 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type Defaulter = {
  id: string;
  name: string;
  stream: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
};

export default function BursarReportsPage() {
  const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetch("/api/fees/defaulters")
      .then((r) => r.json())
      .then((d) => {
        setDefaulters(d.defaulters || []);
        setTerm(d.term || "Current Term");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handlePrint() {
    window.print();
  }

  function handleSendReminder(defaulter: Defaulter) {
    // NOTE: In Phase 3, this will call: POST /api/messages with { type: 'fee_reminder', studentId: defaulter.id }
    toast.success(`SMS reminder queued for ${defaulter.name}`);
  }

  const formatKes = (n: number) => `KES ${n.toLocaleString()}`;

  // Calculate summary metrics
  const totalOutstanding = defaulters.reduce((sum, d) => sum + d.balance, 0);
  const filteredDefaulters = defaulters.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.stream.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6 print:space-y-2">
      {/* Header - Hidden on print */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fee Defaulters Report</h1>
          <p className="text-slate-500">{term}</p>
        </div>
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Export / Print PDF
        </Button>
      </div>

      {/* Print-only Header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-3xl font-bold text-center">Fee Defaulters Report</h1>
        <p className="text-center text-slate-600 mt-1">{term}</p>
        <p className="text-center text-sm text-slate-500 mt-1">
          Generated on {new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Summary Cards - Hidden on print */}
      <div className="grid gap-4 sm:grid-cols-3 print:hidden">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Defaulters</p>
              <p className="text-2xl font-bold text-slate-900">{defaulters.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Outstanding</p>
              <p className="text-2xl font-bold text-slate-900">{formatKes(totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Avg. Balance</p>
              <p className="text-2xl font-bold text-slate-900">
                {formatKes(defaulters.length > 0 ? totalOutstanding / defaulters.length : 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Table */}
      <Card className="print:shadow-none print:border-0">
        <CardHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <CardTitle>Student List</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name or stream..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 print:p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <p className="text-slate-500">Loading defaulters...</p>
            </div>
          ) : filteredDefaulters.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              {searchTerm ? "No students match your search." : "No defaulters — all fees are fully paid!"}
            </div>
          ) : (
            <Table>
              <TableHeader className="print:bg-slate-100">
                <TableRow>
                  <TableHead className="w-[250px]">Student Name</TableHead>
                  <TableHead>Stream</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right print:hidden">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDefaulters.map((d) => (
                  <TableRow key={d.id} className="print:break-inside-avoid">
                    <TableCell className="font-medium text-slate-900">{d.name}</TableCell>
                    <TableCell className="text-slate-600">{d.stream}</TableCell>
                    <TableCell className="text-right font-mono text-slate-700">
                      {formatKes(d.totalDue)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">
                      {formatKes(d.totalPaid)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-red-600">
                      {formatKes(d.balance)}
                    </TableCell>
                    <TableCell className="text-right print:hidden">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendReminder(d)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Remind
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="print:bg-slate-50 print:font-bold">
                <TableRow>
                  <TableCell colSpan={2} className="font-bold text-slate-900">
                    Total ({filteredDefaulters.length} students)
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-slate-900">
                    {formatKes(filteredDefaulters.reduce((sum, d) => sum + d.totalDue, 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-emerald-700">
                    {formatKes(filteredDefaulters.reduce((sum, d) => sum + d.totalPaid, 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-red-600">
                    {formatKes(filteredDefaulters.reduce((sum, d) => sum + d.balance, 0))}
                  </TableCell>
                  <TableCell className="print:hidden" />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}