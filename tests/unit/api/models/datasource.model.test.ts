import { formatDatasource } from '../../../../src/api/models/datasource.model';

describe('datasource model', () => {
  it('formats datasource payload', () => {
    const createdAt = new Date('2026-02-21T10:00:00.000Z');
    const updatedAt = new Date('2026-02-22T10:00:00.000Z');

    const formatted = formatDatasource({
      id: 'ds-1',
      name: 'Main DB',
      type: 'postgres',
      status: 'healthy',
      enabled: true,
      tags: ['prod'],
      lastHealthCheckAt: createdAt,
      createdAt,
      updatedAt,
    });

    expect(formatted).toEqual({
      id: 'ds-1',
      name: 'Main DB',
      type: 'postgres',
      status: 'healthy',
      enabled: true,
      tags: ['prod'],
      last_health_check_at: '2026-02-21T10:00:00.000Z',
      created_at: '2026-02-21T10:00:00.000Z',
      updated_at: '2026-02-22T10:00:00.000Z',
    });
  });
});
