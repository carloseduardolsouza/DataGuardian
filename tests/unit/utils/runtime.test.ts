import * as path from 'node:path';
import { detectRuntimeOs, getDefaultTempDirectory, normalizeLocalStoragePath } from '../../../src/utils/runtime';

describe('runtime utils', () => {
  it('detectRuntimeOs returns a supported value', () => {
    expect(['windows', 'linux', 'macos', 'unknown']).toContain(detectRuntimeOs());
  });

  it('getDefaultTempDirectory returns a path', () => {
    const directory = getDefaultTempDirectory();
    expect(typeof directory).toBe('string');
    expect(directory.length).toBeGreaterThan(0);
  });

  it('normalizeLocalStoragePath trims and resolves paths', () => {
    const normalized = normalizeLocalStoragePath('  ./tmp/test-folder  ');
    expect(path.isAbsolute(normalized)).toBe(true);
    expect(normalized.includes('tmp')).toBe(true);
  });

  it('normalizeLocalStoragePath returns empty string when input is empty', () => {
    expect(normalizeLocalStoragePath('   ')).toBe('');
  });
});
