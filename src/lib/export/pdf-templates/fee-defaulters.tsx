import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  schoolInfo: {
    flex: 1,
  },
  schoolName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  reportMeta: {
    fontSize: 9,
    color: "#666",
  },
  logo: {
    width: 60,
    height: 60,
  },
  table: {
    display: "flex",
    width: "auto",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#bfbfbf",
    marginBottom: 20,
  },
  tableRow: {
    margin: "auto",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#bfbfbf",
    borderBottomStyle: "solid",
    alignItems: "center",
    minHeight: 24,
  },
  tableHeader: {
    backgroundColor: "#f0f0f0",
    fontWeight: "bold",
  },
  tableCol: {
    width: "20%",
    borderStyle: "solid",
    borderRightWidth: 1,
    borderRightColor: "#bfbfbf",
    padding: 6,
  },
  tableColName: {
    width: "30%",
    borderStyle: "solid",
    borderRightWidth: 1,
    borderRightColor: "#bfbfbf",
    padding: 6,
  },
  tableColLast: {
    width: "20%",
    padding: 6,
  },
  summary: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#f9f9f9",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontWeight: "bold",
  },
  summaryValue: {
    fontSize: 12,
  },
  totalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: "#333",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#d32f2f",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: "center",
    fontSize: 8,
    color: "#999",
  },
});

interface DefaulterRow {
  studentName: string;
  admissionNumber: string;
  streamName: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
}

interface FeeDefaultersPDFProps {
  schoolName: string;
  termName: string;
  generatedAt: string;
  defaulters: DefaulterRow[];
}

export const FeeDefaultersPDF = ({
  schoolName,
  termName,
  generatedAt,
  defaulters,
}: FeeDefaultersPDFProps) => {
  const totalDue = defaulters.reduce((sum, d) => sum + d.totalDue, 0);
  const totalPaid = defaulters.reduce((sum, d) => sum + d.totalPaid, 0);
  const totalBalance = defaulters.reduce((sum, d) => sum + d.balance, 0);

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.schoolInfo}>
            <Text style={styles.schoolName}>{schoolName}</Text>
            <Text style={styles.reportTitle}>Fee Defaulters Report</Text>
            <Text style={styles.reportMeta}>
              Term: {termName} | Generated: {generatedAt}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          {/* Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <View style={styles.tableColName}>
              <Text>Student Name</Text>
            </View>
            <View style={styles.tableCol}>
              <Text>Admission No</Text>
            </View>
            <View style={styles.tableCol}>
              <Text>Stream</Text>
            </View>
            <View style={styles.tableCol}>
              <Text>Total Due</Text>
            </View>
            <View style={styles.tableCol}>
              <Text>Total Paid</Text>
            </View>
            <View style={styles.tableColLast}>
              <Text>Balance</Text>
            </View>
          </View>

          {/* Data Rows */}
          {defaulters.map((defaulter, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.tableColName}>
                <Text>{defaulter.studentName}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text>{defaulter.admissionNumber}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text>{defaulter.streamName}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text>{formatCurrency(defaulter.totalDue)}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text>{formatCurrency(defaulter.totalPaid)}</Text>
              </View>
              <View style={styles.tableColLast}>
                <Text>{formatCurrency(defaulter.balance)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Students:</Text>
            <Text style={styles.summaryValue}>{defaulters.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Fees Due:</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalDue)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Collected:</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalPaid)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Outstanding Balance:</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalBalance)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>
            This report is confidential and intended for school administration use only.
          </Text>
          <Text>Generated by EduTrack Kenya</Text>
        </View>
      </Page>
    </Document>
  );
};