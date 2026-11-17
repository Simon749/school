'use client';

import { useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface Period {
  id: string; name: string; startTime: string; endTime: string;
  isBreak: boolean; orderIndex: number;
}
interface Slot {
  id: string; periodId: string; dayOfWeek: number; room: string | null;
  isDoubleLesson: boolean; isPublished: boolean;
  learningArea: { id: string; name: string; color: string | null };
  teacher: { id: string; user: { firstName: string; lastName: string } };
  stream?: { id: string; name: string; grade: { name: string } };
  secondPeriod?: { id: string; name: string } | null;
}

const DAYS = [
  { num: 1, label: 'Monday' },
  { num: 2, label: 'Tuesday' },
  { num: 3, label: 'Wednesday' },
  { num: 4, label: 'Thursday' },
  { num: 5, label: 'Friday' },
];

export function TimetableGrid({
  periods, slots, onCellClick, onDeleteSlot, readOnly = false, showStreamInfo = false,
}: {
  periods: Period[];
  slots: Slot[];
  onCellClick?: (periodId: string, dayOfWeek: number, existingSlot?: Slot) => void;
  onDeleteSlot?: (id: string) => void;
  readOnly?: boolean;
  showStreamInfo?: boolean;
}) {
  const slotMap = useMemo(() => {
    const map = new Map<string, Slot>();
    slots.forEach((s) => map.set(`${s.periodId}-${s.dayOfWeek}`, s));
    return map;
  }, [slots]);

  const formatTime = (t: string) => {
    if (!t) return '';
    if (t.includes('T')) {
      const d = new Date(t);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return t.slice(0, 5);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[760px]">
        <thead>
          <tr className="bg-gray-50">
            <th className="w-24 border border-gray-200 p-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Time
            </th>
            {DAYS.map((d) => (
              <th key={d.num} className="border border-gray-200 p-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <td className={`border border-gray-200 p-3 align-top ${period.isBreak ? 'bg-amber-50/50' : 'bg-gray-50'}`}>
                <div className="font-semibold text-gray-900">{formatTime(period.startTime)}</div>
                {!period.isBreak && (
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {period.name} · {formatTime(period.endTime)}
                  </div>
                )}
              </td>
              {DAYS.map((day) => {
                const slot = slotMap.get(`${period.id}-${day.num}`);
                return (
                  <td
                    key={day.num}
                    onClick={() => {
                      if (!readOnly && !period.isBreak && onCellClick) onCellClick(period.id, day.num, slot);
                    }}
                    className={`border border-gray-200 p-2 align-top ${period.isBreak ? 'bg-amber-50/30' : 'bg-white'} ${
                      !readOnly && !period.isBreak && !slot ? 'cursor-pointer hover:bg-teal-50/40' : ''
                    }`}
                  >
                    {period.isBreak ? (
                      <span className="text-xs text-amber-600 font-medium block text-center py-2">Break</span>
                    ) : slot ? (
                      <div className="relative group">
                        <div
                          className="rounded-lg p-2.5 border transition-all"
                          style={{
                            backgroundColor: slot.learningArea.color ? `${slot.learningArea.color}15` : 'rgba(13,148,136,0.10)',
                            borderColor: slot.learningArea.color ? `${slot.learningArea.color}40` : 'rgba(13,148,136,0.35)',
                          }}
                        >
                          <div className="font-semibold text-gray-900 text-xs leading-tight pr-12">
                            {slot.learningArea.name}
                          </div>
                          <div className="text-[11px] text-gray-600 mt-0.5">
                            {slot.teacher.user.firstName} {slot.teacher.user.lastName}
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {formatTime(period.startTime)}–{formatTime(period.endTime)}
                            {slot.room ? ` · Room ${slot.room}` : ''}
                          </div>
                          {showStreamInfo && slot.stream && (
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {slot.stream.grade.name} {slot.stream.name}
                            </div>
                          )}
                          {!slot.isPublished && (
                            <span className="absolute top-1 left-1 w-2 h-2 bg-amber-400 rounded-full" title="Draft" />
                          )}
                          {slot.isDoubleLesson && (
                            <span className="absolute bottom-1 right-1 text-[9px] text-gray-400 font-medium">2×</span>
                          )}
                          {!readOnly && (
                            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                aria-label="Edit"
                                onClick={(e) => { e.stopPropagation(); onCellClick?.(period.id, day.num, slot); }}
                                className="h-6 w-6 grid place-items-center rounded hover:bg-teal-200 text-teal-700"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              {onDeleteSlot && (
                                <button
                                  type="button"
                                  aria-label="Delete"
                                  onClick={(e) => { e.stopPropagation(); onDeleteSlot(slot.id); }}
                                  className="h-6 w-6 grid place-items-center rounded hover:bg-red-200 text-red-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full min-h-[64px] flex items-center justify-center">
                        <span className="text-gray-300 text-sm group-hover:hidden">Free</span>
                        {!readOnly && <span className="hidden text-teal-400 text-lg hover:block">+</span>}
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