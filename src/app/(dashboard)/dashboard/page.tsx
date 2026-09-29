"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const ROLE_DASHBOARDS: Record<string, string> = {
  admin: "/admin",
  deputy: "/deputy",
  teacher: "/teacher",
  bursar: "/bursar",
  parent: "/parent",
  it_admin: "/it_admin",
};

export default function DashboardRedirectPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    const role = user?.publicMetadata?.role;
    const destination = typeof role === "string" ? ROLE_DASHBOARDS[role] : undefined;

    router.replace(destination || "/");
  }, [isLoaded, router, user]);

  return <div className="p-4 text-slate-500">Loading your dashboard...</div>;
}
