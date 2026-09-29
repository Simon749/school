"use client";

import { useState, useEffect } from "react";

interface AuditLog {
  id: string;
  action: string;
  tableName: string;
  recordId: string | null;
  actor: { firstName: string; lastName: string } | null;
  createdAt: string;
  ipAddress: string | null;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch("/api/admin/audit-logs?limit=100");
        const data = await res.json();
        setLogs(data);
      } catch (error) {
        console.error("Failed to fetch audit logs:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const formatAction = (action: string) => {
    return action
      .split(".")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (isLoading) {
    return <div className="p-6">Loading audit logs...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Audit Logs
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Track all sensitive actions performed in the system.
        </p>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Table
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                IP Address
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString("en-KE")}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                    {formatAction(log.action)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {log.actor
                    ? `${log.actor.firstName} ${log.actor.lastName}`
                    : "System"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">
                  {log.tableName}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">
                  {log.ipAddress || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}