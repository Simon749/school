import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
  header: {
    marginBottom: 20,
    textAlign: 'center',
    borderBottom: 2,
    borderColor: '#000',
    paddingBottom: 10,
  },
  schoolName: { fontSize: 16, fontWeight: 'bold', textTransform: 'uppercase' },
  county: { fontSize: 10, color: '#555', marginTop: 4 },
  reportTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 10, textDecoration: 'underline' },

  studentInfo: { marginBottom: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  infoBlock: { width: '48%' },
  infoLabel: { fontSize: 9, color: '#666', fontWeight: 'bold', marginBottom: 2 },
  infoValue: { fontSize: 11, fontWeight: 'bold' },

  table: { marginBottom: 20, borderWidth: 1, borderColor: '#000' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderColor: '#000',
    fontWeight: 'bold',
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#000', minHeight: 24 },
  colLa: { width: '35%', padding: 6, borderRightWidth: 1, borderColor: '#000' },
  colLevel: {
    width: '25%',
    padding: 6,
    borderRightWidth: 1,
    borderColor: '#000',
    textAlign: 'center',
  },
  colComment: { width: '40%', padding: 6 },

  section: { marginBottom: 15 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 5,
    backgroundColor: '#f0f0f0',
    padding: 4,
  },
  sectionText: { fontSize: 10, lineHeight: 1.4 },

  attendanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    fontSize: 10,
  },

  footer: {
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    fontSize: 10,
  },
  signatureBox: {
    width: '35%',
    borderTopWidth: 1,
    borderColor: '#000',
    paddingTop: 5,
    textAlign: 'center',
  },
  stampBox: {
    width: 80,
    height: 80,
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    color: '#ccc',
    fontSize: 8,
    textAlign: 'center',
  },

  bottomNote: {
    marginTop: 20,
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
    borderTopWidth: 1,
    borderColor: '#ccc',
    paddingTop: 10,
  },
});

interface CBCRow {
  learningArea: string;
  performanceLevel: string;
  comment: string;
}

interface TermReportData {
  schoolName: string;
  county: string;
  termName: string;
  academicYear: string;
  studentName: string;
  upiNumber: string;
  admissionNumber: string;
  className: string;
  classTeacherComment: string;
  principalComment: string;
  conduct: string;
  totalLessons: number;
  lessonsAttended: number;
  cbcTableData: CBCRow[];
  closingDate: string;
  nextTermBegins: string;
}

export const TermReportPDF = ({ data }: { data: TermReportData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.schoolName}>{data.schoolName}</Text>
        <Text style={styles.county}>{data.county} County, Kenya</Text>
        <Text style={styles.reportTitle}>CBC LEARNER'S PROGRESS REPORT</Text>
        <Text style={{ fontSize: 11, marginTop: 5 }}>
          {data.academicYear} - {data.termName}
        </Text>
      </View>

      {/* Student Info */}
      <View style={styles.studentInfo}>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>LEARNER'S NAME:</Text>
          <Text style={styles.infoValue}>{data.studentName}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>UPI (NEMIS) NUMBER:</Text>
          <Text style={styles.infoValue}>{data.upiNumber}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>ADMISSION NUMBER:</Text>
          <Text style={styles.infoValue}>{data.admissionNumber}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>CLASS & STREAM:</Text>
          <Text style={styles.infoValue}>{data.className}</Text>
        </View>
      </View>

      {/* CBC Performance Table */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={styles.colLa}>
            <Text>LEARNING AREA</Text>
          </View>
          <View style={styles.colLevel}>
            <Text>PERFORMANCE LEVEL</Text>
          </View>
          <View style={styles.colComment}>
            <Text>TEACHER'S COMMENT</Text>
          </View>
        </View>
        {data.cbcTableData.map((row, idx) => (
          <View key={idx} style={styles.tableRow}>
            <View style={styles.colLa}>
              <Text>{row.learningArea}</Text>
            </View>
            <View style={styles.colLevel}>
              <Text>{row.performanceLevel}</Text>
            </View>
            <View style={styles.colComment}>
              <Text>{row.comment}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Conduct & Attendance */}
      <View style={styles.attendanceRow}>
        <View style={{ width: '48%' }}>
          <Text style={styles.infoLabel}>CONDUCT / BEHAVIOUR:</Text>
          <Text style={styles.infoValue}>{data.conduct}</Text>
        </View>
        <View style={{ width: '48%' }}>
          <Text style={styles.infoLabel}>ATTENDANCE:</Text>
          <Text style={styles.infoValue}>
            {data.lessonsAttended} / {data.totalLessons} Lessons
          </Text>
        </View>
      </View>

      {/* Comments */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CLASS TEACHER'S COMMENTS ON COMPETENCIES & VALUES:</Text>
        <Text style={styles.sectionText}>{data.classTeacherComment}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PRINCIPAL'S COMMENTS:</Text>
        <Text style={styles.sectionText}>{data.principalComment}</Text>
      </View>

      {/* Footer: Signatures & Stamp */}
      <View style={styles.footer}>
        <View>
          <Text style={{ fontSize: 9, marginBottom: 30 }}>Closing Date: {data.closingDate}</Text>
          <Text style={{ fontSize: 9 }}>Next Term Begins: {data.nextTermBegins}</Text>
        </View>
        <View style={styles.stampBox}>
          <Text>OFFICIAL</Text>
          <Text>SCHOOL</Text>
          <Text>STAMP</Text>
        </View>
        <View style={styles.signatureBox}>
          <Text>Class Teacher's Signature</Text>
        </View>
        <View style={styles.signatureBox}>
          <Text>Principal's Signature</Text>
        </View>
      </View>

      <View style={styles.bottomNote}>
        <Text>
          Performance Levels: EE (Exceeding Expectations) | ME (Meeting Expectations) | AE
          (Approaching Expectations) | BE (Below Expectations)
        </Text>
        <Text>
          This report reflects the learner's progress based on official CBC assessment rubrics.
          Generated securely by EduTrack Kenya.
        </Text>
      </View>
    </Page>
  </Document>
);
