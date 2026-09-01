import { UserRole } from "@prisma/client";

export interface NavItem {
  label: string;
  href: string;
  icon: string; 
  badge?: string;
}

export const ROLE_NAVIGATION: Record<UserRole, NavItem[]> = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: "LayoutDashboard" },
    { label: "Students", href: "/admin/students", icon: "Users" },
    { label: "Teachers", href: "/admin/teachers", icon: "UserCheck" },
    { label: "Timetable", href: "/admin/timetable", icon: "CalendarDays" },
    { label: "Attendance", href: "/admin/attendance", icon: "ClipboardList" },
    { label: "Calendar", href: "/admin/calendar", icon: "Calendar" },
    { label: "Settings", href: "/admin/settings/school", icon: "Settings" },
  ],
  deputy: [
    { label: "Dashboard", href: "/deputy", icon: "LayoutDashboard" },
    { label: "Teacher Performance", href: "/deputy/teacher-performance", icon: "BarChart3" },
    { label: "Uncovered Lessons", href: "/deputy/uncovered-lessons", icon: "AlertTriangle" },
  ],
  teacher: [
    { label: "Today", href: "/teacher", icon: "CalendarDays" },
    { label: "Attendance", href: "/teacher/attendance", icon: "ClipboardList" },
    { label: "Markbook", href: "/teacher/markbook", icon: "BookOpen" },
    { label: "Messages", href: "/teacher/messages", icon: "MessageSquare" },
  ],
  bursar: [
    { label: "Dashboard", href: "/bursar", icon: "LayoutDashboard" },
    { label: "Fee Structure", href: "/bursar/fees/structure", icon: "FileText" },
    { label: "Payments", href: "/bursar/fees/payments", icon: "CreditCard" },
    { label: "Disputes", href: "/bursar/fees/disputes", icon: "ShieldAlert" },
    { label: "Reports", href: "/bursar/reports", icon: "BarChart3" },
  ],
  parent: [
    { label: "Home", href: "/parent", icon: "Home" },
    { label: "Attendance", href: "/parent/attendance", icon: "ClipboardList" },
    { label: "Results", href: "/parent/results", icon: "Award" },
    { label: "Fees", href: "/parent/fees", icon: "CreditCard" },
    { label: "Messages", href: "/parent/messages", icon: "MessageSquare" },
  ],
  it_admin: [
    { label: "Dashboard", href: "/it_admin", icon: "LayoutDashboard" },
    { label: "Import", href: "/it_admin/import", icon: "Upload" },
    { label: "Export", href: "/it_admin/export", icon: "Download" },
    { label: "Users", href: "/it_admin/users", icon: "Users" },
  ],
};