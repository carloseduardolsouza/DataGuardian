import { PrismaClient } from '@prisma/client';
import { config } from '../utils/config';

// Singleton do PrismaClient — evita múltiplas conexões em hot-reload
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.env === 'development'
      ? ['warn', 'error']
      : ['warn', 'error'],
  });

if (config.env !== 'production') {
  globalForPrisma.prisma = prisma;
}
