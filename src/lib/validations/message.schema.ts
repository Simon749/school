// src/lib/validations/message.schema.ts
import { z } from 'zod';

/** All values stored in `messages.message_type` (includes system-generated 'automated'). */
export const messageTypeSchema = z.enum(['direct', 'class', 'school_wide', 'automated']);

/** What a CLIENT may ask for. 'automated' is created only by the system, never via the API. */
export const clientMessageTypeSchema = z.enum(['direct', 'class', 'school_wide']);

export const createMessageSchema = z
  .object({
    recipientId: z.string().uuid().optional(), // required for 'direct'
    streamId: z.string().uuid().optional(), // required for 'class'
    subject: z.string().max(200).optional(),
    body: z
      .string()
      .min(1, 'Message cannot be empty')
      .max(500, 'Message limited to 500 characters'),
    messageType: clientMessageTypeSchema,
    sendViaSms: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.messageType === 'direct' && !value.recipientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientId'],
        message: 'Choose who this message is for',
      });
    }
    if (value.messageType === 'class' && !value.streamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['streamId'],
        message: 'Choose which class this message is for',
      });
    }
  });

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
