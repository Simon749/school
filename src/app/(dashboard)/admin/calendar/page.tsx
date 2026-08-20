"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
}

export default function AdminCalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());
  const days = getCalendarDays(month);
  const monthLabel = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const isCurrentMonth = new Date().getFullYear() === month.getFullYear() && new Date().getMonth() === month.getMonth();

  function moveMonth(offset: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
    setSelectedDay(null);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-900">School calendar</h1>
          </div>
          <p className="mt-2 text-slate-500">Plan and review important school dates.</p>
        </div>
        {!isCurrentMonth && (
          <button type="button" onClick={() => { setMonth(new Date()); setSelectedDay(new Date().getDate()); }} className="text-sm font-medium text-emerald-700 hover:underline">
            Today
          </button>
        )}
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-6 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-900">{monthLabel}</h2>
          <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((day) => <div key={day} className="py-2">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map((day, index) => (
            <div key={`${day ?? "empty"}-${index}`} className="aspect-square">
              {day && (
                <button
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`flex h-full w-full items-center justify-center rounded-lg text-sm transition-colors ${selectedDay === day ? "bg-emerald-600 font-semibold text-white" : "text-slate-700 hover:bg-emerald-50"}`}
                >
                  {day}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
        <p className="font-medium text-slate-700">
          {selectedDay ? `${monthLabel}, ${selectedDay}` : "Select a date"}
        </p>
        <p className="mt-1 text-sm text-slate-500">No events have been recorded for this date.</p>
      </section>
    </div>
  );
}
