"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface Stream {
  id: string;
  name: string;
  grade: {
    name: string;
  };
  students: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
}

interface MyClassCardProps {
  stream: Stream;
  studentCount: number;
}

export function MyClassCard({ stream, studentCount }: MyClassCardProps) {
  const router = useRouter();

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-blue-900 flex items-center gap-2">
          <Users className="h-5 w-5" />
          MY CLASS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900">
            {stream.grade.name} {stream.name}
          </h3>
          <p className="text-sm text-slate-600">{studentCount} learners</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-3 border border-slate-200">
            <p className="text-xs text-slate-500">Attendance</p>
            <p className="text-lg font-bold text-slate-900">
              {studentCount}/{studentCount}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-slate-200">
            <p className="text-xs text-slate-500">Pending Work</p>
            <p className="text-lg font-bold text-slate-900">0</p>
          </div>
        </div>

        <Button 
          onClick={() => router.push(`/teacher/class/${stream.id}`)}
          variant="outline"
          className="w-full border-blue-300 text-blue-700 hover:bg-blue-100"
        >
          Open Class
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}