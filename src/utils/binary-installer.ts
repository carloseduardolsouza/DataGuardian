import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { logger } from './logger';

type InstallerLog = (line: string) => void;
interface AutoInstallOptions {
  preferredPostgresMajor?: number;
}

function canAutoInstall() {
  return process.env.DATAGUARDIAN_AUTO_INSTALL_BINARIES !== 'false';
}

async function runCommandWithOptionalSudo(command: string, args: string[], onLog?: InstallerLog) {
  if (await runCommand(command, args)) return true;

  if (
    process.platform === 'linux'
    && typeof process.getuid === 'function'
    && process.getuid() !== 0
  ) {
    onLog?.(`Comando '${command} ${args.join(' ')}' falhou sem root. Tentando via sudo -n...`);
    if (await runCommand('sudo', ['-n', command, ...args])) {
      return true;
    }
  }

  return false;
}

function runCommand(command: string, args: string[], timeoutMs = 10 * 60 * 1000) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(false);
    }, timeoutMs);

    child.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });

    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

async function tryEnablePgdgAptRepository(onLog?: InstallerLog) {
  onLog?.('Tentando habilitar repositorio PGDG (apt.postgresql.org)...');
  const setupScript = [
    'set -e',
    'apt-get install -y --no-install-recommends ca-certificates gnupg wget',
    'install -d /etc/apt/keyrings',
    'wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg',
    'echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list',
  ].join(' && ');

  if (!await runCommandWithOptionalSudo('sh', ['-lc', setupScript], onLog)) {
    onLog?.('Falha ao habilitar PGDG automaticamente');
    return false;
  }

  onLog?.('PGDG habilitado com sucesso');
  return true;
}

async function tryInstallPostgresTools(onLog?: InstallerLog, options?: AutoInstallOptions) {
  if (process.platform === 'win32') {
    onLog?.('Tentando instalar PostgreSQL tools via winget...');
    if (await runCommand('winget', [
      'install',
      '-e',
      '--id', 'PostgreSQL.PostgreSQL',
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ])) {
      onLog?.('Instalacao via winget concluida');
      return true;
    }

    onLog?.('winget falhou. Tentando via choco...');
    if (await runCommand('choco', ['install', 'postgresql', '-y'])) {
      onLog?.('Instalacao via choco concluida');
      return true;
    }

    onLog?.('Falha ao instalar PostgreSQL tools automaticamente no Windows');
    return false;
  }

  if (process.platform === 'linux') {
    onLog?.('Tentando instalar PostgreSQL client no Linux...');
    const preferredMajor = options?.preferredPostgresMajor;
    if (await runCommandWithOptionalSudo('apt-get', ['update'], onLog)) {
      if (
        preferredMajor
        && await runCommandWithOptionalSudo('apt-get', ['install', '-y', `postgresql-client-${preferredMajor}`], onLog)
      ) {
        onLog?.(`Instalacao via apt concluida (postgresql-client-${preferredMajor})`);
        return true;
      }
      if (preferredMajor && await tryEnablePgdgAptRepository(onLog)) {
        if (await runCommandWithOptionalSudo('apt-get', ['update'], onLog)) {
          if (await runCommandWithOptionalSudo('apt-get', ['install', '-y', `postgresql-client-${preferredMajor}`], onLog)) {
            onLog?.(`Instalacao via apt/PGDG concluida (postgresql-client-${preferredMajor})`);
            return true;
          }
        }
      }
      if (await runCommandWithOptionalSudo('apt-get', ['install', '-y', 'postgresql-client'], onLog)) return true;
    }
    if (
      preferredMajor
      && await runCommandWithOptionalSudo('apk', ['add', '--no-cache', `postgresql${preferredMajor}-client`], onLog)
    ) return true;
    if (await runCommandWithOptionalSudo('apk', ['add', '--no-cache', 'postgresql-client'], onLog)) return true;
    if (preferredMajor && await runCommandWithOptionalSudo('dnf', ['install', '-y', `postgresql${preferredMajor}`], onLog)) return true;
    if (await runCommandWithOptionalSudo('dnf', ['install', '-y', 'postgresql'], onLog)) return true;
    if (preferredMajor && await runCommandWithOptionalSudo('yum', ['install', '-y', `postgresql${preferredMajor}`], onLog)) return true;
    if (await runCommandWithOptionalSudo('yum', ['install', '-y', 'postgresql'], onLog)) return true;
    return false;
  }

  if (process.platform === 'darwin') {
    onLog?.('Tentando instalar PostgreSQL tools via brew...');
    if (await runCommand('brew', ['install', 'libpq'])) {
      await runCommand('brew', ['link', '--force', 'libpq']);
      onLog?.('Instalacao via brew concluida');
      return true;
    }
    return false;
  }

  return false;
}

