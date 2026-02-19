import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';

export class AppError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

function mapSqlRuntimeError(err: unknown) {
  const errorLike = err as { code?: string; message?: string; detail?: string };
  const code = errorLike?.code;
  if (!code) return null;

  const queryValidationCodes = new Set([
    '42P01',
    '42601',
    '42703',
    '42883',
    '42000',
    'ER_NO_SUCH_TABLE',
    'ER_BAD_FIELD_ERROR',
    'ER_PARSE_ERROR',
    'ER_BAD_DB_ERROR',
  ]);

  if (!queryValidationCodes.has(code)) return null;

  return {
    status: 422,
    body: {
      error: 'QUERY_EXECUTION_FAILED',
      message: errorLike.message ?? 'Query invalida',
      details: { driver_code: code, detail: errorLike.detail ?? null },
    },
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.errorCode,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: 'Dados invalidos na requisicao',
      details: formatZodError(err),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: 'CONFLICT',
        message: 'Registro duplicado - violacao de constraint unica',
        details: { target: err.meta?.target },
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Registro nao encontrado',
      });
      return;
    }

    logger.error({ prismaCode: err.code, meta: err.meta }, 'Erro Prisma conhecido');
    res.status(500).json({
      error: 'DATABASE_ERROR',
      message: 'Erro ao acessar o banco de dados',
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: 'Dados invalidos para o banco de dados',
    });
    return;
  }

  const mappedSqlError = mapSqlRuntimeError(err);
  if (mappedSqlError) {
    res.status(mappedSqlError.status).json(mappedSqlError.body);
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  logger.error({ err: error }, 'Erro interno nao tratado');

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Erro interno do servidor',
    ...(config.env === 'development' && {
      details: { message: error.message, stack: error.stack },
    }),
  });
}
