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

  if (/^[A-Za-z]:[\\/]/.test(expandedHome) || expandedHome.startsWith('\\\\')) {
    return path.win32.normalize(expandedHome);
  }

  return path.normalize(path.resolve(expandedHome));
}

function normalizeForPathCompare(value: string) {
  const unified = value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '');
  const withDriveLower = unified.replace(/^([A-Za-z]):/, (_, drive: string) => `${drive.toLowerCase()}:`);
  return withDriveLower || '/';
}

function isCrossPlatformAbsolutePath(value: string) {
  if (path.isAbsolute(value)) return true;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  if (value.startsWith('\\\\')) return true;
  return false;
}

export function resolveLocalStoragePath(input: string) {
  const raw = input.trim();
  if (!raw) return '';

  if (!isRunningInContainer()) {
    return normalizeLocalStoragePath(raw);
  }

  const containerRoot = normalizeLocalStoragePath(process.env.LOCAL_STORAGE_ROOT_PATH?.trim() || '/var/backups');
  const hostRootRaw = process.env.LOCAL_STORAGE_HOST_PATH?.trim() || '';

  if (!isCrossPlatformAbsolutePath(raw)) {
    return normalizeLocalStoragePath(path.posix.join(containerRoot, raw.replace(/\\/g, '/')));
  }

  const candidate = normalizeForPathCompare(raw);
  const containerRootComparable = normalizeForPathCompare(containerRoot);
  if (candidate === containerRootComparable || candidate.startsWith(`${containerRootComparable}/`)) {
    return normalizeLocalStoragePath(raw);
  }

  if (hostRootRaw) {
    const hostRootComparable = normalizeForPathCompare(hostRootRaw);
    if (candidate === hostRootComparable || candidate.startsWith(`${hostRootComparable}/`)) {
      const relative = candidate.slice(hostRootComparable.length).replace(/^\/+/, '');
      const mapped = relative ? path.posix.join(containerRoot, relative) : containerRoot;
      return normalizeLocalStoragePath(mapped);
    }
  }

  return normalizeLocalStoragePath(raw);
}
