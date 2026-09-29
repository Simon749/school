"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Award,
  BookOpen,
  ChevronDown,
  Calendar,
  FileText,
  Star,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";

type Assessment = {
  id: string;
  title: string;
  type: "cat" | "exam" | "assignment" | "project";
  learningArea: { name: string };
  term: { name: string };
  assessmentDate: string;
  maxMarks: number;
  weightPercent: number;
  marksObtained: number;
  percentage: number;
  grade: string;
  teacherComment?: string;
};

type SubjectPerformance = {
  subject: string;
  term1: number;
  term2: number;
  term3: number;
  average: number;
  trend: "improving" | "declining" | "stable";
  needsAttention: boolean;
};

type TermSummary = {
  term: string;
  totalAssessments: number;
  averageScore: number;
  position?: number;
  outOf?: number;
  classTeacherComment?: string;
};

type ChildResults = {
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  stream: string;
  overallAverage: number;
  classPosition?: number;
  totalStudents?: number;
  assessments: Assessment[];
  termSummaries: TermSummary[];
  subjectPerformance: SubjectPerformance[];
  strengths: string[];
  needsImprovement: string[];
};

const COLORS = {
  excellent: "#10b981",
  good: "#3b82f6",
  average: "#f59e0b",
  needsWork: "#ef4444",
};

type ViewMode = "summary" | "trends" | "subjects";

