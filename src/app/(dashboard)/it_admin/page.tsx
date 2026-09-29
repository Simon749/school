import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { exportQueue } from "@/lib/export/queue"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { 
  Users, GraduationCap, UserCheck, MessageSquare, 
  Upload, Download, UserPlus, FileText, 
  Database, Activity, CheckCircle2, AlertCircle, XCircle 
} from "lucide-react";

export default async function ItAdminDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // 1. Verify IT Admin Role
  const currentUser = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { school: true },
  });

  if (!currentUser || currentUser.role !== "it_admin") {
    redirect("/unauthorized");
  }

  const schoolId = currentUser.schoolId;

  // 2. Fetch Dashboard Metrics
  const [totalUsers, totalStudents, totalTeachers, recentAuditLogs] = await Promise.all([
    prisma.user.count({ where: { schoolId, deletedAt: null } }),
    prisma.student.count({ where: { schoolId, status: "active", deletedAt: null } }),
    prisma.teacher.count({ where: { schoolId } }),
    prisma.auditLog.findMany({
      where: { schoolId },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  // 3. LIVE SYSTEM HEALTH CHECKS
  let dbStatus: "connected" | "disconnected" = "disconnected";
  let redisStatus: "connected" | "disconnected" = "disconnected";
  let queueStatus: "active" | "warning" | "disconnected" = "disconnected";

  // Check Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (error) {
    console.error("[Health Check] DB Failed:", error);
    dbStatus = "disconnected";
  }

  // Check Redis
  try {
    await redis.ping();
    redisStatus = "connected";
  } catch (error) {
    console.error("[Health Check] Redis Failed:", error);
    redisStatus = "disconnected";
  }

  // Check BullMQ (via exportQueue)
  try {
    await exportQueue.getJobCounts();
    queueStatus = "active";
  } catch (error) {
    console.error("[Health Check] BullMQ Failed:", error);
    // If Redis is up but BullMQ fails, it's a warning. If both fail, it's disconnected.
    queueStatus = redisStatus === "connected" ? "warning" : "disconnected";
  }

  const stats = [
    { label: "Total Users", value: totalUsers, icon: Users, color: "text-blue-600" },
    { label: "Active Students", value: totalStudents, icon: GraduationCap, color: "text-green-600" },
    { label: "Teachers", value: totalTeachers, icon: UserCheck, color: "text-purple-600" },
    { label: "SMS Balance", value: currentUser.school.smsBalance, icon: MessageSquare, color: "text-orange-600" },
  ];

  const quickActions = [
    { label: "Import Students", desc: "Bulk upload via CSV", href: "/it_admin/import", icon: Upload, color: "bg-blue-50 text-blue-600 border-blue-200" },
    { label: "Add New User", desc: "Create staff or parent account", href: "/it_admin/users", icon: UserPlus, color: "bg-green-50 text-green-600 border-green-200" },
    { label: "Export Data", desc: "Download reports & records", href: "/it_admin/export", icon: Download, color: "bg-purple-50 text-purple-600 border-purple-200" },
    { label: "Audit Logs", desc: "View system activity", href: "/it_admin/audit", icon: FileText, color: "bg-orange-50 text-orange-600 border-orange-200" },
  ];

  const formatAction = (action: string) => {
    return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  // Helper for health card styling
  const getHealthIcon = (status: string) => {
    if (status === "connected" || status === "active") return <CheckCircle2 className="h-3 w-3" />;
    if (status === "warning") return <AlertCircle className="h-3 w-3" />;
    return <XCircle className="h-3 w-3" />;
  };

  const getHealthColor = (status: string) => {
    if (status === "connected" || status === "active") return "text-green-600";
    if (status === "warning") return "text-yellow-600";
    return "text-red-600";
  };

  const getHealthText = (status: string) => {
    if (status === "connected") return "Connected";
    if (status === "active") return "Active & Listening";
    if (status === "warning") return "Connected (Workers Offline)";
    return "Disconnected";
  };

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">IT Admin Dashboard</h1>
        <p className="text-slate-500 mt-1">System overview, user management, and data operations for {currentUser.school.name}.</p>
      </div>

      {/* 1. Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {stat.value.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 2. Quick Actions */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Link key={action.label} href={action.href}>
                <Card className={`h-full border-2 transition-all hover:shadow-md ${action.color}`}>
                  <CardHeader className="flex flex-row items-center gap-4 pb-2">
                    <action.icon className="h-6 w-6" />
                    <CardTitle className="text-base">{action.label}</CardTitle>
                </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600">{action.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* 3. Infrastructure Status (LIVE HEALTH CHECKS) */}
          <h2 className="text-lg font-semibold text-slate-900 mt-8">System Health</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Database Card */}
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Database className={`h-5 w-5 ${getHealthColor(dbStatus)}`} />
                <div>
                  <p className="text-sm font-medium">Database</p>
                  <p className={`text-xs flex items-center gap-1 ${getHealthColor(dbStatus)}`}>
                    {getHealthIcon(dbStatus)} {getHealthText(dbStatus)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Redis Card */}
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Activity className={`h-5 w-5 ${getHealthColor(redisStatus)}`} />
                <div>
                  <p className="text-sm font-medium">Cache (Redis)</p>
                  <p className={`text-xs flex items-center gap-1 ${getHealthColor(redisStatus)}`}>
                    {getHealthIcon(redisStatus)} {getHealthText(redisStatus)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* BullMQ Card */}
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Activity className={`h-5 w-5 ${getHealthColor(queueStatus)}`} />
                <div>
                  <p className="text-sm font-medium">Job Queue (BullMQ)</p>
                  <p className={`text-xs flex items-center gap-1 ${getHealthColor(queueStatus)}`}>
                    {getHealthIcon(queueStatus)} {getHealthText(queueStatus)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 4. Recent Audit Activity */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
            <Link href="/it_admin/audit">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              {recentAuditLogs.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No recent system activity.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Time</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAuditLogs.map((log) => (
                      <TableRow key={log.id.toString()}>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(log.createdAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <span className="font-medium">{formatAction(log.action)}</span>
                            <p className="text-xs text-slate-500">
                              on {log.tableName.replace(/_/g, " ")}
                              {log.actor && ` by ${log.actor.firstName}`}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}