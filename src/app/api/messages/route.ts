// src/app/api/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, type CurrentUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { createMessageSchema } from '@/lib/validations/message.schema';
import { smsQueue, notificationQueue } from '@/lib/queue';

/**
 * Who may message whom (tracker 3.5; SEC-08). Everything is inside the sender's own school.
 *  - admin:   class or school-wide broadcasts; direct to any active user in the school
 *  - teacher: direct to a parent of a student in a class they teach or class-teach
 *  - parent:  direct to the CLASS TEACHER of one of their own children; never broadcasts, never SMS
 *  - deputy / bursar / it_admin: not defined by the tracker yet (decision D18) → refused
 */
const FORBIDDEN_RECIPIENT = { error: 'You cannot message this recipient' };

async function teacherMayMessageGuardian(user: CurrentUser, recipientId: string): Promise<boolean> {
  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, schoolId: user.schoolId },
    select: { id: true, classTeacherStreamId: true },
  });
  if (!teacher) return false;

  const slots = await prisma.timetableSlot.findMany({
    where: { teacherId: teacher.id, schoolId: user.schoolId },
    select: { streamId: true },
    distinct: ['streamId'],
  });
  const streamIds = new Set(slots.map((s) => s.streamId));
  if (teacher.classTeacherStreamId) streamIds.add(teacher.classTeacherStreamId);
  if (streamIds.size === 0) return false;

  const guardian = await prisma.guardian.findFirst({
    where: {
      userId: recipientId,
      isActive: true,
      student: {
        schoolId: user.schoolId,
        deletedAt: null,
        status: 'active',
        streamId: { in: [...streamIds] },
      },
    },
    select: { id: true },
  });
  return Boolean(guardian);
}

async function parentMayMessageClassTeacher(
  user: CurrentUser,
  recipientId: string
): Promise<boolean> {
  const links = await prisma.guardian.findMany({
    where: {
      userId: user.id,
      isActive: true,
      student: { schoolId: user.schoolId, deletedAt: null },
    },
    select: { student: { select: { streamId: true } } },
  });
  const streamIds = [...new Set(links.map((l) => l.student.streamId))];
  if (streamIds.length === 0) return false;

  const classTeacher = await prisma.teacher.findFirst({
    where: {
      userId: recipientId,
      schoolId: user.schoolId,
      isClassTeacher: true,
      classTeacherStreamId: { in: streamIds },
    },
    select: { id: true },
  });
  return Boolean(classTeacher);
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(['admin', 'teacher', 'parent']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = createMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.errors },
      { status: 400 }
    );
  }
  const data = parsed.data;

  if (data.messageType !== 'direct' && user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only the school admin can send class or school-wide messages' },
      { status: 403 }
    );
  }
  if (data.sendViaSms && user.role === 'parent') {
    return NextResponse.json({ error: 'Parents cannot send SMS messages' }, { status: 403 });
  }

  try {
    let recipientIds: string[];

    if (data.messageType === 'direct') {
      const recipientId = data.recipientId as string; // guaranteed by the schema
      const recipient = await prisma.user.findFirst({
        where: { id: recipientId, schoolId: user.schoolId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!recipient) return NextResponse.json(FORBIDDEN_RECIPIENT, { status: 403 });

      if (user.role === 'teacher' && !(await teacherMayMessageGuardian(user, recipientId))) {
        return NextResponse.json(FORBIDDEN_RECIPIENT, { status: 403 });
      }
      if (user.role === 'parent' && !(await parentMayMessageClassTeacher(user, recipientId))) {
        return NextResponse.json(FORBIDDEN_RECIPIENT, { status: 403 });
      }
      recipientIds = [recipientId];
    } else {
      const guardians = await prisma.guardian.findMany({
        where:
          data.messageType === 'class'
            ? {
                student: { streamId: data.streamId, schoolId: user.schoolId, status: 'active' },
                isActive: true,
              }
            : { student: { schoolId: user.schoolId, status: 'active' }, isActive: true },
        select: { userId: true },
      });
      // A parent with several children in scope must get ONE message (and cost ONE SMS).
      recipientIds = [...new Set(guardians.map((g) => g.userId))];
    }

    if (recipientIds.length === 0) {
      return NextResponse.json(
        { error: 'There is nobody to send this message to' },
        { status: 400 }
      );
    }

    if (data.sendViaSms) {
      const school = await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { smsBalance: true },
      });
      const required = Math.ceil(data.body.length / 160) * recipientIds.length;
      const available = school?.smsBalance ?? 0;
      if (available < required) {
        return NextResponse.json(
          { error: 'Insufficient SMS balance', required, available },
          { status: 400 }
        );
      }
    }

    const messages = await prisma.$transaction(
      recipientIds.map((recipientId) =>
        prisma.message.create({
          data: {
            schoolId: user.schoolId,
            senderId: user.id,
            recipientId,
            streamId: data.streamId,
            subject: data.subject,
            body: data.body,
            messageType: data.messageType,
            sentVia: data.sendViaSms ? ['in_app', 'sms'] : ['in_app'],
            smsSent: false,
          },
        })
      )
    );

    if (data.messageType !== 'direct') {
      await logAudit({
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'message.broadcast',
        tableName: 'messages',
        newData: {
          messageType: data.messageType,
          streamId: data.streamId ?? null,
          recipientCount: messages.length,
          sendViaSms: data.sendViaSms,
        },
      });
    }

    for (const message of messages) {
      if (message.recipientId) {
        await notificationQueue.add('message-notification', {
          userId: message.recipientId,
          type: 'message',
          title: 'New Message',
          body: message.subject || message.body.substring(0, 100),
          data: { messageId: message.id, url: '/parent/messages' },
        });
      }
    }

    if (data.sendViaSms) {
      await smsQueue.add(
        'send-messages',
        { messageIds: messages.map((m) => m.id), priority: 'normal' },
        {
          removeOnComplete: { age: 24 * 3600 },
          removeOnFail: { age: 7 * 24 * 3600 },
        }
      );
    }

    return NextResponse.json({ success: true, count: messages.length }, { status: 201 });
  } catch (error) {
    console.error('Message creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET: List messages for the current user
export async function GET(request: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 100) : 20;
  const unreadOnly = searchParams.get('unreadOnly') === 'true';

  const where = {
    schoolId: user.schoolId,
    recipientId: user.id,
    ...(unreadOnly && { readAt: null }),
  };

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.message.count({ where }),
  ]);

  return NextResponse.json({ messages, total, page, limit });
}
