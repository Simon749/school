'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ClipboardList, ChevronRight, History } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Slot {
  id: string;
  learningArea: { name: string };
  stream: { name: string; grade: { name: string } };
  period: { name: string; startTime: string; endTime: string };
}

export default function TeacherAttendanceHubPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [isWeekend, setIsWeekend] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/timetable/teacher/today')
      .then((r) => r.json())
      .then((d) => {
        setSlots(d.slots ?? []);
        setIsWeekend(Boolean(d.isWeekend));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const formatTime = (t?: string) => {
    if (!t) return '—';
    if (t.includes('T')) {
      return new Date(t).toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
    const [h = '0', m = '0'] = t.split(':');
    const d = new Date();
    d.setHours(Number.parseInt(h, 10) || 0, Number.parseInt(m, 10) || 0);
    return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-emerald-600" />
        Loading today's lessons...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Attendance</h1>
          <p className="text-slate-600 text-sm mt-1">Mark the register for today's lessons.</p>
        </div>
        <Link href="/teacher/attendance/history">
          <Button variant="outline" size="sm" className="gap-2">
            <History className="h-4 w-4" />
            My History
          </Button>
        </Link>
      </div>

      {isWeekend || slots.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">
            No lessons scheduled today — nothing to mark.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {slots.map((slot) => (
            <Link key={slot.id} href={`/teacher/attendance/${slot.id}`} className="block">
              <Card className="hover:border-emerald-400 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ClipboardList className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {slot.learningArea.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {slot.stream.grade.name} {slot.stream.name} ·{' '}
                        {formatTime(slot.period.startTime)} – {formatTime(slot.period.endTime)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">Mark</Badge>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
