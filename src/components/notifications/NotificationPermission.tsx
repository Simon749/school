// src/components/notifications/NotificationPermission.tsx
"use client";

import { useEffect, useState } from "react";
import { requestNotificationPermission, onForegroundMessage } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

export function NotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | "default">("default");
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);

      // Listen for foreground messages
      onForegroundMessage((payload) => {
        console.log("[NotificationPermission] Foreground message:", payload);
        toast.info(payload.notification?.title || "New notification", {
          description: payload.notification?.body,
        });
      });
    }
  }, []);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      const token = await requestNotificationPermission();

      if (token) {
        // Store token in database
        const res = await fetch("/api/users/device-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          setPermission("granted");
          toast.success("Notifications enabled");
        } else {
          toast.error("Failed to save notification token");
        }
      } else {
        toast.error("Notification permission denied");
      }
    } catch (error) {
      console.error("Error requesting permission:", error);
      toast.error("Failed to enable notifications");
    } finally {
      setIsRequesting(false);
    }
  };

  if (permission === "granted") {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <Bell className="h-4 w-4" />
        <span>Notifications enabled</span>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600">
        <BellOff className="h-4 w-4" />
        <span>Notifications blocked. Enable in browser settings.</span>
      </div>
    );
  }

  return (
    <Button onClick={handleRequestPermission} disabled={isRequesting} size="sm">
      {isRequesting ? "Enabling..." : "Enable Notifications"}
    </Button>
  );
}