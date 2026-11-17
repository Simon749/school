'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreateMessageInput, createMessageSchema } from '@/lib/validations/message.schema';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
// FIX: Added 'Form' to the imports
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
  /** Active primary guardian, loaded server-side by the page (at most one). */
  guardians?: { userId: string }[];
}

/** Which user receives a message about this student, or null if nobody is linked. */
function primaryGuardianUserId(student: Student): string | null {
  return student.guardians?.[0]?.userId ?? null;
}

function studentLabel(student: Student): string {
  const name = `${student.firstName} ${student.lastName}`;
  const adm = student.admissionNumber ? ` (${student.admissionNumber})` : '';
  const noGuardian = primaryGuardianUserId(student) ? '' : ' — no guardian linked';
  return `${name}${adm}${noGuardian}`;
}

/** Shows the student's NAME (via `items`), not the raw id; trigger fills the column. */
function StudentSelect({
  students,
  value,
  onChange,
}: {
  students: Student[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const items = students.map((s) => ({ value: s.id, label: studentLabel(s) }));
  return (
    <Select value={value ?? null} onValueChange={(v) => onChange(v ? String(v) : undefined)} items={items}>
      <FormControl>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a student" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {students.map((student) => (
          <SelectItem key={student.id} value={student.id}>
            {studentLabel(student)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TeacherComposeMessageProps {
  students: Student[];
  teacherId: string;
  isClassTeacher?: boolean;
  streamId?: string;
  streamName?: string;
}

export function TeacherComposeMessage({ 
  students, 
  teacherId, 
  isClassTeacher = false, 
  streamId, 
  streamName 
}: TeacherComposeMessageProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'individual' | 'class'>('individual');

  const form = useForm<z.input<typeof createMessageSchema>, unknown, CreateMessageInput>({
    resolver: zodResolver(createMessageSchema),
    defaultValues: {
      messageType: 'direct',
      subject: '',
      body: '',
      sendViaSms: false,
      recipientId: undefined,
      streamId: undefined,
    },
  });

  // Sync form values with the active tab
  useEffect(() => {
    if (activeTab === 'class' && streamId) {
      form.setValue('messageType', 'class');
      form.setValue('streamId', streamId);
      form.setValue('recipientId', undefined); // Clear individual recipient
      form.clearErrors('recipientId');
    } else {
      form.setValue('messageType', 'direct');
      form.setValue('streamId', undefined);
    }
  }, [activeTab, streamId, form]);

  const onSubmit = async (data: CreateMessageInput) => {
    setIsSubmitting(true);
    try {
      let payload = { ...data };

      if (data.messageType === 'direct') {
        // data.recipientId is a STUDENT id here; the message goes to that student's primary guardian.
        // The server (POST /api/messages) re-checks that this teacher may message that guardian.
        const student = students.find((st) => st.id === data.recipientId);
        const guardianUserId = student ? primaryGuardianUserId(student) : null;
        if (!guardianUserId) {
          toast.error('This student has no linked guardian. Ask the school admin to link one.');
          return;
        }
        payload.recipientId = guardianUserId;
      }

      const sendRes = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => null);
        throw new Error(err?.error || 'Failed to send message');
      }

      toast.success('Message sent successfully');
      setOpen(false);
      form.reset();
      setActiveTab('individual');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsSubmitting(false);
    }
  };

  const bodyLength = form.watch('body')?.length || 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        form.reset();
        setActiveTab('individual');
      }
    }}>
      <DialogTrigger render={<Button>Compose Message</Button>} />
      <DialogContent className="max-w-2xl sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Message</DialogTitle>
        </DialogHeader>
        
        {/* FIX: Wrap the standard HTML form with shadcn's <Form> provider */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            {isClassTeacher && (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'individual' | 'class')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="individual">Individual Parent</TabsTrigger>
                  <TabsTrigger value="class">Entire Class</TabsTrigger>
                </TabsList>
                
                <TabsContent value="individual" className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="recipientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Student</FormLabel>
                        <StudentSelect students={students} value={field.value} onChange={field.onChange} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="class" className="pt-2">
                  <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900 border border-blue-200">
                    <p>
                      <strong>Class Broadcast:</strong> This message will be sent to all parents/guardians of students in{' '}
                      <strong>{streamName || 'your class'}</strong>.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {!isClassTeacher && (
              <FormField
                control={form.control}
                name="recipientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Student</FormLabel>
                    <StudentSelect students={students} value={field.value} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Upcoming Parent-Teacher Meeting" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Type your message here..."
                      className="min-h-[120px]"
                      {...field}
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <FormMessage />
                    <p className={`text-xs ${bodyLength > 500 ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                      {bodyLength}/500
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sendViaSms"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Also send via SMS</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Useful if the parent does not actively check the app.
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}