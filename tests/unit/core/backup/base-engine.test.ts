import { getNumber, getOptionalString, getRequiredString } from '../../../../src/core/backup/engines/base-engine';

describe('base backup engine helpers', () => {
  it('getRequiredString returns value when valid', () => {
    expect(getRequiredString({ host: 'db.local' }, 'host')).toBe('db.local');
  });

  it('getRequiredString throws when invalid', () => {
    expect(() => getRequiredString({ host: '' }, 'host')).toThrow('Campo de conexao invalido: host');
  });

  it('getOptionalString returns trimmed string or empty string', () => {
    expect(getOptionalString({ user: ' admin ' }, 'user')).toBe('admin');
    expect(getOptionalString({ user: '  ' }, 'user')).toBe('');
  });

  it('getNumber returns parsed integer or fallback', () => {
    expect(getNumber({ port: '5432' }, 'port', 3306)).toBe(5432);
    expect(getNumber({}, 'port', 3306)).toBe(3306);
  });

  it('getNumber throws when invalid', () => {
    expect(() => getNumber({ port: -1 }, 'port', 3306)).toThrow('Campo de conexao invalido: port');
  });
});
