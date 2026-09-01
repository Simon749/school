import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get("termId");
  const streamId = searchParams.get("streamId");
  const teacherId = searchParams.get("teacherId");

  if (!termId) return NextResponse.json({ error: "termId required" }, { status: 400 });

  const where: any = { schoolId: user.schoolId, termId };
  if (streamId) where.streamId = streamId;
  if (teacherId) where.teacherId = teacherId;

  const [periods, slots, streams, teachers, learningAreas] = await Promise.all([
    prisma.timetablePeriod.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { orderIndex: "asc" },
    }),
    prisma.timetableSlot.findMany({
      where,
      include: {
        learningArea: { select: { id: true, name: true, color: true } },
        teacher: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        stream: { include: { grade: { select: { name: true } } } },
        period: true,
        secondPeriod: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.stream.findMany({
      where: { schoolId: user.schoolId },
      include: { grade: { select: { id: true, name: true } } },
      orderBy: [{ grade: { level: "asc" } }, { name: "asc" }],
    }),
    prisma.teacher.findMany({
      where: { schoolId: user.schoolId },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.learningArea.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  return NextResponse.json({ periods, slots, streams, teachers, learningAreas });
}