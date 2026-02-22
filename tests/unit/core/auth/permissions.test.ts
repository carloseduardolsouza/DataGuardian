import {
  DEFAULT_ROLE_NAMES,
  DEFAULT_ROLE_SEEDS,
  PERMISSIONS,
  PERMISSION_SEEDS,
} from '../../../../src/core/auth/permissions';

describe('permissions', () => {
  it('has unique permission keys', () => {
    const keys = PERMISSION_SEEDS.map((seed) => seed.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('admin role contains all permissions', () => {
    const adminRole = DEFAULT_ROLE_SEEDS.find((role) => role.name === DEFAULT_ROLE_NAMES.ADMIN);
    expect(adminRole).toBeDefined();
    expect(adminRole?.permissions.length).toBe(PERMISSION_SEEDS.length);
  });

  it('readonly role does not include write permissions', () => {
    const readonlyRole = DEFAULT_ROLE_SEEDS.find((role) => role.name === DEFAULT_ROLE_NAMES.READONLY);
    expect(readonlyRole).toBeDefined();
    expect(readonlyRole?.permissions).not.toContain(PERMISSIONS.SYSTEM_WRITE);
    expect(readonlyRole?.permissions).not.toContain(PERMISSIONS.DATASOURCES_WRITE);
  });
});
