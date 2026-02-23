import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compressBackupFile, decompressBackupFile } from '../../../../src/core/backup/compressor';

describe('backup compressor', () => {
  it('keeps original file for none compression', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-compressor-none-'));
    const file = path.join(tempDir, 'dump.sql');
    await fs.writeFile(file, 'hello backup', 'utf8');

    const result = await compressBackupFile(file, 'none');
    expect(result.outputFile).toBe(file);
    expect(result.compressionExtension).toBe('');
    expect(result.compressedSizeBytes).toBeGreaterThan(0);
  });

  it('compresses and decompresses gzip payload', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-compressor-gzip-'));
    const file = path.join(tempDir, 'dump.sql');
    await fs.writeFile(file, 'hello backup '.repeat(200), 'utf8');

    const compressed = await compressBackupFile(file, 'gzip', 6);
    expect(compressed.outputFile.endsWith('.gz')).toBe(true);
    expect(compressed.compressionExtension).toBe('.gz');

    const decompressedFile = await decompressBackupFile(compressed.outputFile);
    const payload = await fs.readFile(decompressedFile, 'utf8');
    expect(payload).toBe('hello backup '.repeat(200));
  });

  it('returns same file when extension is not compressed', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-compressor-pass-'));
    const file = path.join(tempDir, 'dump.raw');
    await fs.writeFile(file, 'raw', 'utf8');

    const result = await decompressBackupFile(file);
    expect(result).toBe(file);
  });
});
