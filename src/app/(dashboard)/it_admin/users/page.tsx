import { Prisma, UserRole } from "@prisma/client";
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreateEditUserDialog } from '@/components/it-admin/CreateEditUserDialog';
import { UsersToolbar } from '@/components/it-admin/UsersToolbar';

interface SearchParams {
  page?: string;
  limit?: string;
  q?: string;      // NEW
  role?: string;   // NEW
}

const FILTERABLE_ROLES = ['admin', 'deputy', 'teacher', 'bursar', 'parent', 'it_admin'];


export default async function ItAdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const currentUser = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { schoolId: true, role: true },
  });
  if (!currentUser || currentUser.role !== 'it_admin') redirect('/unauthorized');

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.limit || '20', 10) || 20));
  const q = (searchParams.q || '').trim();
  const role: UserRole | undefined = FILTERABLE_ROLES.includes(searchParams.role || '')
    ? (searchParams.role as UserRole)
    : undefined;

  // NEW: server-side search + role filter (Postgres contains/insensitive)
  const searchFilter = q
    ? {
        OR: [
          { firstName: { mode: 'insensitive' as const, contains: q } },
          { lastName: { mode: 'insensitive' as const, contains: q } },
          { email: { mode: 'insensitive' as const, contains: q } },
          { phone: { contains: q } },
        ],
      }
    : {};
  const where = {
    schoolId: currentUser.schoolId,
    deletedAt: null,
    ...searchFilter,
    ...(role ? { role } : {}),
  };

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      role: true, isActive: true, createdAt: true, nationalId: true,
    }, skip: (page - 1) * limit, take: limit }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const effectivePage = Math.min(page, totalPages); // clamp after filtering

  const getRoleBadgeColor = (r: string) => ({
    admin: 'bg-red-100 text-red-800', deputy: 'bg-orange-100 text-orange-800',
    teacher: 'bg-blue-100 text-blue-800', bursar: 'bg-green-100 text-green-800',
    parent: 'bg-purple-100 text-purple-800', it_admin: 'bg-gray-100 text-gray-800',
  }[r] || 'bg-gray-100 text-gray-800');

  // NEW: pagination links now preserve q + role + limit
  const getPageUrl = (pageNum: number) => {
    const p = new URLSearchParams();
    p.set('page', String(pageNum));
    if (q) p.set('q', q);
    if (role) p.set('role', role);
    if (limit !== 20) p.set('limit', String(limit));
    return `/it_admin/users?${p.toString()}`;
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500">Manage school staff, teachers, and parent accounts.</p>
        </div>
        <CreateEditUserDialog mode="create" />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>All Users</CardTitle>
          <UsersToolbar showing={users.length} total={totalCount} />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                      {q || role ? 'No users match your search.' : 'No users found. Create your first user to get started.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium whitespace-nowrap">{user.firstName} {user.lastName}</TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(user.role)}>{user.role.replace('_', ' ').toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm whitespace-nowrap">
                          {user.email && <div>{user.email}</div>}
                          {user.phone && <div className="text-slate-500">{user.phone}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? 'default' : 'secondary'}>{user.isActive ? 'Active' : 'Inactive'}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-500 whitespace-nowrap">
                        {new Date(user.createdAt).toLocaleDateString('en-KE')}
                      </TableCell>
                      <TableCell className="text-right">
                        {['deputy', 'teacher', 'parent'].includes(user.role) ? (
                          <CreateEditUserDialog mode="edit" user={user} />
                        ) : (
                          <span className="text-xs text-slate-400">Managed by school admin</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* keep your existing pagination block, but use `effectivePage` instead of `page`
              in the hasPrev/hasNext/active checks — getPageUrl already preserves q/role */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 mt-6 pt-4 gap-4">
              <div className="text-sm text-slate-500 text-center sm:text-left">
                Page {effectivePage} of {totalPages} ({totalCount} total users)
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
                <a href={effectivePage > 1 ? getPageUrl(effectivePage - 1) : '#'}
                   className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${effectivePage <= 1 ? 'pointer-events-none opacity-50' : ''}`}>
                  Previous
                </a>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (effectivePage <= 3) pageNum = i + 1;
                  else if (effectivePage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = effectivePage - 2 + i;
                  const isActive = effectivePage === pageNum;
                  return (
                    <a key={pageNum} href={getPageUrl(pageNum)}
                       className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium ${isActive ? 'bg-primary text-primary-foreground' : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'}`}>
                      {pageNum}
                    </a>
                  );
                })}
                <a href={effectivePage < totalPages ? getPageUrl(effectivePage + 1) : '#'}
                   className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${effectivePage >= totalPages ? 'pointer-events-none opacity-50' : ''}`}>
                  Next
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}