import { parseExpression } from 'cron-parser';
import { AppError } from '../../api/middlewares/error-handler';

// ──────────────────────────────────────────
// Validação de expressões cron
// ──────────────────────────────────────────

/**
 * Valida uma expressão cron de 5 campos (padrão Unix/cron-parser).
 * Lança AppError se a expressão for inválida.
 */
export function validateCron(expression: string, context = 'schedule_cron'): void {
  try {
    parseExpression(expression);
  } catch {
    throw new AppError(
      'INVALID_CRON',
      422,
      `Expressão cron inválida: '${expression}'`,
      {
        field:   context,
        message: `A expressão '${expression}' não é válida. Use o formato: minuto hora dia-do-mês mês dia-da-semana. Exemplo: '0 3 * * *'`,
        examples: {
          'todo dia às 3h':     '0 3 * * *',
          'a cada 6 horas':     '0 */6 * * *',
          'toda segunda 0h':    '0 0 * * 1',
          'dia 1 do mês às 2h': '0 2 1 * *',
        },
      },
    );
  }
}

/**
 * Retorna a expressão cron de volta se for válida, ou lança erro.
 */
export function parseCron(expression: string): string {
  validateCron(expression);
  return expression;
}
