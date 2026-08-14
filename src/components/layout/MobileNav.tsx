"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Menu, X, School } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_NAVIGATION } from "@/lib/navigation";
import { UserRole } from "@prisma/client";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();

  const role = (user?.publicMetadata?.role as UserRole) || "admin";
  const navItems = ROLE_NAVIGATION[role] || ROLE_NAVIGATION.admin;

  return (
    <div className="lg:hidden">
      {/* Top bar */}
      <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2">
          <School className="h-5 w-5 text-emerald-600" />
          <span className="font-bold text-slate-900">EduTrack</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Drawer */}
      {open && (
        <div className="absolute inset-x-0 top-14 z-50 border-b border-slate-200 bg-white shadow-lg">
          <nav className="space-y-1 p-4">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}