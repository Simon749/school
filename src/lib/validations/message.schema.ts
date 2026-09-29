// src/lib/validations/message.schema.ts
import { z } from "zod";

export const messageTypeSchema = z.enum([
  "direct",
  "class",
  "school_wide",
  "automated",
]);

export const createMessageSchema = z.object({
  recipientId: z.string().uuid().optional(), // null for broadcast
  streamId: z.string().uuid().optional(), // for class/school_wide
  subject: z.string().max(200).optional(),
  body: z.string().min(1, "Message cannot be empty").max(500, "Message limited to 500 characters"),
  messageType: messageTypeSchema,
  sendViaSms: z.boolean().default(false),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;