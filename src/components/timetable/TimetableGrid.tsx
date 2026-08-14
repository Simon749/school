"use client";

import { useMemo } from "react";

interface Period {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  orderIndex: number;
}

interface Slot {
  id: string;
  periodId: string;
  dayOfWeek: number;
  room: string | null;
  isDoubleLesson: boolean;
  isPublished: boolean;
  learningArea: { name: string; color: string | null };
  teacher: { user: { firstName: string; lastName: string } };
  stream?: { name: string; grade: { name: string } };
  secondPeriod?: { id: string; name: string } | null;
}

const DAYS = [
  { num: 1, label: "Mon" },
  { num: 2, label: "Tue" },
  { num: 3, label: "Wed" },
  { num: 4, label: "Thu" },
  { num: 5, label: "Fri" },
];

export function TimetableGrid({
  periods,
  slots,
  onCellClick,
  readOnly = false,
  showStreamInfo = false,
}: {
  periods: Period[];
  slots: Slot[];
  onCellClick?: (periodId: string, dayOfWeek: number, existingSlot?: Slot) => void;
  readOnly?: boolean;
  showStreamInfo?: boolean;
}) {
  const slotMap = useMemo(() => {
    const map = new Map<string, Slot>();
    slots.forEach((s) => {
      map.set(`${s.periodId}-${s.dayOfWeek}`, s);
    });
    return map;
  }, [slots]);

  const formatTime = (t: string) => {
    // t is like "08:00:00" or "1970-01-01T08:00:00Z"
    if (t.includes("T")) {
      const d = new Date(t);
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return t.slice(0, 5);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[700px]">
        <thead>
          <tr>
            <th className="w-32 border border-gray-200 bg-gray-50 p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Period
            </th>
            {DAYS.map((d) => (
              <th
                key={d.num}
                className="border border-gray-200 bg-gray-50 p-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center"
              >
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <td
                className={`border border-gray-200 p-3 ${
                  period.isBreak ? "bg-amber-50/50" : "bg-white"
                }`}
              >
                <div className="font-medium text-gray-900">{period.name}</div>
                <div className="text-xs text-gray-500">
                  {formatTime(period.startTime)} – {formatTime(period.endTime)}
                </div>
              </td>
              {DAYS.map((day) => {
                const slot = slotMap.get(`${period.id}-${day.num}`);
                const isDoubleContinuation =
                  slot?.isDoubleLesson && slot.secondPeriod?.id === period.id;

                // If this cell is covered by a double lesson from the previous period, skip rendering
                // Actually, for simplicity, we render double lessons in their primary cell only
                // and the second cell shows a "continued" indicator or is just empty

                return (
                  <td
                    key={day.num}
                    className={`border border-gray-200 p-2 align-top ${
                      period.isBreak ? "bg-amber-50/30" : "bg-white"
                    } ${!readOnly && !period.isBreak && !slot ? "cursor-pointer hover:bg-blue-50/50" : ""}`}
                    onClick={() => {
                      if (!readOnly && !period.isBreak && onCellClick) {
                        onCellClick(period.id, day.num, slot);
                      }
                    }}
                  >
                    {period.isBreak ? (
                      <span className="text-xs text-amber-600 font-medium block text-center py-2">
                        Break
                      </span>
                    ) : slot ? (
                      <div className="relative group">
                        <div
                          className="rounded-lg p-2.5 border transition-all"
                          style={{
                            backgroundColor: slot.learningArea.color
                              ? `${slot.learningArea.color}15`
                              : "#f1f5f9",
                            borderColor: slot.learningArea.color
                              ? `${slot.learningArea.color}40`
                              : "#e2e8f0",
                          }}
                        >
                          <div className="font-semibold text-gray-900 text-xs leading-tight">
                            {slot.learningArea.name}
                          </div>
                          <div className="text-[11px] text-gray-600 mt-0.5">
                            {slot.teacher.user.firstName} {slot.teacher.user.lastName.charAt(0)}.
                          </div>
                          {slot.room && (
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              Room {slot.room}
                            </div>
                          )}
                          {showStreamInfo && slot.stream && (
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {slot.stream.grade.name} {slot.stream.name}
                            </div>
                          )}
                          {!slot.isPublished && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full" title="Draft" />
                          )}
                          {slot.isDoubleLesson && (
                            <span className="absolute bottom-1 right-1 text-[9px] text-gray-400 font-medium">
                              2×
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full min-h-[60px] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <span className="text-blue-400 text-lg">+</span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}