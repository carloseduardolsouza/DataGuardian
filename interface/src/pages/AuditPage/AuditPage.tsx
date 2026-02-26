import { Fragment, useEffect, useMemo, useState } from 'react';
import { SpinnerIcon, SearchIcon, LogIcon, TrashIcon } from '../../ui/icons/Icons';
import { auditApi, type ApiAuditLog } from '../../services/api';
import { useCriticalAction } from '../../hooks/useCriticalAction';
import Modal from '../../ui/overlay/Modal/Modal';
import styles from './AuditPage.module.css';

interface AuditFilters {
  action: string;
  actor: string;
  resourceType: string;
  from: string;
  to: string;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelative(value: string) {
  const ts = new Date(value).getTime();
  const diff = Date.now() - ts;
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m atras`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atras`;
  const days = Math.floor(hr / 24);
  return `${days}d atras`;
}

function stringifySafe(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toLocalDatetimeValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function defaultCleanupToValue() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  cutoff.setSeconds(0, 0);
  return toLocalDatetimeValue(cutoff);
}

export default function AuditPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const criticalAction = useCriticalAction({ isAdmin });
  const [items, setItems] = useState<ApiAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [cleanupFrom, setCleanupFrom] = useState('');
  const [cleanupTo, setCleanupTo] = useState(defaultCleanupToValue);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const resourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.resource_type) set.add(item.resource_type);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const load = async (targetPage = page, overrides?: Partial<AuditFilters>) => {
    const nextFilters: AuditFilters = {
      action,
      actor,
      resourceType,
      from,
      to,
      ...overrides,
    };

    try {
      setLoading(true);
      setError(null);
      const response = await auditApi.list({
        page: targetPage,
        limit: 20,
        action: nextFilters.action.trim() || undefined,
        actor: nextFilters.actor.trim() || undefined,
        resource_type: nextFilters.resourceType || undefined,
        from: nextFilters.from ? new Date(nextFilters.from).toISOString() : undefined,
        to: nextFilters.to ? new Date(nextFilters.to).toISOString() : undefined,
      });

      setItems(response.data);
      setTotal(response.pagination.total);
      setTotalPages(Math.max(1, response.pagination.totalPages));
      if (response.data.length === 0) {
        setExpandedId(null);
      } else if (!expandedId || !response.data.some((item) => item.id === expandedId)) {
        setExpandedId(response.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  const applyFilters = () => {
    const targetPage = 1;
    setPage(targetPage);
    if (page !== targetPage) return;
    void load(targetPage);
  };

  const clearFilters = () => {
    setAction('');
    setActor('');
    setResourceType('');
    setFrom('');
    setTo('');
    const targetPage = 1;
    setPage(targetPage);
    const emptyFilters: AuditFilters = {
      action: '',
      actor: '',
      resourceType: '',
      from: '',
      to: '',
    };
    if (page !== targetPage) return;
    void load(targetPage, emptyFilters);
  };

  const openCleanupModal = () => {
    setCleanupFrom('');
    setCleanupTo(defaultCleanupToValue());
    setCleanupError(null);
    setIsCleanupModalOpen(true);
  };

  const closeCleanupModal = () => {
    if (cleaning) return;
    setCleanupError(null);
    setIsCleanupModalOpen(false);
  };

  const handleCleanup = async () => {
    if (!cleanupFrom && !cleanupTo) {
      setCleanupError('Informe ao menos uma data em De ou Ate para limpar o historico.');
      return;
    }

    try {
      setCleaning(true);
      setCleanupError(null);
      setError(null);
      setSuccess(null);

      let deletedCount = 0;
      const done = await criticalAction.run({
        action: 'audit_logs.cleanup',
        actionLabel: 'Limpar historico de auditoria',
        resourceType: 'audit_logs',
        resourceId: 'cleanup',
        payload: {
          from: cleanupFrom ? new Date(cleanupFrom).toISOString() : null,
          to: cleanupTo ? new Date(cleanupTo).toISOString() : null,
        },
        onApprovalModalClose: () => setIsCleanupModalOpen(false),
        execute: async (auth) => {
          const response = await auditApi.cleanByPeriod({
            from: cleanupFrom ? new Date(cleanupFrom).toISOString() : undefined,
            to: cleanupTo ? new Date(cleanupTo).toISOString() : undefined,
          }, auth);
          deletedCount = response.deleted_count;
        },
      });
      if (!done) return;

      const targetPage = 1;
      setPage(targetPage);
      setSuccess(`${deletedCount} registro(s) removido(s) da auditoria.`);
      setIsCleanupModalOpen(false);
      await load(targetPage);
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : 'Falha ao limpar historico de auditoria');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.filtersCard}>
        <div className={styles.filtersHead}>
          <div>
            <h2 className={styles.title}>Trilha de Auditoria</h2>
            <p className={styles.sub}>Registro de acoes, autor, IP e alteracoes de configuracao</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.dangerBtn} onClick={openCleanupModal} disabled={loading}>
              <TrashIcon /> Limpar historico
            </button>
            <button className={styles.refreshBtn} onClick={() => void load()} disabled={loading}>
              <LogIcon /> Atualizar
            </button>
          </div>
        </div>

        <div className={styles.filters}>
          <label className={styles.field}>
            <span>Acao</span>
            <div className={styles.inputWrap}>
              <SearchIcon />
              <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Ex: system.settings.update" />
            </div>
          </label>

          <label className={styles.field}>
            <span>Usuario</span>
            <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="username" />
          </label>

          <label className={styles.field}>
            <span>Recurso</span>
            <select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
              <option value="">Todos</option>
              {resourceOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>De</span>
            <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>

          <label className={styles.field}>
            <span>Ate</span>
            <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>

          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={applyFilters} disabled={loading}>Filtrar</button>
            <button className={styles.secondaryBtn} onClick={clearFilters} disabled={loading}>Limpar</button>
          </div>
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <section className={styles.tableCard}>
        {loading ? (
          <div className={styles.empty}><SpinnerIcon /> Carregando auditoria...</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>Nenhum registro encontrado</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Usuario</th>
                  <th>Acao</th>
                  <th>Recurso</th>
                  <th>IP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const expanded = expandedId === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td>
                          <div className={styles.whenCell}>
                            <span>{formatDate(item.created_at)}</span>
                            <small>{formatRelative(item.created_at)}</small>
                          </div>
                        </td>
                        <td>{item.actor_username || item.actor_full_name || 'sistema'}</td>
                        <td>
                          <span className={styles.actionTag}>{item.action}</span>
                        </td>
                        <td>{item.resource_type || '-'}{item.resource_id ? ` / ${item.resource_id}` : ''}</td>
                        <td className={styles.ip}>{item.ip || '-'}</td>
                        <td>
                          <button className={styles.rowBtn} onClick={() => setExpandedId(expanded ? null : item.id)}>
                            {expanded ? 'Ocultar' : 'Detalhes'}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={6}>
                            <div className={styles.details}>
                              <div className={styles.detailBlock}>
                                <h4>Changes</h4>
                                <pre>{stringifySafe(item.changes)}</pre>
                              </div>
                              <div className={styles.detailBlock}>
                                <h4>Metadata</h4>
                                <pre>{stringifySafe(item.metadata)}</pre>
                              </div>
                              <div className={styles.detailMeta}>
                                <span><strong>User agent:</strong> {item.user_agent || '-'}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={styles.pagination}>
        <span>{total} resultado(s)</span>
        <div className={styles.pageActions}>
          <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={loading || page <= 1}>Anterior</button>
          <span>Pagina {page} de {totalPages}</span>
          <button onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={loading || page >= totalPages}>Proxima</button>
        </div>
      </div>

      {isCleanupModalOpen && (
        <Modal
          title="Limpar historico de auditoria"
          subtitle="Defina um periodo para remover logs. Padrao: apagar tudo ate 3 meses atras."
          onClose={closeCleanupModal}
          size="md"
          footer={(
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={closeCleanupModal} disabled={cleaning}>Cancelar</button>
              <button className={styles.dangerBtn} onClick={() => void handleCleanup()} disabled={cleaning}>
                {cleaning ? 'Limpando...' : 'Limpar historico'}
              </button>
            </div>
          )}
        >
          <div className={styles.modalBody}>
            <p className={styles.modalHint}>
              Dica: para manter os ultimos 3 meses, deixe <strong>De</strong> vazio e use <strong>Ate</strong> com a data sugerida.
            </p>
            <div className={styles.modalFields}>
              <label className={styles.field}>
                <span>De (opcional)</span>
                <input type="datetime-local" value={cleanupFrom} onChange={(event) => setCleanupFrom(event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Ate (opcional)</span>
                <input type="datetime-local" value={cleanupTo} onChange={(event) => setCleanupTo(event.target.value)} />
              </label>
            </div>
            {cleanupError && <div className={styles.error}>{cleanupError}</div>}
          </div>
        </Modal>
      )}
      {criticalAction.modal}
    </div>
  );
}
