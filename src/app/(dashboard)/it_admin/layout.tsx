// app/(dashboard)/it_admin/layout.tsx
import { requirePageUser } from '@/lib/auth/current-user';

export default async function ItAdminLayout({ children }: { children: React.ReactNode }) {
  // The layout is only the first gate: layouts are not re-run on every navigation, so each
  // it_admin page also calls requirePageUser(['it_admin']) itself.
  await requirePageUser(['it_admin']);

  return <div className="flex-1 min-h-screen w-full">{children}</div>;
}