import { ReactNode } from "react";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import { OfflineBanner } from "@/components/layout/OfflineBanner";

export const metadata = {
  title: "EduTrack Kenya — Dashboard",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <MobileNav />

        {/* Page content — this is the only thing that scrolls */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
        <OfflineBanner />
      </div>
    </div>
  );
}