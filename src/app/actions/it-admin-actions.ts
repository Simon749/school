"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const userSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(10).optional().or(z.literal("")),
  role: z.enum(["admin", "deputy", "teacher", "bursar", "parent", "it_admin"]),
  nationalId: z.string().optional().or(z.literal("")),
});

async function verifyItAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user || user.role !== "it_admin") throw new Error("Unauthorized");
  return user;
}

export async function createUserAction(schoolId: string, data: z.infer<typeof userSchema>) {
  try {
    await verifyItAdmin();
    await prisma.user.create({
      data: {
        schoolId, firstName: data.firstName, lastName: data.lastName,
        email: data.email || null, phone: data.phone || null,
        role: data.role, nationalId: data.nationalId || null,
      },
    });
    return { success: true };
  } catch (error: unknown) {
    if (error.code === "P2002") return { error: "Email, Phone, or National ID already exists." };
    return { error: error.message || "Failed to create user" };
  }
}

export async function updateUserAction(userId: string, data: z.infer<typeof userSchema>) {
  try {
    await verifyItAdmin();
    await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName, lastName: data.lastName,
        email: data.email || null, phone: data.phone || null,
        role: data.role, nationalId: data.nationalId || null,
      },
    });
    return { success: true };
  } catch (error: unknown) {
    if (error.code === "P2002") return { error: "Email, Phone, or National ID already exists." };
    return { error: error.message || "Failed to update user" };
  }
}

export async function importStudentsAction(validRows: unknown[]) {
  try {
    const user = await verifyItAdmin();
    // NOTE: For Phase 4, you will expand this to:
    // 1. Find/Create Stream by grade+name
    // 2. Create Student record
    // 3. Create Parent User (if phone provided)
    // 4. Create Guardian link
    // For now, we return a mock success to unblock the UI flow.
    return { success: true, count: validRows.length };
  } catch (error: unknown) {
    return { error: error.message || "Failed to import students" };
  }
}

export async function exportDataAction(type: string) {
  try {
    await verifyItAdmin();
    // NOTE: In Phase 4, this will generate a CSV string, upload to S3, 
    // and return a pre-signed download URL.
    return { success: true, url: `/api/export/mock-${type}.csv` };
  } catch (error: unknown) {
    return { error: error.message || "Failed to generate export" };
  }
}