import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

// GET: Read settings
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true },
  });

  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Added phone and email to the select so the UI can display them
  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { 
      id: true,
      name: true, 
      phone: true, 
      email: true,
      latitude: true, 
      longitude: true, 
      geofenceRadius: true 
    },
  });

  if (!school) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(school);
}

// PUT: Update settings (This was missing!)
export async function PUT(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
  // Only allow admins and IT admins to change school settings
  if (user.role !== "admin" && user.role !== "it_admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, phone, email, latitude, longitude, geofenceRadius } = body;

    // 1. Update the database
    const updatedSchool = await prisma.school.update({
      where: { id: user.schoolId },
      data: {
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
        // Only update coordinates if they are valid numbers
        latitude: latitude !== null && latitude !== undefined ? latitude : undefined,
        longitude: longitude !== null && longitude !== undefined ? longitude : undefined,
        geofenceRadius: geofenceRadius !== undefined ? geofenceRadius : undefined,
      },
    });

    // 2. THE MAGIC BULLET: Bust the cache!
    // This forces Next.js to discard the cached HTML for the layout (Sidebar/Header)
    // and fetch the new school name/data on the very next render.
    revalidatePath("/", "layout"); 

    return NextResponse.json(updatedSchool);
  } catch (error) {
    console.error("Error updating school settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}