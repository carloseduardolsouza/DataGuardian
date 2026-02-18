import { parseExpression } from 'cron-parser';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { validateCron } from './cron-parser';

// ──────────────────────────────────────────
// Cálculo da próxima execução
// ──────────────────────────────────────────

/**
 * Calcula a próxima data/hora de execução de um cron job,
 * respeitando o timezone configurado.
 *
 * @param expression - Expressão cron de 5 campos (ex: "0 3 * * *")
 * @param timezone   - Timezone IANA (ex: "America/Sao_Paulo")
 * @returns Data UTC da próxima execução
 */
export function calculateNextExecution(expression: string, timezone: string): Date {
  validateCron(expression);

  // Interpreta o cron no timezone alvo
  const iterator = parseExpression(expression, {
    currentDate: new Date(),
    tz: timezone,
  });

  return iterator.next().toDate();
}

/**
 * Verifica se um job está atrasado (passou do next_execution_at).
 */
export function isJobDue(nextExecutionAt: Date | null): boolean {
  if (!nextExecutionAt) return false;
  return new Date() >= nextExecutionAt;
}

/**
 * Formata a próxima execução em um objeto com UTC e timezone local.
 */
export function formatNextExecution(date: Date, timezone: string) {
  const zonedDate = toZonedTime(date, timezone);
  return {
    utc:   date.toISOString(),
    local: zonedDate.toISOString(),
    timezone,
  };
}
