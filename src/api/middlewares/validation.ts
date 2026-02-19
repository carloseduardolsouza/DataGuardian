import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from './error-handler';

type RequestPart = 'body' | 'params' | 'query';

/**
 * Retorna um middleware Express que valida a parte da request
 * especificada com o schema Zod fornecido.
 *
 * Em caso de falha, lança AppError(VALIDATION_ERROR, 422).
 */
export function validate(
  schema: ZodSchema,
  part: RequestPart = 'body',
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const details = (result.error as ZodError).issues.map((issue) => ({
        field:   issue.path.join('.'),
        message: issue.message,
      }));

      return next(
        new AppError(
          'VALIDATION_ERROR',
          422,
          'Dados inválidos na requisição',
          details,
        ),
      );
    }

    // Substitui req[part] pelos dados parseados e transformados pelo Zod
    (req as unknown as Record<string, unknown>)[part] = result.data;
    next();
  };
}
