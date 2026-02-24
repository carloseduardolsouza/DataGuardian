import * as os from 'node:os';
import * as path from 'node:path';
import { existsSync } from 'node:fs';

export type RuntimeOs = 'windows' | 'linux' | 'macos' | 'unknown';

export function detectRuntimeOs(): RuntimeOs {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'darwin') return 'macos';
  return 'unknown';
}

export function getDefaultTempDirectory() {
  const runtimeOs = detectRuntimeOs();
  if (runtimeOs === 'windows') {
    const base = process.env.LOCALAPPDATA?.trim() || os.tmpdir();
    return path.join(base, 'DataGuardian', 'tmp');
  }
  return path.join(os.tmpdir(), 'dataguardian');
}

export function isRunningInContainer() {
  if (process.env.DOCKER_CONTAINER?.trim().toLowerCase() === 'true') return true;
  return existsSync('/.dockerenv');
}

export function normalizeLocalStoragePath(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const expandedHome = trimmed.startsWith('~')
    ? path.join(os.homedir(), trimmed.slice(1))
    : trimmed;

  return path.normalize(path.resolve(expandedHome));
}
