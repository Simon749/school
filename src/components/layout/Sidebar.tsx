"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarDays,
  ClipboardList,
  Calendar,
  Settings,
  BarChart3,
  AlertTriangle,
  BookOpen,
  MessageSquare,
  FileText,
  CreditCard,
  ShieldAlert,
  Home,
  Award,
  Upload,
  Download,
  School,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_NAVIGATION, NavItem } from "@/lib/navigation";
import { UserRole } from "@prisma/client";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarDays,
  ClipboardList,
  Calendar,
  Settings,
  BarChart3,
  AlertTriangle,
  BookOpen,
  MessageSquare,
  FileText,
  CreditCard,
  ShieldAlert,
  Home,
  Award,
  Upload,
  Download,
};

function SidebarLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = ICON_MAP[item.icon] || LayoutDashboard;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-emerald-50 text-emerald-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.badge && (
        <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-100 px-1.5 text-xs font-semibold text-rose-700">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();

  // In a real app, role comes from our users table (Prisma), not Clerk metadata.
  // For Phase 0 we read from Clerk publicMetadata as a bridge until the DB sync
  // worker is built (Phase 1.1).
  const role = (user?.publicMetadata?.role as UserRole) || "admin";
  const navItems = ROLE_NAVIGATION[role] || ROLE_NAVIGATION.admin;

  if (!isLoaded) {
    return (
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="h-16 border-b border-slate-200" />
        <nav className="flex-1 space-y-1 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
        <School className="h-6 w-6 text-emerald-600" />
        <span className="text-lg font-bold text-slate-900">EduTrack</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>

      {/* User pill */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
            {user?.firstName?.[0] || "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-slate-500 capitalize">{role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}