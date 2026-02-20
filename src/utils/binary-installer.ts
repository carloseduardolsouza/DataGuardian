import { spawn } from 'node:child_process';
import { logger } from './logger';

type InstallerLog = (line: string) => void;

function canAutoInstall() {
  return process.env.DATAGUARDIAN_AUTO_INSTALL_BINARIES !== 'false';
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

async function tryInstallPostgresTools(onLog?: InstallerLog) {
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
    if (await runCommand('apt-get', ['update'])) {
      if (await runCommand('apt-get', ['install', '-y', 'postgresql-client'])) return true;
    }
    if (await runCommand('apk', ['add', '--no-cache', 'postgresql-client'])) return true;
    if (await runCommand('dnf', ['install', '-y', 'postgresql'])) return true;
    if (await runCommand('yum', ['install', '-y', 'postgresql'])) return true;
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
    if (await runCommand('apt-get', ['update'])) {
      if (await runCommand('apt-get', ['install', '-y', 'default-mysql-client'])) return true;
      if (await runCommand('apt-get', ['install', '-y', 'mysql-client'])) return true;
    }
    if (await runCommand('apk', ['add', '--no-cache', 'mysql-client'])) return true;
    if (await runCommand('dnf', ['install', '-y', 'mysql'])) return true;
    if (await runCommand('yum', ['install', '-y', 'mysql'])) return true;
    return false;
  }

  if (process.platform === 'darwin') {
    onLog?.('Tentando instalar MySQL client via brew...');
    if (await runCommand('brew', ['install', 'mysql-client'])) return true;
    return false;
  }

  return false;
}

export async function tryAutoInstallBinary(command: string, onLog?: InstallerLog) {
  if (!canAutoInstall()) {
    onLog?.('Auto-instalacao de binarios desabilitada por DATAGUARDIAN_AUTO_INSTALL_BINARIES=false');
    return false;
  }

  const normalized = command.toLowerCase();
  const isPostgresTool = normalized === 'pg_dump' || normalized === 'pg_restore';
  const isMySqlTool = normalized === 'mysqldump'
    || normalized === 'mysql'
    || normalized === 'mariadb-dump'
    || normalized === 'mariadb';

  if (!isPostgresTool && !isMySqlTool) {
    onLog?.(`Auto-instalacao nao suportada para o binario '${command}'`);
    return false;
  }

  logger.warn({ command, platform: process.platform }, 'Binario ausente. Tentando instalacao automatica');
  onLog?.(`Binario '${command}' ausente. Tentando instalacao automatica...`);

  const installed = isPostgresTool
    ? await tryInstallPostgresTools(onLog)
    : await tryInstallMySqlTools(onLog);

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
