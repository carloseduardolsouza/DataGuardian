import {
  bigIntToSafe,
  buildPaginatedResponse,
  getPaginationParams,
  maskCredentials,
} from '../../../src/utils/config';

describe('config utils', () => {
  it('masks sensitive credential fields', () => {
    expect(maskCredentials({
      username: 'admin',
      password: 'secret',
      access_key: 'key-123',
    })).toEqual({
      username: 'admin',
      password: '**********',
      access_key: '**********',
    });
  });

  it('builds pagination params with defaults and limits', () => {
    expect(getPaginationParams({ page: '0', limit: '999' })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
    });
  });

  it('builds paginated response', () => {
    expect(buildPaginatedResponse([{ id: 1 }], 25, 2, 10)).toEqual({
      data: [{ id: 1 }],
      pagination: {
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      },
    });
  });

  it('converts bigint safely', () => {
    expect(bigIntToSafe(BigInt(10))).toBe(10);
    expect(bigIntToSafe(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1))).toBe((BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)).toString());
    expect(bigIntToSafe(null)).toBeNull();
  });
});
