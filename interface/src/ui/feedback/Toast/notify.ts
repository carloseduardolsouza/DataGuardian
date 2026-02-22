export type NotifyTone = 'error' | 'success' | 'warning' | 'info';

export interface NotifyPayload {
  title?: string;
  message: string;
  tone?: NotifyTone;
  durationMs?: number;
}

export const NOTIFY_EVENT = 'dg:notify';

export function notify(payload: NotifyPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NotifyPayload>(NOTIFY_EVENT, { detail: payload }));
}

export function notifyError(message: string, title = 'Erro') {
  notify({ title, message, tone: 'error', durationMs: 7000 });
}

