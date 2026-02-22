import {
  buildTemplateContext,
  renderTemplate,
} from '../../../../src/api/models/notification-template.model';

describe('notification template model', () => {
  it('renders placeholders with context values', () => {
    const rendered = renderTemplate('Job {{job}}: {{status}}', {
      job: 'daily-backup',
      status: 'ok',
    });
    expect(rendered).toBe('Job daily-backup: ok');
  });

  it('replaces missing values with empty string', () => {
    const rendered = renderTemplate('Value: {{missing}}', {});
    expect(rendered).toBe('Value: ');
  });

  it('builds template context with normalized fields', () => {
    const context = buildTemplateContext({
      type: 'backup_failed',
      severity: 'critical',
      entityType: 'backup_job',
      entityId: 'job-1',
      title: 'Falha',
      message: 'Backup falhou',
      metadata: { reason: 'timeout' },
    });

    expect(context.type).toBe('backup_failed');
    expect(context.severity_upper).toBe('CRITICAL');
    expect(context.metadata_json).toContain('timeout');
    expect(typeof context.created_at).toBe('string');
  });
});
