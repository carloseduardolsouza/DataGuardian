import { useEffect, useMemo, useState } from 'react';
import { notificationsApi } from '../../services/api';
import type { ApiNotification } from '../../services/api';
import { CheckIcon, TrashIcon, SpinnerIcon } from '../../components/Icons';
import styles from './NotificationsPage.module.css';

type ReadFilter = 'all' | 'read' | 'unread';
type SeverityFilter = 'all' | 'info' | 'warning' | 'critical';

interface Props {
  onUnreadCountChange?: (count: number) => void;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function severityLabel(severity: ApiNotification['severity']) {
  if (severity === 'critical') return 'Critico';
  if (severity === 'warning') return 'Aviso';
  return 'Info';
}

export default function NotificationsPage({ onUnreadCountChange }: Props) {
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const readParam = readFilter === 'all' ? undefined : readFilter === 'read' ? 'true' : 'false';
  const severityParam = severityFilter === 'all' ? undefined : severityFilter;

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const response = await notificationsApi.list({
        page,
        limit: 20,
        read: readParam,
        severity: severityParam,
      });

      setItems(response.data);
      setUnreadCount(response.unread_count ?? 0);
      setTotalPages(response.pagination.totalPages);
      setTotal(response.pagination.total);
      onUnreadCountChange?.(response.unread_count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar notificacoes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, readParam, severityParam]);

  async function markAsRead(id: string) {
    await notificationsApi.markAsRead(id);
    await load();
  }

  async function markAllAsRead() {
    await notificationsApi.markAllAsRead();
    await load();
  }

  async function remove(id: string) {
    await notificationsApi.remove(id);
    await load();
  }

  const emptyText = useMemo(() => {
    if (readFilter === 'unread') return 'Nenhuma notificacao nao lida encontrada';
    if (readFilter === 'read') return 'Nenhuma notificacao lida encontrada';
    return 'Nenhuma notificacao encontrada';
  }, [readFilter]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Notificacoes</h2>
          <p className={styles.sub}>{unreadCount} nao lidas</p>
        </div>

        <button className={styles.markAllBtn} onClick={() => void markAllAsRead()} disabled={unreadCount === 0}>
          <CheckIcon /> Marcar todas como lidas
        </button>
      </div>

      <div className={styles.filters}>
        <select value={readFilter} onChange={(event) => { setReadFilter(event.target.value as ReadFilter); setPage(1); }} className={styles.select}>
          <option value="all">Todas</option>
          <option value="unread">Nao lidas</option>
          <option value="read">Lidas</option>
        </select>

        <select value={severityFilter} onChange={(event) => { setSeverityFilter(event.target.value as SeverityFilter); setPage(1); }} className={styles.select}>
          <option value="all">Todas severidades</option>
          <option value="info">Info</option>
          <option value="warning">Aviso</option>
          <option value="critical">Critico</option>
        </select>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.listWrap}>
        {loading ? (
          <div className={styles.empty}><SpinnerIcon /> Carregando notificacoes...</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>{emptyText}</div>
        ) : (
          <div className={styles.list}>
            {items.map((notification) => (
              <article key={notification.id} className={`${styles.item} ${!notification.read_at ? styles.unread : ''}`}>
                <div className={styles.itemHeader}>
                  <span className={`${styles.severity} ${styles[`sev_${notification.severity}`]}`}>{severityLabel(notification.severity)}</span>
                  <span className={styles.date}>{formatDate(notification.created_at)}</span>
                </div>

                <h3 className={styles.itemTitle}>{notification.title}</h3>
                <p className={styles.itemMessage}>{notification.message}</p>

                <div className={styles.itemFooter}>
                  <span className={styles.meta}>{notification.type}</span>
                  <div className={styles.actions}>
                    {!notification.read_at && (
                      <button className={styles.actionBtn} onClick={() => void markAsRead(notification.id)}>
                        <CheckIcon /> Marcar lida
                      </button>
                    )}
                    <button className={styles.deleteBtn} onClick={() => void remove(notification.id)}>
                      <TrashIcon /> Excluir
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className={styles.pagination}>
        <span>{total} resultado(s)</span>
        <div className={styles.pageActions}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Anterior</button>
          <span>Pagina {page} de {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Proxima</button>
        </div>
      </div>
    </div>
  );
}
