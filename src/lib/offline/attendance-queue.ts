const DB_NAME = 'edutrack-offline';
const STORE = 'pending-attendance';
const DB_VERSION = 2; // Bumped for new indexes

export type OfflineAttendanceStatus = 'pending' | 'syncing' | 'synced' | 'conflict';

export interface OfflineAttendanceRecord {
  id?: number;
  operationId: string;
  schoolId: string; // ✅ Added for worker re-validation
  slotId: string;
  date: string;
  entries: { studentId: string; status: string; absenceReason?: string }[]; // ✅ Typed for safety
  markedBy: string; // ✅ Added: Worker strictly requires this
  queuedAt: string;
  status: OfflineAttendanceStatus;
  conflictReason?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('operationId', 'operationId', { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueOfflineAttendance(payload: {
  schoolId: string;
  slotId: string;
  date: string;
  entries: { studentId: string; status: string; absenceReason?: string }[];
  markedBy: string;
}): Promise<string> {
  const db = await openDb();
  const operationId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const record: OfflineAttendanceRecord = {
      operationId,
      ...payload,
      queuedAt: new Date().toISOString(),
      status: 'pending',
    };
    tx.objectStore(STORE).add(record);
    tx.oncomplete = () => resolve(operationId);
    tx.onerror = () => reject(tx.error);
  });
}

async function getRecordsByStatus(
  status: OfflineAttendanceStatus
): Promise<OfflineAttendanceRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('status');
    const req = index.getAll(status);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateRecordStatus(
  id: number,
  status: OfflineAttendanceStatus,
  conflictReason?: string
) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result as OfflineAttendanceRecord;
      if (record) {
        record.status = status;
        if (conflictReason) record.conflictReason = conflictReason;
        store.put(record);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteRecord(id: number) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushOfflineAttendance(): Promise<{ synced: number; conflicts: number }> {
  const pending = await getRecordsByStatus('pending');
  let synced = 0;
  let conflicts = 0;

  for (const item of pending) {
    if (!item.id) continue;

    // Mark as syncing to prevent double-flush if called concurrently
    await updateRecordStatus(item.id, 'syncing');

    try {
      const res = await fetch('/api/attendance/student', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': item.operationId, // ✅ ATT-11: Send Operation ID
        },
        body: JSON.stringify({
          slotId: item.slotId,
          date: item.date,
          entries: item.entries,
          markedBy: item.markedBy, // ✅ ATT-11: Include markedBy for the worker
        }),
      });

      if (res.ok) {
        // Success or idempotent replay
        await deleteRecord(item.id); // Clean up store on success
        synced++;
      } else if (res.status === 423 || res.status === 409) {
        // Register was locked or conflict occurred while offline
        const errData = await res.json().catch(() => ({}));
        await updateRecordStatus(
          item.id,
          'conflict',
          errData.error || 'Register was modified or locked while offline.'
        );
        conflicts++;
      } else if (res.status === 400) {
        // Validation error (e.g., date is now in the future, student removed)
        const errData = await res.json().catch(() => ({}));
        await updateRecordStatus(
          item.id,
          'conflict',
          errData.error || 'Invalid data. Please re-mark attendance.'
        );
        conflicts++;
      } else {
        // Server error (500) or network failure - revert to pending for retry
        await updateRecordStatus(item.id, 'pending');
      }
    } catch (err) {
      // Network failure - revert to pending
      await updateRecordStatus(item.id, 'pending');
    }
  }

  return { synced, conflicts };
}

/** Clear all offline attendance data (e.g., on logout to prevent cross-teacher sync) */
export async function clearOfflineAttendance(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
