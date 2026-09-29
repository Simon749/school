// src/components/messages/MessageItem.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, MailOpen } from "lucide-react";

interface Message {
  id: string;
  subject: string | null;
  body: string;
  messageType: string;
  sentVia: string[];
  readAt: string | null;
  createdAt: string;
  sender: {
    firstName: string;
    lastName: string;
    role: string;
    teacher: { isClassTeacher: boolean } | null;
  };
}

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const [isRead, setIsRead] = useState(!!message.readAt);
  const [expanded, setExpanded] = useState(false);

  const handleExpand = async () => {
    if (!isRead) {
      try {
        await fetch(`/api/messages/${message.id}/read`, { method: "PUT" });
        setIsRead(true);
      } catch (error) {
        console.error("Failed to mark as read:", error);
      }
    }
    setExpanded(!expanded);
  };

  const senderTitle = message.sender.teacher?.isClassTeacher
    ? "Class Teacher"
    : message.sender.role.charAt(0).toUpperCase() + message.sender.role.slice(1);

  return (
    <Card className={!isRead ? "border-l-4 border-l-blue-500" : ""}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {isRead ? (
                <MailOpen className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Mail className="h-5 w-5 text-blue-500" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  {message.sender.firstName} {message.sender.lastName}
                </p>
                <Badge variant="outline" className="text-xs">
                  {senderTitle}
                </Badge>
              </div>
              {message.subject && (
                <p className="text-sm font-medium mt-1">{message.subject}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(message.createdAt).toLocaleString("en-KE")}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleExpand}>
            {expanded ? "Collapse" : "Read"}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
          {message.sentVia.includes("sms") && (
            <p className="text-xs text-muted-foreground mt-2">
              Also sent via SMS
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}