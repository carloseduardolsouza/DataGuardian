import { Prisma } from '@prisma/client';
import {
  formatStorageLocation,
  maskStorageConfig,
} from '../../../../src/api/models/storage-location.model';

describe('storage-location model', () => {
  it('masks sensitive storage fields', () => {
    const masked = maskStorageConfig('s3', {
      bucket: 'my-bucket',
      secret_access_key: 'secret',
    });

    expect(masked).toEqual({
      bucket: 'my-bucket',
      secret_access_key: '**********',
    });
  });

  it('formats storage location payload', () => {
    const createdAt = new Date('2026-02-21T10:00:00.000Z');
    const updatedAt = new Date('2026-02-22T10:00:00.000Z');

    const formatted = formatStorageLocation({
      id: 'st-1',
      name: 'S3 Principal',
      type: 's3',
      isDefault: true,
      availableSpaceGb: new Prisma.Decimal('123.45'),
      status: 'healthy',
      createdAt,
      updatedAt,
    });

    expect(formatted).toEqual({
      id: 'st-1',
      name: 'S3 Principal',
      type: 's3',
      is_default: true,
      available_space_gb: 123.45,
      status: 'healthy',
      created_at: '2026-02-21T10:00:00.000Z',
      updated_at: '2026-02-22T10:00:00.000Z',
    });
  });
});
