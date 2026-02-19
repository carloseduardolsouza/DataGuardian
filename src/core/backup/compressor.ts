import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

export type CompressionType = 'none' | 'gzip';

export async function compressBackupFile(inputFile: string, compression: CompressionType) {
  if (compression === 'none') {
    const stat = await fs.stat(inputFile);
    return {
      outputFile: inputFile,
      compressedSizeBytes: stat.size,
      compressionExtension: '',
    };
  }

  const outputFile = `${inputFile}.gz`;
  await pipeline(createReadStream(inputFile), createGzip({ level: 6 }), createWriteStream(outputFile));
  const stat = await fs.stat(outputFile);

  return {
    outputFile,
    compressedSizeBytes: stat.size,
    compressionExtension: '.gz',
  };
}