async function tryInstallMySqlTools(onLog?: InstallerLog) {
  if (process.platform === 'win32') {
    onLog?.('Tentando instalar MySQL tools via winget...');
    if (await runCommand('winget', [
      'install',
      '-e',
      '--id', 'Oracle.MySQL',
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ])) {
      onLog?.('Instalacao via winget concluida');
      return true;
    }

    onLog?.('winget falhou. Tentando via choco...');
    if (await runCommand('choco', ['install', 'mysql', '-y'])) {
      onLog?.('Instalacao via choco concluida');
      return true;
    }

    onLog?.('Falha ao instalar MySQL tools automaticamente no Windows');
    return false;
  }

  if (process.platform === 'linux') {
    if (await runCommandWithOptionalSudo('apt-get', ['update'], onLog)) {
      if (await runCommandWithOptionalSudo('apt-get', ['install', '-y', 'default-mysql-client'], onLog)) return true;
      if (await runCommandWithOptionalSudo('apt-get', ['install', '-y', 'mysql-client'], onLog)) return true;
    }
    if (await runCommandWithOptionalSudo('apk', ['add', '--no-cache', 'mysql-client'], onLog)) return true;
    if (await runCommandWithOptionalSudo('dnf', ['install', '-y', 'mysql'], onLog)) return true;
    if (await runCommandWithOptionalSudo('yum', ['install', '-y', 'mysql'], onLog)) return true;
    return false;
  }

  if (process.platform === 'darwin') {
    onLog?.('Tentando instalar MySQL client via brew...');
    if (await runCommand('brew', ['install', 'mysql-client'])) return true;
    return false;
  }

  return false;
}

async function tryInstallCompressionTools(command: 'zstd' | 'lz4', onLog?: InstallerLog) {
  if (process.platform === 'win32') {
    if (command === 'zstd') {
      onLog?.('Tentando instalar zstd via winget...');
      if (await runCommand('winget', [
        'install',
        '-e',
        '--id', 'zstd.zstd',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ])) {
        onLog?.('Instalacao via winget concluida');
        return true;
      }
    }

    onLog?.(`Tentando instalar ${command} via choco...`);
    if (await runCommand('choco', ['install', command, '-y'])) {
      onLog?.('Instalacao via choco concluida');
      return true;
    }
    return false;
  }

  if (process.platform === 'linux') {
    if (await runCommandWithOptionalSudo('apt-get', ['update'], onLog)) {
      if (await runCommandWithOptionalSudo('apt-get', ['install', '-y', command], onLog)) return true;
    }
    if (await runCommandWithOptionalSudo('apk', ['add', '--no-cache', command], onLog)) return true;
    if (await runCommandWithOptionalSudo('dnf', ['install', '-y', command], onLog)) return true;
    if (await runCommandWithOptionalSudo('yum', ['install', '-y', command], onLog)) return true;
    return false;
  }

  if (process.platform === 'darwin') {
    return runCommand('brew', ['install', command]);
  }

  return false;
}

