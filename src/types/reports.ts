export interface TermReportData {
  studentId: string;
  studentName: string;
  termId: string;
  termName: string;
  schoolId: string;
  results: Array<{
    assessmentId: string;
    assessmentTitle: string;
    score: number | string;
    maxScore: number;
    // ... other fields based on your report structure
  }>;
  // ... add other fields matching your report data structure
}