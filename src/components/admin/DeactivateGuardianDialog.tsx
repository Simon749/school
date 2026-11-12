'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface DeactivateGuardianDialogProps {
  guardianId: string;
  guardianName: string;
  isOpen: boolean;
  onClose: () => void;
  onDeactivated?: () => Promise<void> | void;
}

export function DeactivateGuardianDialog({
  guardianId,
  guardianName,
  isOpen,
  onClose,
  onDeactivated,
}: DeactivateGuardianDialogProps) {
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`/api/guardians/${guardianId}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to deactivate guardian');
      }

      toast.success(`${guardianName} has been deactivated. Their access is revoked immediately.`);
      setReason('');

      if (onDeactivated) {
        await onDeactivated();
      } else {
        router.refresh();
      }

      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Deactivate Guardian</h3>
        <p className="mb-4 text-sm text-gray-600">
          Are you sure you want to deactivate <strong>{guardianName}</strong>? They will{' '}
          <strong>immediately lose access</strong> to the parent portal and all associated data.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="reason"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Reason for deactivation (required)
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
              placeholder="e.g., Parent requested removal, student transferred..."
              required
              minLength={5}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              disabled={isLoading || reason.length < 5}
            >
              {isLoading ? 'Deactivating...' : 'Deactivate Guardian'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}