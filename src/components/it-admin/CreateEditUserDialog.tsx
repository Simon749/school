'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createUserAction, updateUserAction } from '@/app/actions/it-admin-actions';

const userSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required'),
  lastName: z.string().trim().min(2, 'Last name is required'),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .regex(/^$|^(\+?254|0)\d{9}$/, 'Use 2547XXXXXXXX or 07XXXXXXXX')
    .optional(),
  role: z.enum(['deputy', 'teacher', 'parent']),
  nationalId: z.string().trim().regex(/^$|^\d{6,10}$/, '6–10 digits').optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

type EditableUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string;
  nationalId: string | null;
};

const emptyDefaults: UserFormValues = {
  firstName: '', lastName: '', email: '', phone: '', role: 'teacher', nationalId: '',
};

export function CreateEditUserDialog({ mode, user }: { mode: 'create' | 'edit'; user?: EditableUser }) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: user ? {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email ?? '',
      phone: user.phone ?? '',
      role: (user.role as UserFormValues['role']) ?? 'teacher',
      nationalId: user.nationalId ?? '',
    } : emptyDefaults,
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && mode === 'edit' && user) {
      // re-seed so the dialog always shows the row's current values
      form.reset({
        firstName: user.firstName, lastName: user.lastName,
        email: user.email ?? '', phone: user.phone ?? '',
        role: user.role as UserFormValues['role'], nationalId: user.nationalId ?? '',
      });
    }
    if (!next) form.clearErrors();
  }

  async function onSubmit(data: UserFormValues) {
    setIsPending(true);
    try {
      const result = mode === 'create' ? await createUserAction(data) : await updateUserAction(user!.id, data);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(mode === 'create' ? 'User created successfully' : 'User updated successfully');
      setOpen(false);
      if (mode === 'create') form.reset(emptyDefaults);
      router.refresh(); // re-fetch the table without losing search/pagination params
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant={mode === 'create' ? 'default' : 'ghost'} size={mode === 'create' ? 'default' : 'sm'}>
            {mode === 'create' ? '+ Add User' : 'Edit'}
          </Button>
        }
      />
      {/* wider + scrolls on short screens instead of bleeding over the table */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create New User' : 'Edit User'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a deputy, teacher or parent account. They sign in once linked to a Clerk account.'
              : 'Update this person’s details. Admin, bursar and IT-admin accounts are managed by the school admin.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl><Input placeholder="John" autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl><Input placeholder="Doe" autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" placeholder="john@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Phone (254…)</FormLabel>
                <FormControl><Input inputMode="tel" placeholder="254712345678" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="nationalId" render={({ field }) => (
                <FormItem>
                  <FormLabel>National ID <span className="text-muted-foreground">(optional)</span></FormLabel>
                  <FormControl><Input inputMode="numeric" placeholder="12345678" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                    <FormControl>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select a role" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="deputy">Deputy</SelectItem>
                      <SelectItem value="teacher">Teacher</SelectItem>
                      <SelectItem value="parent">Parent</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="animate-spin" />}
                {isPending ? 'Saving…' : mode === 'create' ? 'Create User' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}