async function tryInstallContainerRuntime(runtime: 'docker' | 'podman' | 'nerdctl', onLog?: InstallerLog) {
  if (process.platform === 'win32') {
    const wingetIds: Record<typeof runtime, string> = {
      docker: 'Docker.DockerDesktop',
      podman: 'RedHat.Podman',
      nerdctl: 'Rancher.Nerdctl',
    };
    const chocoPackages: Record<typeof runtime, string> = {
      docker: 'docker-desktop',
      podman: 'podman-desktop',
      nerdctl: 'nerdctl',
    };

    onLog?.(`Tentando instalar runtime '${runtime}' via winget...`);
    if (await runCommand('winget', [
      'install',
      '-e',
      '--id', wingetIds[runtime],
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--scope', 'user',
    ])) {
      onLog?.(`Instalacao via winget concluida para '${runtime}'`);
      return true;
    }

    onLog?.(`winget falhou. Tentando '${runtime}' via choco...`);
    if (await runCommand('choco', ['install', chocoPackages[runtime], '-y'])) {
      onLog?.(`Instalacao via choco concluida para '${runtime}'`);
      return true;
    }
    return false;
  }

  if (process.platform === 'linux') {
    if (await runCommandWithOptionalSudo('apt-get', ['update'], onLog)) {
      if (runtime === 'docker' && await runCommandWithOptionalSudo('apt-get', ['install', '-y', 'docker.io'], onLog)) return true;
      if (runtime === 'podman' && await runCommandWithOptionalSudo('apt-get', ['install', '-y', 'podman'], onLog)) return true;
      if (runtime === 'nerdctl' && await runCommandWithOptionalSudo('apt-get', ['install', '-y', 'nerdctl'], onLog)) return true;
    }
    if (await runCommandWithOptionalSudo('apk', ['add', '--no-cache', runtime], onLog)) return true;
    if (await runCommandWithOptionalSudo('dnf', ['install', '-y', runtime], onLog)) return true;
    if (await runCommandWithOptionalSudo('yum', ['install', '-y', runtime], onLog)) return true;
    return false;
  }

  if (process.platform === 'darwin') {
    return runCommand('brew', ['install', runtime]);
  }

  return false;
}

export async function tryAutoInstallBinary(command: string, onLog?: InstallerLog, options?: AutoInstallOptions) {
  if (!canAutoInstall()) {
    onLog?.('Auto-instalacao de binarios desabilitada por DATAGUARDIAN_AUTO_INSTALL_BINARIES=false');
    return false;
  }

  const normalized = command.toLowerCase();
  const commandName = path.basename(normalized).replace(/\.exe$/, '');
  const isPostgresTool = commandName === 'pg_dump' || commandName === 'pg_restore';
  const isMySqlTool = commandName === 'mysqldump'
    || commandName === 'mysql'
    || commandName === 'mariadb-dump'
    || commandName === 'mariadb';
  const isCompressionTool = commandName === 'zstd' || commandName === 'lz4';
  const isContainerRuntime = commandName === 'docker' || commandName === 'podman' || commandName === 'nerdctl';

  if (!isPostgresTool && !isMySqlTool && !isCompressionTool && !isContainerRuntime) {
    onLog?.(`Auto-instalacao nao suportada para o binario '${command}'`);
    return false;
  }

  logger.warn({ command, platform: process.platform }, 'Binario ausente. Tentando instalacao automatica');
  onLog?.(`Binario '${command}' ausente. Tentando instalacao automatica...`);

  const installed = isPostgresTool
    ? await tryInstallPostgresTools(onLog, options)
    : (isMySqlTool
      ? await tryInstallMySqlTools(onLog)
      : (isCompressionTool
        ? await tryInstallCompressionTools(commandName as 'zstd' | 'lz4', onLog)
        : await tryInstallContainerRuntime(commandName as 'docker' | 'podman' | 'nerdctl', onLog)));

  if (installed) {
    logger.info({ command }, 'Instalacao automatica concluida');
    onLog?.(`Instalacao automatica de '${command}' concluida`);
  } else {
    logger.warn(
      { command, platform: process.platform },
      'Instalacao automatica falhou (permite desativar via DATAGUARDIAN_AUTO_INSTALL_BINARIES=false)',
    );
    onLog?.(
      `Falha na instalacao automatica de '${command}'. Verifique permissao administrativa e PATH`,
    );
  }

  return installed;
}