export default function ParentResultsPage() {
  const { user } = useUser();
  const [children, setChildren] = useState<ChildResults[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResults() {
      try {
        const response = await fetch("/api/parent/results");
        if (!response.ok) throw new Error("Failed to fetch results");
        const data = await response.json();
        setChildren(data.children || []);
        if (data.children?.[0]) setSelectedChildId(data.children[0].studentId);
      } catch (error) {
        console.error("Error fetching results:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchResults();
  }, []);

  const selectedChild = children.find((c) => c.studentId === selectedChildId) || children[0];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!selectedChild) {
    return <div className="p-8 text-center text-slate-500">No children found.</div>;
  }

  const getGradeColor = (percentage: number) => {
    if (percentage >= 80) return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (percentage >= 60) return "bg-blue-100 text-blue-700 border-blue-200";
    if (percentage >= 50) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  const getGradeLabel = (percentage: number) => {
    if (percentage >= 80) return "Excellent";
    if (percentage >= 60) return "Good";
    if (percentage >= 50) return "Average";
    return "Needs Work";
  };

  const pieData = [
    { name: "Excellent (80%+)", value: selectedChild.assessments.filter((a) => a.percentage >= 80).length, color: COLORS.excellent },
    { name: "Good (60-79%)", value: selectedChild.assessments.filter((a) => a.percentage >= 60 && a.percentage < 80).length, color: COLORS.good },
    { name: "Average (50-59%)", value: selectedChild.assessments.filter((a) => a.percentage >= 50 && a.percentage < 60).length, color: COLORS.average },
    { name: "Needs Work (<50%)", value: selectedChild.assessments.filter((a) => a.percentage < 50).length, color: COLORS.needsWork },
  ];

  const trendData = selectedChild.subjectPerformance.map((subj) => ({
    subject: subj.subject.slice(0, 10),
    "Term 1": subj.term1,
    "Term 2": subj.term2,
    "Term 3": subj.term3,
  }));

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header with Child Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Academic Results</h1>
          <p className="text-sm text-slate-500 mt-1">Track performance, trends, and subject-level insights</p>
        </div>
        
        {/* Child Switcher */}
        {children.length > 1 && (
          <div className="relative">
            <select
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="appearance-none w-full sm:w-auto rounded-lg border border-slate-300 bg-white py-2 pl-4 pr-10 text-sm font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {children.map((c) => (
                <option key={c.studentId} value={c.studentId}>
                  {c.firstName} {c.lastName} ({c.grade} {c.stream})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
        )}
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setViewMode("summary")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === "summary" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Summary
        </button>
        <button
          onClick={() => setViewMode("trends")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === "trends" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Performance Trends
        </button>
        <button
          onClick={() => setViewMode("subjects")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === "subjects" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Subject Analysis
        </button>
      </div>

      {/* SUMMARY VIEW */}
      {viewMode === "summary" && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Overall Average</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{selectedChild.overallAverage.toFixed(1)}%</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Award className="h-6 w-6 text-emerald-600" />
                  </div>
                </div>
                <p className="text-sm text-slate-600 mt-2">{getGradeLabel(selectedChild.overallAverage)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Class Position</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">
                      {selectedChild.classPosition ? `${selectedChild.classPosition}/${selectedChild.totalStudents}` : "N/A"}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Star className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Assessments</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{selectedChild.assessments.length}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Subjects</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{selectedChild.subjectPerformance.length}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                    <BookOpen className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alerts Section */}
          {(selectedChild.needsImprovement.length > 0 || selectedChild.strengths.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedChild.strengths.length > 0 && (
                <Card className="border-l-4 border-l-emerald-500 bg-emerald-50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <TrendingUp className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-emerald-900 mb-1">Strong Performance</h3>
                        <ul className="space-y-1">
                          {selectedChild.strengths.map((subject, idx) => (
                            <li key={idx} className="text-sm text-emerald-700">• {subject}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedChild.needsImprovement.length > 0 && (
                <Card className="border-l-4 border-l-red-500 bg-red-50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-red-900 mb-1">Needs Attention</h3>
                        <ul className="space-y-1">
                          {selectedChild.needsImprovement.map((subject, idx) => (
                            <li key={idx} className="text-sm text-red-700">• {subject}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Grade Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Grade Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Term Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Term Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedChild.termSummaries.map((term, idx) => (
                    <div key={term.term} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-900">{term.term}</h4>
                        <Badge className={getGradeColor(term.averageScore)}>
                          {term.averageScore.toFixed(1)}%
                        </Badge>
                      </div>
                      <Progress value={term.averageScore} className="h-2 mb-2" />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>{term.totalAssessments} assessments</span>
                        {term.position && <span>Position: {term.position}/{term.outOf}</span>}
                      </div>
                      {term.classTeacherComment && (
                        <p className="text-sm text-slate-600 mt-2 italic">"{term.classTeacherComment}"</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Assessments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent Assessments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selectedChild.assessments.slice(0, 10).map((assessment) => (
                  <div key={assessment.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{assessment.learningArea.name}</p>
                        <p className="text-xs text-slate-500">
                          {assessment.title} • {assessment.term.name} • {new Date(assessment.assessmentDate).toLocaleDateString("en-KE")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={getGradeColor(assessment.percentage)}>
                        {assessment.percentage.toFixed(1)}%
                      </Badge>
                      <p className="text-xs text-slate-500 mt-1">
                        {assessment.marksObtained}/{assessment.maxMarks}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* TRENDS VIEW */}
      {viewMode === "trends" && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Trends Across Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="subject" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="Term 1" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="Term 2" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="Term 3" stroke="#f59e0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Subject Trend Indicators */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedChild.subjectPerformance.map((subj) => (
                <div key={subj.subject} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{subj.subject}</p>
                    <p className="text-xs text-slate-500">Avg: {subj.average.toFixed(1)}%</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {subj.trend === "improving" && <TrendingUp className="h-5 w-5 text-emerald-600" />}
                    {subj.trend === "declining" && <TrendingDown className="h-5 w-5 text-red-600" />}
                    {subj.trend === "stable" && <Minus className="h-5 w-5 text-slate-400" />}
                    {subj.needsAttention && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SUBJECTS VIEW */}
      {viewMode === "subjects" && (
        <div className="space-y-4">
          {selectedChild.subjectPerformance.map((subj) => (
            <Card key={subj.subject} className={subj.needsAttention ? "border-red-300 bg-red-50/30" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">{subj.subject}</CardTitle>
                  <div className="flex items-center gap-2">
                    {subj.trend === "improving" && <Badge className="bg-emerald-100 text-emerald-700">Improving</Badge>}
                    {subj.trend === "declining" && <Badge className="bg-red-100 text-red-700">Declining</Badge>}
                    {subj.trend === "stable" && <Badge className="bg-slate-100 text-slate-700">Stable</Badge>}
                    {subj.needsAttention && <Badge className="bg-amber-100 text-amber-700">Needs Attention</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Term 1</p>
                    <p className="text-2xl font-bold text-slate-900">{subj.term1}%</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Term 2</p>
                    <p className="text-2xl font-bold text-slate-900">{subj.term2}%</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1">Term 3</p>
                    <p className="text-2xl font-bold text-slate-900">{subj.term3}%</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600">Overall Average: <span className="font-bold text-slate-900">{subj.average.toFixed(1)}%</span></p>
                  <Progress value={subj.average} className="w-32 h-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}