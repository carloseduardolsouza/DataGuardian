import { extractAuditContextFromRequest } from '../../../../src/api/models/audit-log.model';

describe('audit-log model', () => {
  it('extracts context from request and authenticated user', () => {
    const context = extractAuditContextFromRequest(
      {
        ip: '127.0.0.1',
        get: (name: string) => (name === 'user-agent' ? 'Jest Agent' : undefined),
      },
      {
        id: 'user-1',
        username: 'admin',
      },
    );

    expect(context).toEqual({
      actor_user_id: 'user-1',
      actor_username: 'admin',
      ip: '127.0.0.1',
      user_agent: 'Jest Agent',
    });
  });

  it('returns null fields when values are missing/blank', () => {
    const context = extractAuditContextFromRequest(
      {
        ip: '  ',
        get: () => '   ',
      },
      {
        id: '',
        username: '',
      },
    );

    expect(context).toEqual({
      actor_user_id: null,
      actor_username: null,
      ip: null,
      user_agent: null,
    });
  });
});
