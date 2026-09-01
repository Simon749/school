import { NextResponse } from "next/server";
import { attendanceQueue } from "@/lib/queue";

export async function POST() {
  const job = await attendanceQueue.add(
    "test-job",
    {
      type: "teacher-check-in",
      payload: {
        teacherId: "test-teacher",
        schoolId: "test-school",
        slotId: "test-slot",
        date: new Date().toISOString().split("T")[0],
        checkedInAt: new Date().toISOString(),
        checkInLat: -1.2921,
        checkInLng: 36.8219,
        geofencePassed: true,
        qrScanned: true,
        status: "present",
        minutesLate: 0,
        lessonNotes: "Queue smoke test",
      },
    },
    { attempts: 1 }
  );

  return NextResponse.json({
    success: true,
    jobId: job.id,
    message:
      "Test job enqueued. Start the worker (npm run workers) and check its console output. It will fail with a FK error (test IDs), but the worker picking it up proves the queue is connected.",
  });
}