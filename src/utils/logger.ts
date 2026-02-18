import pino from 'pino';
import { config } from './config';

// ──────────────────────────────────────────
// Logger principal (Pino)
// ──────────────────────────────────────────

export const logger = pino({
  level: config.logLevel,
  ...(config.env === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize:        true,
            translateTime:   'HH:MM:ss',
            ignore:          'pid,hostname',
            messageFormat:   '{msg}',
          },
        },
      }
    : {
        // Produção: JSON estruturado
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

export default logger;
