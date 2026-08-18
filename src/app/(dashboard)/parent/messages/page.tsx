// src/app/(dashboard)/parent/messages/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MessageItem } from "@/components/messages/MessageItem";

export default async function ParentMessagesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
  });

  if (!user) redirect("/");

  const messages = await prisma.message.findMany({
    where: {
      schoolId: user.schoolId,
      recipientId: user.id,
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
    take: 50,
  });

  const unreadCount = messages.filter((m) => !m.readAt).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread messages` : "All messages read"}
          </p>
        </div>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No messages yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}