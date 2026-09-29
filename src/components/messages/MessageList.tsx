"use client";

import { useEffect, useState } from "react";
import { MessageItem } from "./MessageItem";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare } from "lucide-react";

interface MessageListProps {
  teacherId: string;
  userId: string;
}

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

export function MessageList({ teacherId, userId }: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const limit = 20;

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        unreadOnly: unreadOnly.toString(),
      });

      const res = await fetch(`/api/messages?${params}`);
      if (!res.ok) throw new Error("Failed to fetch messages");

      const data = await res.json();
      setMessages(data.messages);
      setTotal(data.total);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [page, unreadOnly]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-gray-300"
            />
            Show unread only
          </label>
          <span className="text-sm text-muted-foreground">
            {total} {total === 1 ? "message" : "messages"}
          </span>
        </div>
      </div>

      {/* Messages */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {unreadOnly ? "No unread messages" : "No messages yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}