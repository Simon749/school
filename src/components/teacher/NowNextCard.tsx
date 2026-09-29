"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, QrCode, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface TimelineEvent {
  id: string;
  type: "LESSON" | "DUTY" | "BREAK";
  startTime: Date;
  endTime: Date;
  title: string;
  subtitle: string;
  room: string | null;
  color: string;
  isBreak: boolean;
  slotId?: string;
  dutyId?: string;
}

interface NowNextCardProps {
  event: TimelineEvent;
  type: "NOW" | "NEXT";
  teacherId: string;
  schoolId: string;
}

export function NowNextCard({ event, type, teacherId, schoolId }: NowNextCardProps) {
  const router = useRouter();
  
  const startTime = new Date(event.startTime);
  const endTime = new Date(event.endTime);
  const now = new Date();
  
  const timeUntilStart = Math.floor((startTime.getTime() - now.getTime()) / 1000 / 60);
  const timeUntilEnd = Math.floor((endTime.getTime() - now.getTime()) / 1000 / 60);
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleCheckIn = () => {
    if (event.slotId) {
      router.push(`/teacher/attendance/${event.slotId}`);
    }
  };

  if (event.isBreak) {
    return (
      <Card className="border-l-4 border-l-slate-400 bg-slate-50">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center">
              <Clock className="h-6 w-6 text-slate-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">BREAK TIME</p>
              <h3 className="text-xl font-bold text-slate-900">{event.title}</h3>
              <p className="text-sm text-slate-500">
                {formatTime(startTime)} – {formatTime(endTime)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-l-4 ${type === "NOW" ? "border-l-emerald-500 bg-emerald-50/30" : "border-l-blue-500 bg-blue-50/30"}`}>
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                variant={type === "NOW" ? "default" : "outline"}
                className={type === "NOW" ? "bg-emerald-600" : "bg-blue-600"}
              >
                {type === "NOW" ? "🔴 LIVE NOW" : " NEXT"}
              </Badge>
              {event.type === "DUTY" && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800">
                  DUTY
                </Badge>
              )}
            </div>

            <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
              {event.title}
            </h3>
            <p className="text-lg text-slate-600 mb-3">{event.subtitle}</p>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>
                  {formatTime(startTime)} – {formatTime(endTime)}
                </span>
              </div>
              {event.room && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>Room {event.room}</span>
                </div>
              )}
            </div>

            {type === "NOW" && timeUntilEnd > 0 && (
              <p className="text-sm text-emerald-700 mt-3 font-medium">
                {timeUntilEnd} minutes remaining
              </p>
            )}
            {type === "NEXT" && timeUntilStart > 0 && (
              <p className="text-sm text-blue-700 mt-3 font-medium">
                Starts in {timeUntilStart} minutes
              </p>
            )}
          </div>

          {type === "NOW" && event.slotId && (
            <Button 
              onClick={handleCheckIn}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 h-12 px-6 text-base"
            >
              <QrCode className="h-5 w-5 mr-2" />
              Check In & Take Attendance
            </Button>
          )}
          
          {type === "NEXT" && (
            <Button 
              variant="outline"
              size="lg"
              onClick={() => event.slotId && router.push(`/teacher/attendance/${event.slotId}`)}
              className="h-12 px-6 text-base"
            >
              Prepare Lesson
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}