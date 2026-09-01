// src/app/api/messages/[id]/read/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const messageId = params.id;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!message || message.recipientId !== user.id) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  try {
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { readAt: new Date() },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Mark message read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}