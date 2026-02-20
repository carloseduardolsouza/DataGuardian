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

async function resolveWindowsBinaryPath(command: string) {
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
        for (const dir of versions) {
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
        for (const dir of versions) {
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

export async function resolveBinaryPath(
  command: string,
  allowAutoInstall = true,
  onLog?: (line: string) => void,
) {
  const commandPath = await resolveWindowsBinaryPath(command);
  if (await commandExists(commandPath)) {
    return commandPath;
  }

  if (allowAutoInstall) {
    const installed = await tryAutoInstallBinary(command, onLog);
    if (installed) {
      return resolveBinaryPath(command, false, onLog);
    }
  }

  return commandPath;
}

export async function spawnCommandToFile(params: {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  outputFile: string;
  callbacks?: EngineRunCallbacks;
}) {
  const commandPath = await resolveBinaryPath(
    params.command,
    true,
    (line) => params.callbacks?.onEngineLog?.(`[installer] ${line}`),
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


