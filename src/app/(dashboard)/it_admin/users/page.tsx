import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateEditUserDialog } from "@/components/it-admin/CreateEditUserDialog";

interface SearchParams {
  page?: string;
  limit?: string;
}

export default async function ItAdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const currentUser = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { schoolId: true, role: true },
  });

  if (!currentUser || currentUser.role !== "it_admin") {
    redirect("/unauthorized");
  }

  // Pagination parameters
  const page = parseInt(searchParams.page || "1", 10);
  const limit = parseInt(searchParams.limit || "20", 10);
  const skip = (page - 1) * limit;

  // Fetch users with pagination
  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where: { schoolId: currentUser.schoolId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        nationalId: true,
      },
      skip,
      take: limit,
    }),
    prisma.user.count({
      where: { schoolId: currentUser.schoolId, deletedAt: null },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);
  const hasPrevPage = page > 1;
  const hasNextPage = page < totalPages;

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-red-100 text-red-800",
      deputy: "bg-orange-100 text-orange-800",
      teacher: "bg-blue-100 text-blue-800",
      bursar: "bg-green-100 text-green-800",
      parent: "bg-purple-100 text-purple-800",
      it_admin: "bg-gray-100 text-gray-800",
    };
    return colors[role] || "bg-gray-100 text-gray-800";
  };

  const getPageUrl = (pageNum: number) => `/it_admin/users?page=${pageNum}`;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header: Stacks on mobile, side-by-side on desktop */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500">
            Manage school staff, teachers, and parent accounts.
          </p>
        </div>
        <CreateEditUserDialog schoolId={currentUser.schoolId} mode="create" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <CardTitle>All Users</CardTitle>
            <p className="text-sm text-slate-500">
              Showing {users.length} of {totalCount} users
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile Responsive Table Wrapper */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  {/* Hidden on mobile to save space */}
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                      No users found. Create your first user to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(user.role)}>
                          {user.role.replace("_", " ").toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm whitespace-nowrap">
                          {user.email && <div>{user.email}</div>}
                          {user.phone && (
                            <div className="text-slate-500">{user.phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "default" : "secondary"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-500 whitespace-nowrap">
                        {new Date(user.createdAt).toLocaleDateString("en-KE")}
                      </TableCell>
                      <TableCell className="text-right">
                        <CreateEditUserDialog
                          schoolId={currentUser.schoolId}
                          mode="edit"
                          user={user}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls - Fully Responsive & No Nested Buttons */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 mt-6 pt-4 gap-4">
              <div className="text-sm text-slate-500 text-center sm:text-left">
                Page {page} of {totalPages} ({totalCount} total users)
              </div>
              
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
                {/* Previous Link (Styled exactly like shadcn Button variant="outline") */}
                <a
                  href={hasPrevPage ? getPageUrl(page - 1) : "#"}
                  className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 ${
                    !hasPrevPage ? "pointer-events-none opacity-50" : ""
                  }`}
                  aria-disabled={!hasPrevPage}
                  tabIndex={hasPrevPage ? 0 : -1}
                >
                  Previous
                </a>

                {/* Page Numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (page <= 3) pageNum = i + 1;
                  else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = page - 2 + i;

                  const isActive = page === pageNum;
                  return (
                    <a
                      key={pageNum}
                      href={getPageUrl(pageNum)}
                      className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 w-9 ${
                        isActive
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {pageNum}
                    </a>
                  );
                })}

                {/* Next Link (Styled exactly like shadcn Button variant="outline") */}
                <a
                  href={hasNextPage ? getPageUrl(page + 1) : "#"}
                  className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 ${
                    !hasNextPage ? "pointer-events-none opacity-50" : ""
                  }`}
                  aria-disabled={!hasNextPage}
                  tabIndex={hasNextPage ? 0 : -1}
                >
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