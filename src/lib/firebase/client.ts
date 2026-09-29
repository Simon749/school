// src/lib/firebase/client.ts
import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage, MessagePayload } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (only once)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const messaging = typeof window !== "undefined" ? getMessaging(app) : null;

export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === "undefined" || !messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    
    if (permission !== "granted") {
      console.log("[Firebase] Notification permission denied");
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    });

    console.log("[Firebase] Got FCM token:", token);
    return token;
  } catch (error) {
    console.error("[Firebase] Error getting notification token:", error);
    return null;
  }
}

export function onForegroundMessage(callback: (payload: MessagePayload) => void) {
  if (typeof window === "undefined" || !messaging) return;

  onMessage(messaging, callback);
}