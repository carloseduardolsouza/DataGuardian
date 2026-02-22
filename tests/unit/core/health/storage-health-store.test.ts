import { listStorageHealthEntries, pushStorageHealthEntry } from '../../../../src/core/health/storage-health-store';

describe('storage health store', () => {
  it('stores and lists entries with filter by storage id', () => {
    const storageId = `storage-${Date.now()}`;
    pushStorageHealthEntry({
      storage_location_id: storageId,
      storage_name: 'Primary',
      storage_type: 's3',
      status: 'ok',
      latency_ms: 120,
      available_space_gb: 50,
      error_message: null,
    });

    const result = listStorageHealthEntries({
      storage_location_id: storageId,
      skip: 0,
      limit: 10,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.data[0].storage_location_id).toBe(storageId);
  });

  it('applies date filtering', () => {
    const result = listStorageHealthEntries({
      from: '2999-01-01T00:00:00.000Z',
      skip: 0,
      limit: 10,
    });

    expect(result.total).toBe(0);
    expect(result.data).toEqual([]);
  });
});
