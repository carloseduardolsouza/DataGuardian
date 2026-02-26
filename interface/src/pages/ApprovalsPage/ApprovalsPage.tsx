import { useEffect, useState } from 'react';
import { criticalApprovalsApi, type ApiCriticalApprovalRequest, type CriticalApprovalStatus } from '../../services/api';
import Modal from '../../ui/overlay/Modal/Modal';
import styles from './ApprovalsPage.module.css';

type DecisionMode = 'approve' | 'reject';

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApiCriticalApprovalRequest[]>([]);
  const [status, setStatus] = useState<CriticalApprovalStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [decisionTarget, setDecisionTarget] = useState<ApiCriticalApprovalRequest | null>(null);
  const [decisionMode, setDecisionMode] = useState<DecisionMode>('approve');
  const [decisionReason, setDecisionReason] = useState('');
  const [expiresMinutes, setExpiresMinutes] = useState(30);
  const [deciding, setDeciding] = useState(false);

  const counts = {
    all: items.length,
    pending: items.filter((item) => item.status === 'pending').length,
    approved: items.filter((item) => item.status === 'approved').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
    canceled: items.filter((item) => item.status === 'canceled').length,
  };

  function statusLabel(value: CriticalApprovalStatus) {
    if (value === 'pending') return 'Pendente';
    if (value === 'approved') return 'Aprovada';
    if (value === 'rejected') return 'Reprovada';
    return 'Cancelada';
  }

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await criticalApprovalsApi.list({
        limit: 100,
        status: status === 'all' ? undefined : status,
      });
      setItems(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar requisicoes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const openDecision = (item: ApiCriticalApprovalRequest, mode: DecisionMode) => {
    setDecisionTarget(item);
    setDecisionMode(mode);
    setDecisionReason('');
    setExpiresMinutes(30);
  };

  const closeDecision = () => {
    if (deciding) return;
    setDecisionTarget(null);
    setDecisionReason('');
  };

  const submitDecision = async () => {
    if (!decisionTarget) return;
    try {
      setDeciding(true);
      setError(null);
      setSuccess(null);
      if (decisionMode === 'approve') {
        await criticalApprovalsApi.approve(decisionTarget.id, {
          decision_reason: decisionReason.trim() || undefined,
          expires_minutes: expiresMinutes,
        });
        setSuccess('Solicitacao aprovada com sucesso.');
      } else {
        await criticalApprovalsApi.reject(decisionTarget.id, {
          decision_reason: decisionReason.trim() || undefined,
        });
        setSuccess('Solicitacao reprovada.');
      }
      setDecisionTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao processar decisao');
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>Requisicoes Criticas</h2>
          <p className={styles.sub}>Aprove ou reprove cada operacao critica de forma individual, por execucao especifica.</p>
        </div>
        <div className={styles.actions}>
          <div className={styles.filterField}>
            <span className={styles.filterLabel}>Status</span>
            <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value as CriticalApprovalStatus | 'all')}>
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="approved">Aprovados</option>
              <option value="rejected">Reprovados</option>
              <option value="canceled">Cancelados</option>
            </select>
          </div>
          <button className={styles.refreshBtn} onClick={() => void load()} disabled={loading}>Atualizar</button>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Total</span>
          <strong className={styles.summaryValue}>{counts.all}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Pendentes</span>
          <strong className={styles.summaryValue}>{counts.pending}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Aprovadas</span>
          <strong className={styles.summaryValue}>{counts.approved}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Reprovadas</span>
          <strong className={styles.summaryValue}>{counts.rejected}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Canceladas</span>
          <strong className={styles.summaryValue}>{counts.canceled}</strong>
        </article>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <section className={styles.card}>
        {loading ? (
          <div className={styles.state}>Carregando requisicoes...</div>
        ) : items.length === 0 ? (
          <div className={styles.state}>Nenhuma requisicao encontrada.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Solicitante</th>
                  <th>Acao</th>
                  <th>Recurso</th>
                  <th>Status</th>
                  <th>Decisao</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className={styles.whenCell}>
                        <span className={styles.whenText}>{new Date(item.created_at).toLocaleString('pt-BR')}</span>
                        <span className={styles.metaText}>ID: {item.id.slice(0, 8)}...</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.requesterCell}>
                        <span className={styles.requesterValue}>{item.requester_user?.username ?? item.requester_user_id}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.actionCell}>
                        <strong className={styles.actionTitle}>{item.action_label ?? item.action}</strong>
                        <span className={styles.metaText}>{item.action}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.resourceCell}>
                        <span className={styles.resourceValue}>{item.resource_type ?? '-'}</span>
                        <span className={styles.metaText}>{item.resource_id ?? '-'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{statusLabel(item.status)}</span>
                    </td>
                    <td>
                      {item.decided_by_user ? (
                        <div className={styles.decisionCell}>
                          <span className={styles.decisionValue}>{item.decided_by_user.username}</span>
                          <span className={styles.metaText}>
                            {item.decided_at ? new Date(item.decided_at).toLocaleString('pt-BR') : '-'}
                          </span>
                        </div>
                      ) : (
                        <span className={styles.muted}>-</span>
                      )}
                    </td>
                    <td>
                      {item.status === 'pending' ? (
                        <div className={styles.rowActions}>
                          <button className={styles.approveBtn} onClick={() => openDecision(item, 'approve')}>Aprovar</button>
                          <button className={styles.rejectBtn} onClick={() => openDecision(item, 'reject')}>Reprovar</button>
                        </div>
                      ) : (
                        <span className={styles.muted}>Concluida</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {decisionTarget && (
        <Modal
          title={decisionMode === 'approve' ? 'Aprovar solicitacao' : 'Reprovar solicitacao'}
          subtitle={decisionTarget.action_label ?? decisionTarget.action}
          onClose={closeDecision}
          size="md"
          footer={(
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={closeDecision} disabled={deciding}>Cancelar</button>
              <button className={decisionMode === 'approve' ? styles.approveBtn : styles.rejectBtn} onClick={() => void submitDecision()} disabled={deciding}>
                {deciding ? 'Processando...' : decisionMode === 'approve' ? 'Confirmar aprovacao' : 'Confirmar reprovacao'}
              </button>
            </div>
          )}
        >
          <div className={styles.modalBody}>
            <div className={styles.modalInfo}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Recurso:</span>
                <span className={styles.infoValue}>{decisionTarget.resource_type ?? '-'} / {decisionTarget.resource_id ?? '-'}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Solicitante:</span>
                <span className={styles.infoValue}>{decisionTarget.requester_user?.username ?? decisionTarget.requester_user_id}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Motivo da solicitacao:</span>
                <span className={styles.infoValue}>{decisionTarget.request_reason || '-'}</span>
              </div>
            </div>
            {decisionMode === 'approve' && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Expiracao da aprovacao (minutos)</span>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={1440}
                  value={expiresMinutes}
                  onChange={(e) => setExpiresMinutes(Math.max(1, Math.min(1440, Number(e.target.value) || 30)))}
                />
              </label>
            )}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Justificativa (opcional)</span>
              <textarea
                className={styles.textarea}
                rows={3}
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
              />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
