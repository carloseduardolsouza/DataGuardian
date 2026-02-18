import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';

// ──────────────────────────────────────────
// Classe de erro da aplicação
// ──────────────────────────────────────────

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

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    field:   issue.path.join('.'),
    message: issue.message,
  }));
}

// ──────────────────────────────────────────
// Middleware de tratamento de erros (deve ser
// o último middleware registrado no Express)
// ──────────────────────────────────────────

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Erro da aplicação (explicitamente lançado)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error:   err.errorCode,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // Erro de validação Zod (lançado diretamente)
  if (err instanceof ZodError) {
    res.status(422).json({
      error:   'VALIDATION_ERROR',
      message: 'Dados inválidos na requisição',
      details: formatZodError(err),
    });
    return;
  }

  // Erros do Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error:   'CONFLICT',
        message: 'Registro duplicado — violação de constraint única',
        details: { target: err.meta?.target },
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        error:   'NOT_FOUND',
        message: 'Registro não encontrado',
      });
      return;
    }

    logger.error({ prismaCode: err.code, meta: err.meta }, 'Erro Prisma conhecido');
    res.status(500).json({
      error:   'DATABASE_ERROR',
      message: 'Erro ao acessar o banco de dados',
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(422).json({
      error:   'VALIDATION_ERROR',
      message: 'Dados inválidos para o banco de dados',
    });
    return;
  }

  // Erro genérico desconhecido
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error({ err: error }, 'Erro interno não tratado');

  res.status(500).json({
    error:   'INTERNAL_ERROR',
    message: 'Erro interno do servidor',
    ...(config.env === 'development' && {
      details: { message: error.message, stack: error.stack },
    }),
  });
}
