'use client';

import Link from 'next/link';
import { FileText, Download, Users, Calendar, DollarSign, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface ExportCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: string;
}

function ExportCard({ title, description, href, icon, color }: ExportCardProps) {
  return (
    <Link href={href} className="group block h-full">
      <Card className="h-full p-6 transition-all hover:shadow-md hover:border-primary/20">
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="mb-1 font-semibold text-slate-900 transition-colors group-hover:text-primary">
              {title}
            </h3>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
          <Download className="h-5 w-5 text-slate-400 transition-colors group-hover:text-primary" />
        </div>
      </Card>
    </Link>
  );
}

export default function ExportsHubPage() {
  return (
    <div className="space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Export Center</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate reports and export data in CSV and PDF formats.
        </p>
      </div>

      {/* Attendance Exports */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Attendance Reports</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ExportCard
            title="Class Attendance"
            description="Export attendance by class and date range"
            href="/admin/attendance/exports"
            icon={<Calendar className="h-5 w-5 text-blue-600" />}
            color="bg-blue-50"
          />
          <ExportCard
            title="Student Attendance"
            description="Individual student attendance history"
            href="/admin/attendance/exports?tab=student"
            icon={<Users className="h-5 w-5 text-emerald-600" />}
            color="bg-emerald-50"
          />
          <ExportCard
            title="Teacher Attendance"
            description="Teacher check-in records by term"
            href="/admin/attendance/exports?tab=teacher"
            icon={<Calendar className="h-5 w-5 text-purple-600" />}
            color="bg-purple-50"
          />
        </div>
      </section>

      {/* Fee Exports */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Fee Reports</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ExportCard
            title="Fee Defaulters"
            description="PDF report of students with outstanding balances"
            href="/bursar/fees/exports"
            icon={<DollarSign className="h-5 w-5 text-red-600" />}
            color="bg-red-50"
          />
          <ExportCard
            title="Daily Collection"
            description="CSV of all payments received today"
            href="/bursar/fees/exports?tab=daily"
            icon={<DollarSign className="h-5 w-5 text-orange-600" />}
            color="bg-orange-50"
          />
          <ExportCard
            title="Term Summary"
            description="Complete fee collection report for the term"
            href="/bursar/fees/exports?tab=term"
            icon={<FileText className="h-5 w-5 text-yellow-600" />}
            color="bg-yellow-50"
          />
        </div>
      </section>

      {/* Results Exports */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Results & Academics</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ExportCard
            title="Class Markbook"
            description="Export all assessment results for a class"
            href="/teacher/markbook/exports"
            icon={<FileText className="h-5 w-5 text-indigo-600" />}
            color="bg-indigo-50"
          />
          <ExportCard
            title="Student Portfolio"
            description="PDF of JSS student portfolio artefacts"
            href="/teacher/markbook/exports?tab=portfolio"
            icon={<FileText className="h-5 w-5 text-pink-600" />}
            color="bg-pink-50"
          />
        </div>
      </section>

      {/* Info Box */}
      <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 p-5">
        <h3 className="mb-2 text-sm font-semibold text-blue-900">How exports work</h3>
        <ul className="space-y-1.5 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Large exports run in the background (won't block your work)</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>You'll see a progress indicator and can download when ready</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Files are stored securely and available for 1 hour</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>CSV files can be opened in Excel or Google Sheets</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}