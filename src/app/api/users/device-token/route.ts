// src/app/api/users/device-token/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const storeTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const body = await request.json();
    const { token } = storeTokenSchema.parse(body);

    // Check if token already exists
    if (user.deviceTokens?.includes(token)) {
      return NextResponse.json({ success: true, message: "Token already registered" });
    }

    // Add token to user's device_tokens array
    await prisma.user.update({
      where: { id: user.id },
      data: {
        deviceTokens: {
          push: token,
        },
        hasAppInstalled: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    console.error("Store device token error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Remove token from user's device_tokens array
    await prisma.user.update({
      where: { id: user.id },
      data: {
        deviceTokens: {
          set: user.deviceTokens?.filter((t) => t !== token) || [],
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete device token error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}