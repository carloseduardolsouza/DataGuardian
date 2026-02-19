import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styles from './ToastProvider.module.css';
import { NOTIFY_EVENT, type NotifyPayload, type NotifyTone } from './notify';

interface ToastItem {
  id: string;
  title: string;
  message: string;
  tone: NotifyTone;
  durationMs: number;
}

const NotifyContext = createContext<(payload: NotifyPayload) => void>(() => undefined);

function toneClass(tone: NotifyTone) {
  if (tone === 'error') return styles.error;
  if (tone === 'success') return styles.success;
  if (tone === 'warning') return styles.warning;
  return styles.info;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((payload: NotifyPayload) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tone = payload.tone ?? 'info';
    const durationMs = payload.durationMs ?? (tone === 'error' ? 7000 : 4500);
    const title =
      payload.title
      ?? (tone === 'error' ? 'Erro' : tone === 'success' ? 'Sucesso' : tone === 'warning' ? 'Atenção' : 'Informação');

    const item: ToastItem = {
      id,
      title,
      message: payload.message,
      tone,
      durationMs,
    };
    setItems((current) => [...current, item].slice(-5));
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<NotifyPayload>;
      if (!customEvent.detail?.message) return;
      push(customEvent.detail);
    };

    window.addEventListener(NOTIFY_EVENT, handler as EventListener);
    return () => window.removeEventListener(NOTIFY_EVENT, handler as EventListener);
  }, [push]);

  useEffect(() => {
    const timers = items.map((item) => window.setTimeout(() => remove(item.id), item.durationMs));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [items, remove]);

  const value = useMemo(() => push, [push]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div className={styles.viewport} aria-live="polite" aria-atomic="true">
        {items.map((item) => (
          <div key={item.id} className={`${styles.toast} ${toneClass(item.tone)}`}>
            <span className={styles.dot} />
            <div className={styles.content}>
              <strong className={styles.title}>{item.title}</strong>
              <span className={styles.message}>{item.message}</span>
            </div>
            <button className={styles.close} onClick={() => remove(item.id)} aria-label="Fechar notificação">
              ×
            </button>
          </div>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  return useContext(NotifyContext);
}

