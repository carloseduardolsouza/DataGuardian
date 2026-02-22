import { formatNotification } from '../../../../src/api/models/notification.model';

describe('notification model', () => {
  it('formats notification payload', () => {
    const createdAt = new Date('2026-02-22T09:00:00.000Z');
    const readAt = new Date('2026-02-22T10:00:00.000Z');

    const payload = formatNotification({
      id: 'notif-1',
      type: 'backup_failed',
      severity: 'critical',
      entityType: 'backup_job',
      entityId: 'job-1',
      title: 'Falha',
      message: 'Backup falhou',
      metadata: { retry: true },
      readAt,
      createdAt,
    });

    expect(payload).toEqual({
      id: 'notif-1',
      type: 'backup_failed',
      severity: 'critical',
      entity_type: 'backup_job',
      entity_id: 'job-1',
      title: 'Falha',
      message: 'Backup falhou',
      metadata: { retry: true },
      read_at: '2026-02-22T10:00:00.000Z',
      created_at: '2026-02-22T09:00:00.000Z',
    });
  });
});
