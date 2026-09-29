// app/(dashboard)/it_admin/layout.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function ItAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } =  auth();
  
  if (!userId) {
    console.log("[IT Admin Layout] No userId - redirecting to sign-in");
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, schoolId: true, firstName: true, lastName: true },
  });

  if (!user) {
    console.error("[IT Admin Layout] User not found in database with clerkId:", userId);
    redirect("/unauthorized");
  }

  if (user.role !== "it_admin") {
    console.error("[IT Admin Layout] User role mismatch. Has:", user.role, "Needs: it_admin");
    redirect("/unauthorized");
  }

  return <div className="flex-1 min-h-screen w-full">{children}</div>;
}