import { randomUUID } from 'node:crypto';

export interface StorageHealthEntry {
  id: string;
  storage_location_id: string;
  storage_name: string;
  storage_type: string;
  checked_at: string;
  status: 'ok' | 'error';
  latency_ms: number | null;
  available_space_gb: number | null;
  error_message: string | null;
}

const MAX_ENTRIES = 1000;
const entries: StorageHealthEntry[] = [];

export function pushStorageHealthEntry(
  data: Omit<StorageHealthEntry, 'id' | 'checked_at'> & { checked_at?: string },
) {
  entries.unshift({
    ...data,
    id: randomUUID(),
    checked_at: data.checked_at ?? new Date().toISOString(),
  });

  if (entries.length > MAX_ENTRIES) {
    entries.splice(MAX_ENTRIES);
  }
}

export function listStorageHealthEntries(filters: {
  storage_location_id?: string;
  from?: string;
  to?: string;
  skip: number;
  limit: number;
}) {
  const filtered = entries.filter((item) => {
    if (filters.storage_location_id && item.storage_location_id !== filters.storage_location_id) {
      return false;
    }

    if (filters.from && item.checked_at < filters.from) {
      return false;
    }

    if (filters.to && item.checked_at > filters.to) {
      return false;
    }

    return true;
  });

  const total = filtered.length;
  const data = filtered.slice(filters.skip, filters.skip + filters.limit);

  return { data, total };
}
