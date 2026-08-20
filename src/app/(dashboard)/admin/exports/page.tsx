"use client";

import Link from "next/link";
import { FileText, Download, Users, Calendar, DollarSign } from "lucide-react";

interface ExportCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: string;
}

function ExportCard({ title, description, href, icon, color }: ExportCardProps) {
  return (
    <Link
      href={href}
      className="block p-6 bg-white border rounded-lg hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <Download className="w-5 h-5 text-gray-400" />
      </div>
    </Link>
  );
}

export default function ExportsHubPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Export Center
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate reports and export data in CSV and PDF formats.
        </p>
      </div>

      {/* Attendance Exports */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Attendance Reports
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ExportCard
            title="Class Attendance"
            description="Export attendance by class and date range"
            href="/admin/attendance/exports"
            icon={<Calendar className="w-6 h-6 text-blue-600" />}
            color="bg-blue-50"
          />
          <ExportCard
            title="Student Attendance"
            description="Individual student attendance history"
            href="/admin/attendance/exports?tab=student"
            icon={<Users className="w-6 h-6 text-green-600" />}
            color="bg-green-50"
          />
          <ExportCard
            title="Teacher Attendance"
            description="Teacher check-in records by term"
            href="/admin/attendance/exports?tab=teacher"
            icon={<Calendar className="w-6 h-6 text-purple-600" />}
            color="bg-purple-50"
          />
        </div>
      </div>

      {/* Fee Exports */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Fee Reports
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ExportCard
            title="Fee Defaulters"
            description="PDF report of students with outstanding balances"
            href="/bursar/fees/exports"
            icon={<DollarSign className="w-6 h-6 text-red-600" />}
            color="bg-red-50"
          />
          <ExportCard
            title="Daily Collection"
            description="CSV of all payments received today"
            href="/bursar/fees/exports?tab=daily"
            icon={<DollarSign className="w-6 h-6 text-orange-600" />}
            color="bg-orange-50"
          />
          <ExportCard
            title="Term Summary"
            description="Complete fee collection report for the term"
            href="/bursar/fees/exports?tab=term"
            icon={<FileText className="w-6 h-6 text-yellow-600" />}
            color="bg-yellow-50"
          />
        </div>
      </div>

      {/* Results Exports */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Results & Academics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ExportCard
            title="Class Markbook"
            description="Export all assessment results for a class"
            href="/teacher/markbook/exports"
            icon={<FileText className="w-6 h-6 text-indigo-600" />}
            color="bg-indigo-50"
          />
          <ExportCard
            title="Student Portfolio"
            description="PDF of JSS student portfolio artefacts"
            href="/teacher/markbook/exports?tab=portfolio"
            icon={<FileText className="w-6 h-6 text-pink-600" />}
            color="bg-pink-50"
          />
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          How exports work
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Large exports run in the background (won't block your work)</li>
          <li>• You'll see a progress indicator and can download when ready</li>
          <li>• Files are stored securely and available for 1 hour</li>
          <li>• CSV files can be opened in Excel or Google Sheets</li>
          <li>• PDF files are print-ready with professional formatting</li>
        </ul>
      </div>
    </div>
  );
}