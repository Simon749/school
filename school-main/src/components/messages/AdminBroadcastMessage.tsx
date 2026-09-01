// src/components/messages/AdminBroadcastMessage.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createMessageSchema, CreateMessageInput } from "@/lib/validations/message.schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Stream {
  id: string;
  name: string;
  grade: { name: string };
}

interface AdminBroadcastMessageProps {
  streams: Stream[];
}

type CreateMessageFormInput = z.input<typeof createMessageSchema>;

export function AdminBroadcastMessage({ streams }: AdminBroadcastMessageProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);



  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<
    CreateMessageFormInput,
    unknown,
    CreateMessageInput>({
      resolver: zodResolver(createMessageSchema),
      defaultValues: {
        messageType: "school_wide",
        body: "",
        sendViaSms: false,
      },
    });

  const messageType = watch("messageType");
  const streamId = watch("streamId");
  const bodyLength = watch("body")?.length || 0;
  const sendViaSms = watch("sendViaSms");

  // Estimate SMS cost (1 SMS = 160 chars, ~KES 1.5 per SMS)
  const smsCount = Math.ceil(bodyLength / 160);
  const estimatedCost = smsCount * 1.5 * (recipientCount || 0);

  const handleStreamChange = async (value: string | null) => {
    setValue("streamId", value as any);

    if (messageType === "class" && value) {
      // Fetch count of parents in this stream
      const res = await fetch(`/api/streams/${value}/guardian-count`);
      if (res.ok) {
        const { count } = await res.json();
        setRecipientCount(count);
      }
    } else if (messageType === "school_wide") {
      // Fetch total parent count
      const res = await fetch("/api/school/guardian-count");
      if (res.ok) {
        const { count } = await res.json();
        setRecipientCount(count);
      }
    }
  };

  const onSubmit = async (data: CreateMessageInput) => {
    if (!recipientCount || recipientCount === 0) {
      toast.error("No recipients found");
      return;
    }

    if (sendViaSms && !confirm(`This will send SMS to ${recipientCount} parents. Estimated cost: KES ${estimatedCost.toFixed(2)}. Continue?`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send message");
      }

      toast.success(`Message sent to ${recipientCount} recipients`);
      setOpen(false);
      reset();
      setRecipientCount(null);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>Broadcast Message</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Broadcast Message</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Recipients</Label>
            <Select onValueChange={(v) => setValue("messageType", v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select recipients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="school_wide">Whole School</SelectItem>
                <SelectItem value="class">Specific Class</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {messageType === "class" && (
            <div className="space-y-2">
              <Label>Select Class</Label>
              <Select onValueChange={handleStreamChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class" />
                </SelectTrigger>
                <SelectContent>
                  {streams.map((stream) => (
                    <SelectItem key={stream.id} value={stream.id}>
                      {stream.grade.name} {stream.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {messageType === "school_wide" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleStreamChange("")}
              className="w-full"
            >
              Load Recipient Count
            </Button>
          )}

          {recipientCount !== null && (
            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-sm font-medium">Recipients: {recipientCount} parents</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Subject (Optional)</Label>
            <Input {...register("subject")} placeholder="e.g., Important Notice" />
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
              Send via SMS to parents without the app
            </Label>
          </div>

          {sendViaSms && recipientCount && (
            <div className="bg-yellow-50 p-3 rounded-md">
              <p className="text-sm font-medium">SMS Cost Estimate</p>
              <p className="text-xs text-muted-foreground">
                {smsCount} SMS × {recipientCount} parents × KES 1.5 = <strong>KES {estimatedCost.toFixed(2)}</strong>
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !recipientCount}>
              {isSubmitting ? "Sending..." : "Send Broadcast"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}