// src/lib/pdf/term-report-template.tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 11,
    fontFamily: "Helvetica",
  },
  header: {
    textAlign: "center",
    marginBottom: 20,
    borderBottom: 2,
    paddingBottom: 10,
    borderColor: "#000",
  },
  schoolName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  reportTitle: {
    fontSize: 14,
    marginBottom: 5,
  },
  studentInfo: {
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  infoLabel: {
    width: 120,
    fontWeight: "bold",
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    backgroundColor: "#f0f0f0",
    padding: 5,
  },
  comment: {
    padding: 10,
    backgroundColor: "#f9f9f9",
    border: 1,
    borderColor: "#ddd",
    marginBottom: 10,
  },
  attendance: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: "center",
    fontSize: 9,
    color: "#666",
  },
});

interface TermReportData {
  schoolName: string;
  termName: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  classTeacherComment: string | null;
  principalComment: string | null;
  conduct: string | null;
  overallScore: number | null;
  totalLessons: number | null;
  lessonsAttended: number | null;
}

export function TermReportPDF({ data }: { data: TermReportData }) {
  const attendancePercentage =
    data.totalLessons && data.lessonsAttended
      ? ((data.lessonsAttended / data.totalLessons) * 100).toFixed(1)
      : "N/A";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{data.schoolName}</Text>
          <Text style={styles.reportTitle}>TERM REPORT CARD</Text>
          <Text>{data.termName}</Text>
        </View>

        <View style={styles.studentInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Student Name:</Text>
            <Text>{data.studentName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Admission No:</Text>
            <Text>{data.admissionNumber || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Class:</Text>
            <Text>{data.className}</Text>
          </View>
          {data.overallScore !== null && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Overall Score:</Text>
              <Text>{data.overallScore.toFixed(1)}%</Text>
            </View>
          )}
          {data.conduct && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Conduct:</Text>
              <Text style={{ textTransform: "capitalize" }}>
                {data.conduct.replace("_", " ")}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attendance Summary</Text>
          <View style={styles.attendance}>
            <View>
              <Text>Total Lessons: {data.totalLessons || "N/A"}</Text>
            </View>
            <View>
              <Text>Lessons Attended: {data.lessonsAttended || "N/A"}</Text>
            </View>
            <View>
              <Text>Attendance Rate: {attendancePercentage}%</Text>
            </View>
          </View>
        </View>

        {data.classTeacherComment && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Class Teacher's Comment</Text>
            <View style={styles.comment}>
              <Text>{data.classTeacherComment}</Text>
            </View>
          </View>
        )}

        {data.principalComment && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Principal's Comment</Text>
            <View style={styles.comment}>
              <Text>{data.principalComment}</Text>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Text>Generated on {new Date().toLocaleDateString("en-KE")} • EduTrack Kenya</Text>
        </View>
      </Page>
    </Document>
  );
}