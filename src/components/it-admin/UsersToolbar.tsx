'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ROLE_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'deputy', label: 'Deputy' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'parent', label: 'Parent' },
  { value: 'admin', label: 'Admin' },
  { value: 'bursar', label: 'Bursar' },
  { value: 'it_admin', label: 'IT Admin' },
];

export function UsersToolbar({ showing, total }: { showing: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const role = searchParams.get('role') ?? 'all';
  const [value, setValue] = useState(q);

  // keep local input in sync when q changes from outside (back button, clear)
  useEffect(() => setValue(q), [q]);

  // debounce → push ?q=…&role=… into the URL (server-side filtering)
  useEffect(() => {
    if (value === q) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function setRole(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== 'all') params.set('role', next);
    else params.delete('role');
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search name, email or phone…"
          className="h-9 pl-8 pr-8"
          aria-label="Search users"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Select value={role} onValueChange={(v) => setRole(String(v))}>
        <SelectTrigger size="sm" className="w-full sm:w-[150px]">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-sm text-muted-foreground sm:ml-auto">
        Showing <span className="font-medium text-foreground">{showing}</span> of {total} users
      </p>
    </div>
  );
}