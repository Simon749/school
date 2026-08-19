// src/components/messages/TeacherComposeMessage.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createMessageSchema, CreateMessageInput } from "@/lib/validations/message.schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string | null;
}

interface TeacherComposeMessageProps {
  students: Student[];
  teacherId: string;
}

type CreateMessageFormInput = z.input<typeof createMessageSchema>;

export function TeacherComposeMessage({ students, teacherId }: TeacherComposeMessageProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<
    CreateMessageFormInput,
    unknown,
    CreateMessageInput
  >({
    resolver: zodResolver(createMessageSchema),
    defaultValues: {
      messageType: "direct",
      body: "",
      sendViaSms: false,
    },
  });

  const bodyLength = watch("body")?.length || 0;

  const onSubmit = async (data: CreateMessageInput) => {
    if (!selectedStudent) {
      toast.error("Please select a student");
      return;
    }

    setIsSubmitting(true);
    try {
      // Get the primary guardian for this student
      const res = await fetch(`/api/students/${selectedStudent}/guardian`);
      if (!res.ok) throw new Error("Failed to fetch guardian");
      const { guardian } = await res.json();

      if (!guardian) {
        toast.error("This student has no linked guardian");
        setIsSubmitting(false);
        return;
      }

      const messageData = {
        ...data,
        recipientId: guardian.userId,
      };

      const sendRes = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messageData),
      });

      if (!sendRes.ok) {
        const err = await sendRes.json();
        throw new Error(err.error || "Failed to send message");
      }

      toast.success("Message sent successfully");
      setOpen(false);
      reset();
      setSelectedStudent(null);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>Compose Message</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Message to Parent</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Select Student</Label>
            <Select onValueChange={(v: string | null) => setSelectedStudent(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.firstName} {student.lastName}
                    {student.admissionNumber && ` (${student.admissionNumber})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStudent && (
              <p className="text-xs text-muted-foreground">
                Message will be sent to the primary guardian of this student.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Message (500 characters max)</Label>
            <Textarea
              {...register("body")}
              placeholder="Type your message here..."
              className="min-h-[120px]"
            />
            <div className="flex justify-between items-center">
              {errors.body && <p className="text-sm text-red-500">{errors.body.message}</p>}
              <p className={`text-xs ${bodyLength > 500 ? "text-red-500" : "text-muted-foreground"}`}>
                {bodyLength}/500
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox id="sendViaSms" onCheckedChange={(checked) => setValue("sendViaSms", !!checked)} />
            <Label htmlFor="sendViaSms" className="text-sm">
              Also send via SMS (if parent doesn't have the app)
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedStudent}>
              {isSubmitting ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}