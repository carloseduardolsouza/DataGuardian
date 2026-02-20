import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';

export type DeltaMode = 'incremental' | 'differential';

export interface DeltaArtifact {
  format: 'dataguardian-delta-v1';
  mode: DeltaMode;
  chunk_size: number;
  base_size: number;
  target_size: number;
  base_checksum_sha256: string;
  target_checksum_sha256: string;
  target_extension: string;
  changed_blocks: Array<{ index: number; data_base64: string }>;
}

export interface CreateDeltaParams {
  baseFile: string;
  targetFile: string;
  outputFile: string;
  mode: DeltaMode;
  targetExtension: string;
  chunkSize?: number;
}

export interface CreateDeltaResult {
  delta: DeltaArtifact;
  changedBlocks: number;
  changedBytes: number;
  patchSizeBytes: number;
  targetSizeBytes: number;
  usable: boolean;
  reason?: string;
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function bufferEquals(a: Buffer, aLen: number, b: Buffer, bLen: number) {
  if (aLen !== bLen) return false;
  return a.subarray(0, aLen).equals(b.subarray(0, bLen));
}

export async function createDeltaArtifact(params: CreateDeltaParams): Promise<CreateDeltaResult> {
  const chunkSize = params.chunkSize ?? 64 * 1024;
  const [baseStat, targetStat] = await Promise.all([fs.stat(params.baseFile), fs.stat(params.targetFile)]);

  const baseFd = await fs.open(params.baseFile, 'r');
  const targetFd = await fs.open(params.targetFile, 'r');

  const changedBlocks: Array<{ index: number; data_base64: string }> = [];
  let changedBytes = 0;

  try {
    const maxBlocks = Math.ceil(Math.max(baseStat.size, targetStat.size) / chunkSize);
    const baseBuf = Buffer.allocUnsafe(chunkSize);
    const targetBuf = Buffer.allocUnsafe(chunkSize);

    for (let index = 0; index < maxBlocks; index += 1) {
      const offset = index * chunkSize;
      const [baseRead, targetRead] = await Promise.all([
        baseFd.read(baseBuf, 0, chunkSize, offset),
        targetFd.read(targetBuf, 0, chunkSize, offset),
      ]);

      if (bufferEquals(baseBuf, baseRead.bytesRead, targetBuf, targetRead.bytesRead)) {
        continue;
      }

      changedBytes += targetRead.bytesRead;
      changedBlocks.push({
        index,
        data_base64: targetBuf.subarray(0, targetRead.bytesRead).toString('base64'),
      });
    }
  } finally {
    await Promise.all([baseFd.close(), targetFd.close()]);
  }

  const [baseChecksum, targetChecksum] = await Promise.all([
    sha256File(params.baseFile),
    sha256File(params.targetFile),
  ]);

  const delta: DeltaArtifact = {
    format: 'dataguardian-delta-v1',
    mode: params.mode,
    chunk_size: chunkSize,
    base_size: baseStat.size,
    target_size: targetStat.size,
    base_checksum_sha256: baseChecksum,
    target_checksum_sha256: targetChecksum,
    target_extension: params.targetExtension,
    changed_blocks: changedBlocks,
  };

  await fs.writeFile(params.outputFile, JSON.stringify(delta), 'utf8');
  const patchStat = await fs.stat(params.outputFile);

  if (patchStat.size >= targetStat.size) {
    return {
      delta,
      changedBlocks: changedBlocks.length,
      changedBytes,
      patchSizeBytes: patchStat.size,
      targetSizeBytes: targetStat.size,
      usable: false,
      reason: 'Patch ficou maior ou igual ao dump completo',
    };
  }

  return {
    delta,
    changedBlocks: changedBlocks.length,
    changedBytes,
    patchSizeBytes: patchStat.size,
    targetSizeBytes: targetStat.size,
    usable: true,
  };
}

export async function readDeltaArtifact(deltaFile: string): Promise<DeltaArtifact> {
  const raw = await fs.readFile(deltaFile, 'utf8');
  const parsed = JSON.parse(raw) as Partial<DeltaArtifact>;

  if (parsed.format !== 'dataguardian-delta-v1') {
    throw new Error('Formato de delta invalido');
  }

  if (!Array.isArray(parsed.changed_blocks)) {
    throw new Error('Delta invalido: changed_blocks ausente');
  }

  return {
    format: 'dataguardian-delta-v1',
    mode: parsed.mode === 'differential' ? 'differential' : 'incremental',
    chunk_size: Number(parsed.chunk_size ?? 65536),
    base_size: Number(parsed.base_size ?? 0),
    target_size: Number(parsed.target_size ?? 0),
    base_checksum_sha256: String(parsed.base_checksum_sha256 ?? ''),
    target_checksum_sha256: String(parsed.target_checksum_sha256 ?? ''),
    target_extension: String(parsed.target_extension ?? ''),
    changed_blocks: parsed.changed_blocks.map((entry) => ({
      index: Number(entry.index),
      data_base64: String(entry.data_base64 ?? ''),
    })),
  };
}

export async function applyDeltaArtifact(params: {
  baseFile: string;
  deltaFile: string;
  outputFile: string;
}) {
  const delta = await readDeltaArtifact(params.deltaFile);

  await fs.mkdir(path.dirname(params.outputFile), { recursive: true });
  await pipeline(createReadStream(params.baseFile), createWriteStream(params.outputFile));

  const fd = await fs.open(params.outputFile, 'r+');
  try {
    for (const block of delta.changed_blocks) {
      const data = Buffer.from(block.data_base64, 'base64');
      const offset = block.index * delta.chunk_size;
      if (data.length === 0) continue;
      await fd.write(data, 0, data.length, offset);
    }
    await fd.truncate(delta.target_size);
  } finally {
    await fd.close();
  }

  const checksum = await sha256File(params.outputFile);
  if (delta.target_checksum_sha256 && checksum !== delta.target_checksum_sha256) {
    throw new Error('Falha ao validar checksum do delta aplicado');
  }

  return {
    targetExtension: delta.target_extension,
    checksum,
  };
}
