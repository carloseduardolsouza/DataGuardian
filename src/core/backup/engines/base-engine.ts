import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { tryAutoInstallBinary } from '../../../utils/binary-installer';

export interface EngineRunCallbacks {
  onProgress?: (bytesWritten: number) => void;
  onEngineLog?: (line: string) => void;
}

export interface EngineDumpResult {
  extension: string;
}

export interface BackupEngine {
  readonly type: string;
  dumpToFile(connectionConfig: unknown, outputFile: string, callbacks?: EngineRunCallbacks): Promise<EngineDumpResult>;
}

export function getRequiredString(cfg: Record<string, unknown>, key: string) {
  const value = cfg[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Campo de conexao invalido: ${key}`);
  }
  return value;
}

export function getOptionalString(cfg: Record<string, unknown>, key: string) {
  const value = cfg[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function getNumber(cfg: Record<string, unknown>, key: string, fallback: number) {
  const raw = cfg[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Campo de conexao invalido: ${key}`);
  }
  return Math.trunc(parsed);
}

async function existsFile(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(commandPath: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(commandPath, ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      resolve(code !== 'ENOENT');
    });

    child.once('close', () => {
      resolve(true);
    });
  });
}

function parseMajorVersionFromLabel(versionLabel: string) {
  const majorMatch = versionLabel.match(/(\d{1,2})/);
  if (!majorMatch) return null;
  const parsed = Number.parseInt(majorMatch[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePostgresCliMajor(versionText: string) {
  const postgresMatch = versionText.match(/postgresql\)\s+(\d{1,2})(?:\.\d+)?/i);
  if (postgresMatch) {
    const parsed = Number.parseInt(postgresMatch[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const genericMatch = versionText.match(/(\d{1,2})(?:\.\d+)?/);
  if (!genericMatch) return null;
  const parsed = Number.parseInt(genericMatch[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readCommandVersion(commandPath: string) {
  return new Promise<string | null>((resolve) => {
    const child = spawn(commandPath, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.once('error', () => {
      resolve(null);
    });

    child.once('close', (code) => {
      if (code !== 0 && output.trim() === '') {
        resolve(null);
        return;
      }
      resolve(output.trim() || null);
    });
  });
}

async function hasExpectedPostgresMajor(commandPath: string, preferredMajor: number) {
  const versionText = await readCommandVersion(commandPath);
  if (!versionText) return false;
  const major = parsePostgresCliMajor(versionText);
  return major === preferredMajor;
}

async function resolveWindowsBinaryPath(command: string, preferredPostgresMajor?: number) {
  if (process.platform !== 'win32') {
    return command;
  }

  const exe = `${command}.exe`;
  const programFiles = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]
    .filter((v): v is string => Boolean(v));

  const directCandidates: string[] = [];
  if (command === 'mysqldump') {
    directCandidates.push('C:\\xampp\\mysql\\bin\\mysqldump.exe');
  }
  if (command === 'mariadb-dump') {
    directCandidates.push('C:\\xampp\\mysql\\bin\\mariadb-dump.exe');
    directCandidates.push('C:\\xampp\\mysql\\bin\\mysqldump.exe');
  }
  if (command === 'mysql') {
    directCandidates.push('C:\\xampp\\mysql\\bin\\mysql.exe');
  }
  if (command === 'mariadb') {
    directCandidates.push('C:\\xampp\\mysql\\bin\\mariadb.exe');
    directCandidates.push('C:\\xampp\\mysql\\bin\\mysql.exe');
  }

  for (const candidate of directCandidates) {
    if (await existsFile(candidate)) return candidate;
  }

  for (const base of programFiles) {
    if (command === 'pg_dump') {
      const postgresRoot = path.join(base, 'PostgreSQL');
      try {
        const versions = await fs.readdir(postgresRoot, { withFileTypes: true });
        const ordered = versions
          .filter((dir) => dir.isDirectory())
          .map((dir) => ({ dir, major: parseMajorVersionFromLabel(dir.name) }))
          .sort((a, b) => {
            if (preferredPostgresMajor !== undefined) {
              const aPreferred = a.major === preferredPostgresMajor ? 1 : 0;
              const bPreferred = b.major === preferredPostgresMajor ? 1 : 0;
              if (aPreferred !== bPreferred) return bPreferred - aPreferred;
            }
            return (b.major ?? -1) - (a.major ?? -1);
          });

        for (const entry of ordered) {
          const dir = entry.dir;
          if (!dir.isDirectory()) continue;
          const candidate = path.join(postgresRoot, dir.name, 'bin', exe);
          if (await existsFile(candidate)) return candidate;
        }
      } catch {
        // ignore
      }
    }

    if (command === 'pg_restore') {
      const postgresRoot = path.join(base, 'PostgreSQL');
      try {
        const versions = await fs.readdir(postgresRoot, { withFileTypes: true });
        const ordered = versions
          .filter((dir) => dir.isDirectory())
          .map((dir) => ({ dir, major: parseMajorVersionFromLabel(dir.name) }))
          .sort((a, b) => {
            if (preferredPostgresMajor !== undefined) {
              const aPreferred = a.major === preferredPostgresMajor ? 1 : 0;
              const bPreferred = b.major === preferredPostgresMajor ? 1 : 0;
              if (aPreferred !== bPreferred) return bPreferred - aPreferred;
            }
            return (b.major ?? -1) - (a.major ?? -1);
          });

        for (const entry of ordered) {
          const dir = entry.dir;
          if (!dir.isDirectory()) continue;
          const candidate = path.join(postgresRoot, dir.name, 'bin', exe);
          if (await existsFile(candidate)) return candidate;
        }
      } catch {
        // ignore
      }
    }

    if (
      command === 'mysqldump'
      || command === 'mysql'
      || command === 'mariadb-dump'
      || command === 'mariadb'
    ) {
      for (const product of ['MySQL', 'MariaDB']) {
        const mysqlRoot = path.join(base, product);
        try {
          const installs = await fs.readdir(mysqlRoot, { withFileTypes: true });
          for (const dir of installs) {
            if (!dir.isDirectory()) continue;
            const binDir = path.join(mysqlRoot, dir.name, 'bin');
            const preferred = path.join(binDir, exe);
            if (await existsFile(preferred)) return preferred;

            // Cross-compat fallback between MySQL and MariaDB client binaries.
            if (command === 'mysqldump' && await existsFile(path.join(binDir, 'mariadb-dump.exe'))) {
              return path.join(binDir, 'mariadb-dump.exe');
            }
            if (command === 'mariadb-dump' && await existsFile(path.join(binDir, 'mysqldump.exe'))) {
              return path.join(binDir, 'mysqldump.exe');
            }
            if (command === 'mysql' && await existsFile(path.join(binDir, 'mariadb.exe'))) {
              return path.join(binDir, 'mariadb.exe');
            }
            if (command === 'mariadb' && await existsFile(path.join(binDir, 'mysql.exe'))) {
              return path.join(binDir, 'mysql.exe');
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return command;
}

export interface ResolveBinaryPathOptions {
  preferredPostgresMajor?: number;
}

export async function resolveBinaryPath(
  command: string,
  allowAutoInstall = true,
  onLog?: (line: string) => void,
  options?: ResolveBinaryPathOptions,
) {
  const preferredPostgresMajor = options?.preferredPostgresMajor;
  const isPostgresCommand = command === 'pg_dump' || command === 'pg_restore';

  const commandPath = await resolveWindowsBinaryPath(command, preferredPostgresMajor);
  if (
    isPostgresCommand
    && preferredPostgresMajor !== undefined
    && await commandExists(commandPath)
    && await hasExpectedPostgresMajor(commandPath, preferredPostgresMajor)
  ) {
    return commandPath;
  }

  if (isPostgresCommand && preferredPostgresMajor !== undefined && process.platform !== 'win32') {
    const linuxAndUnixCandidates = [
      `${command}${preferredPostgresMajor}`,
      `${command}-${preferredPostgresMajor}`,
      `/usr/lib/postgresql/${preferredPostgresMajor}/bin/${command}`,
      `/usr/pgsql-${preferredPostgresMajor}/bin/${command}`,
      `/opt/homebrew/opt/libpq/bin/${command}`,
      `/usr/local/opt/libpq/bin/${command}`,
    ];

    for (const candidate of linuxAndUnixCandidates) {
      if (await commandExists(candidate) && await hasExpectedPostgresMajor(candidate, preferredPostgresMajor)) {
        return candidate;
      }
    }
  }

  if (await commandExists(commandPath)) {
    return commandPath;
  }

  if (allowAutoInstall) {
    const installed = await tryAutoInstallBinary(command, onLog);
    if (installed) {
      return resolveBinaryPath(command, false, onLog, options);
    }
  }

  return commandPath;
}

export async function spawnCommandToFile(params: {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  outputFile: string;
  preferredPostgresMajor?: number;
  callbacks?: EngineRunCallbacks;
}) {
  const commandPath = await resolveBinaryPath(
    params.command,
    true,
    (line) => params.callbacks?.onEngineLog?.(`[installer] ${line}`),
    { preferredPostgresMajor: params.preferredPostgresMajor },
  );
  await fs.mkdir(path.dirname(params.outputFile), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(params.outputFile);
    const child = spawn(commandPath, params.args, {
      env: params.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderrBuffer = '';

    const tickProgress = async () => {
      try {
        const stat = await fs.stat(params.outputFile);
        params.callbacks?.onProgress?.(stat.size);
      } catch {
        // ignore while file is being created
      }
    };

    const timer = setInterval(() => {
      void tickProgress();
    }, 1500);

    child.stdout.pipe(out);

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;
      const lines = text
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        params.callbacks?.onEngineLog?.(line);
      }
    });

    child.once('error', (err) => {
      clearInterval(timer);
      out.destroy();
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`Binario '${params.command}' nao encontrado no PATH`));
        return;
      }
      reject(err);
    });

    child.once('close', (code) => {
      clearInterval(timer);
      out.end();

      void tickProgress().finally(() => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderrBuffer.trim() || `${params.command} terminou com codigo ${code}`));
      });
    });
  });
}


