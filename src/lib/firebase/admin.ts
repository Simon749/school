// src/lib/firebase/admin.ts
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

// Initialize Firebase Admin (only once)
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export const messaging = getMessaging();

interface SendPushOptions {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(options: SendPushOptions) {
  const { tokens, title, body, data } = options;

  if (tokens.length === 0) {
    console.log("[Firebase] No tokens provided, skipping push");
    return;
  }

  try {
    const message = {
      notification: {
        title,
        body,
      },
      data: data || {},
      tokens,
      android: {
        priority: "high" as const,
        notification: {
          channelId: "default",
          sound: "default",
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);

    // Log results
    console.log(`[Firebase] Push sent: ${response.successCount} success, ${response.failureCount} failed`);

    // Handle invalid tokens (remove them from DB)
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
          invalidTokens.push(tokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        console.log(`[Firebase] Found ${invalidTokens.length} invalid tokens to remove`);
        // TODO: Remove invalid tokens from users.device_tokens
      }
    }

    return response;
  } catch (error: any) {
    console.error("[Firebase] Push notification error:", error);
    throw new Error(`Failed to send push: ${error.message}`);
  }
}