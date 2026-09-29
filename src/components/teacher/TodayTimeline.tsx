"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, QrCode } from "lucide-react";
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

interface TodayTimelineProps {
  events: TimelineEvent[];
  teacherId: string;
  schoolId: string;
}

export function TodayTimeline({ events, teacherId, schoolId }: TodayTimelineProps) {
  const router = useRouter();

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleCheckIn = (slotId: string) => {
    router.push(`/teacher/attendance/${slotId}`);
  };

  const getEventIcon = (event: TimelineEvent) => {
    if (event.isBreak) return "☕";
    if (event.type === "DUTY") return "🚪";
    return "📚";
  };

  const getEventStyle = (event: TimelineEvent) => {
    if (event.isBreak) {
      return "border-l-slate-400 bg-slate-50";
    }
    if (event.type === "DUTY") {
      return "border-l-amber-500 bg-amber-50/30";
    }
    return "border-l-emerald-500";
  };

  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No lessons scheduled for today</p>
        </div>
      ) : (
        events.map((event) => (
          <Card 
            key={event.id} 
            className={`border-l-4 ${getEventStyle(event)} transition-all hover:shadow-md`}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="text-2xl">{getEventIcon(event)}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-900 text-base md:text-lg">
                      {event.title}
                    </h4>
                    <p className="text-sm text-slate-600">{event.subtitle}</p>
                    
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatTime(event.startTime)} – {formatTime(event.endTime)}</span>
                      </div>
                      {event.room && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>Room {event.room}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {event.slotId && !event.isBreak && (
                  <Button
                    size="sm"
                    onClick={() => handleCheckIn(event.slotId!)}
                    className="shrink-0"
                  >
                    <QrCode className="h-4 w-4 mr-1" />
                    Check In
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}