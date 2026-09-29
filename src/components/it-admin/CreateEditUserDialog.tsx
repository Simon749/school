"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUserAction, updateUserAction } from "@/app/actions/it-admin-actions";
import { toast } from "sonner"; // Ensure you have a toast provider (e.g., sonner or shadcn toast)

const userSchema = z.object({
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().min(10, "Phone must be at least 10 digits").optional().or(z.literal("")),
  role: z.enum(["admin", "deputy", "teacher", "bursar", "parent", "it_admin"]),
  nationalId: z.string().optional().or(z.literal("")),
});

type UserFormValues = z.infer<typeof userSchema>;

export function CreateEditUserDialog({
  schoolId, mode, user,
}: {
  schoolId: string;
  mode: "create" | "edit";
  user?: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; role: string; nationalId: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      firstName: user?.firstName || "", lastName: user?.lastName || "",
      email: user?.email || "", phone: user?.phone || "",
      role: (user?.role as any) || "teacher", nationalId: user?.nationalId || "",
    },
  });

  async function onSubmit(data: UserFormValues) {
    setIsPending(true);
    try {
      const result = mode === "create"
        ? await createUserAction(schoolId, data)
        : await updateUserAction(user!.id, data);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(mode === "create" ? "User created successfully" : "User updated successfully");
        setOpen(false);
        if (mode === "create") form.reset();
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsPending(false);
    }
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={mode === "create" ? "default" : "ghost"} size={mode === "create" ? "default" : "sm"}>
            {mode === "create" ? "+ Add User" : "Edit"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader><DialogTitle>{mode === "create" ? "Create New User" : "Edit User"}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }: any) => (
                <FormItem><FormLabel>First Name</FormLabel><FormControl><Input placeholder="John" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }: any) => (
                <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input placeholder="Doe" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="email" render={({ field }: any) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="john@example.com" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }: any) => (
              <FormItem><FormLabel>Phone (254...)</FormLabel><FormControl><Input placeholder="254712345678" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="nationalId" render={({ field }: any) => (
              <FormItem><FormLabel>National ID (Optional)</FormLabel><FormControl><Input placeholder="12345678" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }: any) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="deputy">Deputy</SelectItem>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="bursar">Bursar</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="it_admin">IT Admin</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : mode === "create" ? "Create User" : "Save Changes"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}