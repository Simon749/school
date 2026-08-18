// src/app/api/messages/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createMessageSchema } from "@/lib/validations/message.schema";
import { smsQueue } from "@/lib/queue";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sender = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { school: true },
  });

  if (!sender) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const body = await request.json();
    const data = createMessageSchema.parse(body);

    // Determine recipients based on message type
    let recipientIds: string[] = [];

    if (data.messageType === "direct" && data.recipientId) {
      recipientIds = [data.recipientId];
    } else if (data.messageType === "class" && data.streamId) {
      const guardians = await prisma.guardian.findMany({
        where: {
          student: {
            streamId: data.streamId,
            schoolId: sender.schoolId,
            status: "active",
          },
          isActive: true,
        },
        select: { userId: true },
      });
      recipientIds = guardians.map((g) => g.userId);
    } else if (data.messageType === "school_wide") {
      const guardians = await prisma.guardian.findMany({
        where: {
          student: { schoolId: sender.schoolId, status: "active" },
          isActive: true,
        },
        select: { userId: true },
      });
      recipientIds = guardians.map((g) => g.userId);
    } else {
      return NextResponse.json({ error: "Invalid message type or missing recipients" }, { status: 400 });
    }

    // Check SMS balance if sending via SMS
    if (data.sendViaSms) {
      const smsCount = Math.ceil(data.body.length / 160);
      const totalCost = smsCount * recipientIds.length;

      if (sender.school.smsBalance < totalCost) {
        return NextResponse.json(
          {
            error: "Insufficient SMS balance",
            required: totalCost,
            available: sender.school.smsBalance,
          },
          { status: 400 }
        );
      }
    }

    // Create messages for each recipient
    const messages = await prisma.$transaction(
      recipientIds.map((recipientId) =>
        prisma.message.create({
          data: {
            schoolId: sender.schoolId,
            senderId: sender.id,
            recipientId,
            streamId: data.streamId,
            subject: data.subject,
            body: data.body,
            messageType: data.messageType,
            sentVia: data.sendViaSms ? ["in_app", "sms"] : ["in_app"],
            smsSent: false,
          },
        })
      )
    );

    // Enqueue SMS jobs if sendViaSms is true
    if (data.sendViaSms) {
      await smsQueue.add(
        "send-messages",
        {
          messageIds: messages.map((m) => m.id),
          priority: "normal",
        },
        {
          // Remove completed jobs after 24 hours
          removeOnComplete: { age: 24 * 3600 },
          // Keep failed jobs for 7 days for debugging
          removeOnFail: { age: 7 * 24 * 3600 },
        }
      );
    }

    return NextResponse.json({ success: true, count: messages.length }, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    console.error("Message creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: List messages for the current user
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const messages = await prisma.message.findMany({
    where: {
      schoolId: user.schoolId,
      recipientId: user.id,
      ...(unreadOnly && { readAt: null }),
    },
    include: {
      sender: {
        select: {
          firstName: true,
          lastName: true,
          role: true,
          teacher: { select: { isClassTeacher: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const total = await prisma.message.count({
    where: {
      schoolId: user.schoolId,
      recipientId: user.id,
      ...(unreadOnly && { readAt: null }),
    },
  });

  return NextResponse.json({ messages, total, page, limit });
}