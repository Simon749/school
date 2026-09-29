import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { teacherSchema } from "@/lib/validations/teacher.schema";

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
    const search = searchParams.get("search")?.trim();

    const where: any = {
        schoolId: user.schoolId,
        user: { deletedAt: null },
    };

    if (search) {
        where.OR = [
            { user: { firstName: { contains: search, mode: "insensitive" } } },
            { user: { lastName: { contains: search, mode: "insensitive" } } },
            { tscNumber: { contains: search, mode: "insensitive" } },
            { user: { nationalId: { contains: search, mode: "insensitive" } } },
        ];
    }

    const teachers = await prisma.teacher.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
            user: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                    nationalId: true,
                    isActive: true,
                },
            },
            classTeacherStream: {
                include: { grade: true },
            },
        },
    });

    return NextResponse.json({ teachers });
}

export async function POST(req: NextRequest) {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = await prisma.user.findUnique({
        where: { clerkId },
        select: { schoolId: true, role: true },
    });

    if (!admin?.schoolId || admin.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = teacherSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Validation failed", issues: parsed.error.issues },
            { status: 400 }
        );
    }

    const data = parsed.data;

    // Validate stream if class teacher
    if (data.isClassTeacher && data.classTeacherStreamId) {
        const stream = await prisma.stream.findFirst({
            where: { id: data.classTeacherStreamId, schoolId: admin.schoolId },
        });
        if (!stream) {
            return NextResponse.json({ error: "Invalid stream for class teacher" }, { status: 400 });
        }
    }

    // Check TSC number uniqueness if provided
    if (data.tscNumber) {
        const existing = await prisma.teacher.findFirst({
            where: { tscNumber: data.tscNumber, schoolId: admin.schoolId },
        });
        if (existing) {
            return NextResponse.json({ error: `TSC number ${data.tscNumber} already exists` }, { status: 409 });
        }
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            // If assigning as class teacher, unassign any existing class teacher of this stream
            if (data.isClassTeacher && data.classTeacherStreamId) {
                await tx.teacher.updateMany({
                    where: { classTeacherStreamId: data.classTeacherStreamId, schoolId: admin.schoolId },
                    data: { isClassTeacher: false, classTeacherStreamId: null },
                });
            }

            // Create user record (no clerkId yet — they will sign up via Clerk invitation later)
            const user = await tx.user.create({
                data: {
                    clerkId: `teacher_${Date.now()}`,
                    schoolId: admin.schoolId,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email || null,
                    phone: data.phone || null,
                    nationalId: data.nationalId || null,
                    role: "teacher",
                },
            });

            // Create teacher record
            const teacher = await tx.teacher.create({
                data: {
                    userId: user.id,
                    schoolId: admin.schoolId,
                    tscNumber: data.tscNumber || null,
                    employmentType: data.employmentType,
                    specialisation: data.specialisation.join(", "),
                    isClassTeacher: data.isClassTeacher,
                    classTeacherStreamId: data.isClassTeacher ? data.classTeacherStreamId || null : null,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            phone: true,
                            nationalId: true,
                        },
                    },
                    classTeacherStream: { include: { grade: true } },
                },
            });

            return { user, teacher };
        });

        return NextResponse.json(
            {
                success: true,
                teacher: result.teacher,
                message: "Teacher created. They will need to be invited via Clerk to log in.",
            },
            { status: 201 }
        );
    } catch (error: unknown) {
        console.error("Create teacher error:", error);
        const message = error instanceof Error ? error.message : "Failed to create teacher";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}