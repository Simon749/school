"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, BookOpen, MessageSquare, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

interface QuickActionsProps {
  teacherId: string;
}

export function QuickActions({ teacherId }: QuickActionsProps) {
  const router = useRouter();

  const actions = [
    {
      label: "Attendance",
      icon: ClipboardList,
      href: "/teacher/attendance/history",
      color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
    },
    {
      label: "Markbook",
      icon: BookOpen,
      href: "/teacher/markbook",
      color: "bg-blue-100 text-blue-700 hover:bg-blue-200",
    },
    {
      label: "Messages",
      icon: MessageSquare,
      href: "/teacher/messages",
      color: "bg-purple-100 text-purple-700 hover:bg-purple-200",
    },
    {
      label: "Lesson Plans",
      icon: FileText,
      href: "/teacher/lessons",
      color: "bg-amber-100 text-amber-700 hover:bg-amber-200",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.href}
                variant="outline"
                className={`h-auto py-3 px-3 flex flex-col items-center gap-2 ${action.color} border-0`}
                onClick={() => router.push(action.href)}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{action.label}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}