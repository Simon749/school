"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Child = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    stream: { grade: { name: string }; name: string };
  };
  daily: { status: string; arrivedAt: string } | null;
  lessons: { status: string; slot: { learningArea: { name: string } } }[];
};

export default function ParentDashboard() {
  const { user } = useUser();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/parent/children")
      .then((r) => r.json())
      .then((d) => {
        setChildren(d.children || []);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold">Good afternoon, {user?.firstName}</h1>

      {children.map((c) => {
        const absentLessons = c.lessons.filter((l) => l.status === "absent");
        return (
          <Link key={c.student.id} href={`/parent/${c.student.id}/attendance`}>
            <Card className="hover:shadow-md transition">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {c.student.firstName} {c.student.lastName}
                </CardTitle>
                <p className="text-xs text-gray-500">
                  {c.student.stream.grade.name} {c.student.stream.name}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Arrival</span>
                  <Badge variant={c.daily?.status === "present" ? "default" : "destructive"}>
                    {c.daily?.arrivedAt ? new Date(c.daily.arrivedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "Not arrived"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Lessons</span>
                  <span className="text-sm">
                    {c.lessons.filter((l) => l.status === "present").length}/{c.lessons.length} present
                  </span>
                </div>
                {absentLessons.length > 0 && (
                  <p className="text-xs text-red-600">
                    Absent from: {absentLessons.map((l) => l.slot.learningArea.name).join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}