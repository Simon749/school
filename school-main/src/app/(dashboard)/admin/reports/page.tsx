// src/app/(dashboard)/admin/reports/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export default async function AdminReportsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user || (user.role !== "admin" && user.role !== "deputy")) {
    return <div className="p-8 text-red-500">Access denied.</div>;
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });

  if (!currentTerm) {
    return <div className="p-8 text-muted-foreground">No current term found.</div>;
  }

  // Get all reports for current term
  const reports = await prisma.termReport.findMany({
    where: { schoolId: user.schoolId, termId: currentTerm.id },
    include: {
      student: {
        include: {
          stream: { include: { grade: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Term Reports</h1>
        <p className="text-muted-foreground">{currentTerm.name} • Review and publish reports</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No reports generated yet for this term.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Teacher Comment</TableHead>
                  <TableHead>Principal Comment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      {report.student.firstName} {report.student.lastName}
                    </TableCell>
                    <TableCell>
                      {report.student.stream.grade.name} {report.student.stream.name}
                    </TableCell>
                    <TableCell>
                      {report.classTeacherComment ? (
                        <span className="text-sm line-clamp-1">{report.classTeacherComment}</span>
                      ) : (
                        <Badge variant="outline">Missing</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {report.principalComment ? (
                        <span className="text-sm line-clamp-1">{report.principalComment}</span>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {report.publishedAt ? (
                        <Badge variant="default">Published</Badge>
                      ) : (
                        <Badge variant="secondary">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/reports/${report.id}`}>
                        <Button variant="outline" size="sm">
                          Review
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}