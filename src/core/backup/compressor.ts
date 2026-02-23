import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { resolveBinaryPath } from './engines/base-engine';

export type CompressionType = 'none' | 'gzip' | 'zstd' | 'lz4';

function clampCompressionLevel(level: number | undefined, min: number, max: number, fallback: number) {
  if (!Number.isFinite(level)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(level as number)));
}

async function spawnToFile(params: {
  command: string;
  args: string[];
  outputFile: string;
}) {
  const commandPath = await resolveBinaryPath(params.command);
  await fs.mkdir(path.dirname(params.outputFile), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(commandPath, params.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const output = createWriteStream(params.outputFile);
    let stderr = '';

    child.stdout.pipe(output);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', (err) => {
      output.destroy();
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new Error(`Binario '${params.command}' nao encontrado no PATH`));
        return;
      }
      reject(err);
    });

    child.once('close', (code) => {
      output.end();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${params.command} terminou com codigo ${code}`));
    });
  });
}

async function spawnWithOutputPath(params: {
  command: string;
  args: string[];
}) {
  const commandPath = await resolveBinaryPath(params.command);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(commandPath, params.args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new Error(`Binario '${params.command}' nao encontrado no PATH`));
        return;
      }
      reject(err);
    });

    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${params.command} terminou com codigo ${code}`));
    });
  });
}

export async function compressBackupFile(
  inputFile: string,
  compression: CompressionType,
  compressionLevel?: number,
) {
  if (compression === 'none') {
    const stat = await fs.stat(inputFile);
    return {
      outputFile: inputFile,
      compressedSizeBytes: stat.size,
      compressionExtension: '',
    };
  }

  if (compression === 'gzip') {
    const outputFile = `${inputFile}.gz`;
    const level = clampCompressionLevel(compressionLevel, 1, 9, 6);
    await pipeline(createReadStream(inputFile), createGzip({ level }), createWriteStream(outputFile));
    const stat = await fs.stat(outputFile);

    return {
      outputFile,
      compressedSizeBytes: stat.size,
      compressionExtension: '.gz',
    };
  }

  if (compression === 'zstd') {
    const outputFile = `${inputFile}.zst`;
    const level = clampCompressionLevel(compressionLevel, 1, 19, 3);
    await spawnToFile({
      command: 'zstd',
      args: ['-q', '-f', `-${level}`, '--stdout', inputFile],
      outputFile,
    });
    const stat = await fs.stat(outputFile);

    return {
      outputFile,
      compressedSizeBytes: stat.size,
      compressionExtension: '.zst',
    };
  }

  const outputFile = `${inputFile}.lz4`;
  const level = clampCompressionLevel(compressionLevel, 1, 12, 4);
  await spawnWithOutputPath({
    command: 'lz4',
    args: ['-z', '-f', `-${level}`, inputFile, outputFile],
  });
  const stat = await fs.stat(outputFile);

  return {
    outputFile,
    compressedSizeBytes: stat.size,
    compressionExtension: '.lz4',
  };
}

export async function decompressBackupFile(inputFile: string) {
  if (inputFile.endsWith('.gz')) {
    const outputFile = inputFile.slice(0, -3);
    await pipeline(createReadStream(inputFile), createGunzip(), createWriteStream(outputFile));
    return outputFile;
  }

  if (inputFile.endsWith('.zst')) {
    const outputFile = inputFile.slice(0, -4);
    await spawnToFile({
      command: 'zstd',
      args: ['-d', '-q', '-f', '--stdout', inputFile],
      outputFile,
    });
    return outputFile;
  }

  if (inputFile.endsWith('.lz4')) {
    const outputFile = inputFile.slice(0, -4);
    await spawnWithOutputPath({
      command: 'lz4',
      args: ['-d', '-f', inputFile, outputFile],
    });
    return outputFile;
  }

  return inputFile;
}
