import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { attendanceQueue } from "@/lib/queue";
import { isInsideGeofence } from "@/lib/geofence/check";
import { verifyQrToken } from "@/lib/qr/token";

// ── GET: Admin dashboard ────────────────────────────────────
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") || new Date().toISOString().split("T")[0];
  const date = new Date(dateParam);

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });
  if (!currentTerm) return NextResponse.json({ error: "No current term" }, { status: 400 });

  const dayOfWeek = date.getDay(); // 0=Sun...6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const [periods, slots, attendances] = await Promise.all([
    prisma.timetablePeriod.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { orderIndex: "asc" },
    }),
    prisma.timetableSlot.findMany({
      where: {
        schoolId: user.schoolId,
        termId: currentTerm.id,
        dayOfWeek,
        isPublished: true,
      },
      include: {
        learningArea: { select: { name: true, color: true } },
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        stream: { include: { grade: { select: { name: true } } } },
        period: true,
      },
      orderBy: { period: { orderIndex: "asc" } },
    }),
    prisma.teacherAttendance.findMany({
      where: { schoolId: user.schoolId, date },
      include: {
        teacher: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        slot: { include: { period: true, learningArea: true } },
      },
    }),
  ]);

  const now = new Date();
  const alertThreshold = 5 * 60 * 1000; // 5 minutes

  const enriched = slots.map((slot) => {
    const att = attendances.find(
      (a) => a.slotId === slot.id && a.teacherId === slot.teacherId
    );

    const periodStart = new Date(`${dateParam}T${slot.period.startTime}`);
    const periodEnd = new Date(`${dateParam}T${slot.period.endTime}`);
    const timeUntilStart = periodStart.getTime() - now.getTime();

    let status: "pending" | "present" | "late" | "absent" = "pending";
    if (att) {
      status = att.status as any;
    } else if (now > periodEnd) {
      status = "absent";
    } else if (now > periodStart && !att) {
      status = "absent";
    }

    const needsAlert = !att && timeUntilStart > 0 && timeUntilStart <= alertThreshold;

    return {
      ...slot,
      attendance: att || null,
      status,
      needsAlert,
      timeUntilStart,
    };
  });

  return NextResponse.json({
    date: dateParam,
    isWeekend,
    periods,
    slots: enriched,
  });
}

// ── POST: Teacher check-in ──────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });

  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, schoolId: user.schoolId },
    include: { user: true },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher record not found" }, { status: 404 });

  const body = await req.json();
  const { slotId, latitude, longitude, qrToken, lessonNotes } = body;

  if (!slotId || latitude == null || longitude == null || !qrToken) {
    return NextResponse.json(
      { error: "slotId, latitude, longitude, and qrToken are required" },
      { status: 400 }
    );
  }

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: slotId, schoolId: user.schoolId },
    include: { period: true, school: true },
  });
  if (!slot) return NextResponse.json({ error: "Invalid slot" }, { status: 400 });

  // ── 1. Geofence validation ──
  if (
    slot.school.latitude == null ||
    slot.school.longitude == null ||
    slot.school.geofenceRadius == null
  ) {
    return NextResponse.json(
      { error: "School geofence not configured. Contact admin." },
      { status: 400 }
    );
  }

  const geo = isInsideGeofence(
    latitude,
    longitude,
    Number(slot.school.latitude),
    Number(slot.school.longitude),
    slot.school.geofenceRadius
  );

  if (!geo.isInside) {
    return NextResponse.json(
      {
        error: "Outside school geofence",
        distance: Math.round(geo.distance),
        radius: slot.school.geofenceRadius,
      },
      { status: 403 }
    );
  }

  // ── 2. QR token validation ──
  const qrCheck = verifyQrToken(qrToken);
  if (!qrCheck.valid || qrCheck.slotId !== slotId) {
    return NextResponse.json({ error: "Invalid or expired QR token" }, { status: 410 });
  }

  const tokenRecord = await prisma.classroomQrToken.findFirst({
    where: { token: qrToken, slotId, usedAt: null },
  });
  if (!tokenRecord) {
    return NextResponse.json({ error: "QR token already used or not found" }, { status: 410 });
  }

  // ── 3. Time window validation ──
  const today = new Date().toISOString().split("T")[0];
  const periodStart = new Date(`${today}T${slot.period.startTime}`);
  const periodEnd = new Date(`${today}T${slot.period.endTime}`);
  const now = new Date();

  // Allow check-in from 10 min before start until period end
  const windowStart = new Date(periodStart.getTime() - 10 * 60 * 1000);
  if (now < windowStart) {
    return NextResponse.json(
      { error: "Too early. Check-in opens 10 minutes before period start." },
      { status: 425 }
    );
  }
  if (now > periodEnd) {
    return NextResponse.json(
      { error: "Period has ended. Cannot check in." },
      { status: 410 }
    );
  }

  // ── 4. Mark token used ──
  await prisma.classroomQrToken.update({
    where: { id: tokenRecord.id },
    data: { usedAt: now },
  });

  // ── 5. Calculate lateness ──
  const diffMs = now.getTime() - periodStart.getTime();
  const minutesLate = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
  const status = minutesLate > 10 ? "late" : "present";

  // ── 6. Enqueue write ──
  const job = await attendanceQueue.add(
    "teacher-check-in",
    {
      type: "teacher-check-in",
      payload: {
        teacherId: teacher.id,
        schoolId: user.schoolId,
        slotId,
        date: today,
        checkedInAt: now.toISOString(),
        checkInLat: latitude,
        checkInLng: longitude,
        geofencePassed: true,
        qrScanned: true,
        status,
        minutesLate: minutesLate > 0 ? minutesLate : null,
        lessonNotes: lessonNotes || null,
      },
    },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
  );

  return NextResponse.json(
    {
      success: true,
      message: `✓ Checked in at ${now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })} — ${slot.room || "Room TBD"}`,
      status,
      minutesLate: minutesLate > 0 ? minutesLate : null,
      distance: Math.round(geo.distance),
      jobId: job.id,
    },
    { status: 202 }
  );
}