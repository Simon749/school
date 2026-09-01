// src/app/(dashboard)/parent/[studentId]/reports/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ParentReportsPage({
  params,
}: {
  params: { studentId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Verify guardian access
  const guardian = await prisma.guardian.findFirst({
    where: { userId, studentId: params.studentId, isActive: true },
    include: {
      student: {
        include: {
          stream: { select: { name: true } },
        },
      },
    },
  });

  if (!guardian) {
    return <div className="p-8 text-red-500">Access denied.</div>;
  }

  // Get published reports only
  const reports = await prisma.termReport.findMany({
    where: {
      studentId: params.studentId,
      publishedAt: { not: null }, // Only published reports
    },
    include: {
      term: { select: { name: true } },
    },
    orderBy: { term: { startDate: "desc" } },
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {guardian.student.firstName}'s Report Cards
        </h1>
        <p className="text-muted-foreground">
          {guardian.student.stream.name} • Download term reports
        </p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No report cards available yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader>
                <CardTitle className="text-lg">{report.term.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.overallScore && (
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Score</p>
                    <p className="text-2xl font-bold">{Number(report.overallScore).toFixed(1)}%</p>
                  </div>
                )}
                {report.conduct && (
                  <div>
                    <p className="text-sm text-muted-foreground">Conduct</p>
                    <Badge variant="outline" className="capitalize">
                      {report.conduct.replace("_", " ")}
                    </Badge>
                  </div>
                )}
                <Link href={`/api/results/reports/${report.id}/pdf`} target="_blank">
                  <Button className="w-full">Download PDF</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}