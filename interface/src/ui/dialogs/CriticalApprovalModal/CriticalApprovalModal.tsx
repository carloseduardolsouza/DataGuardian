import { useEffect, useMemo, useState } from 'react';
import {
  ApiRequestError,
  criticalApprovalsApi,
  type CriticalApprovalAction,
  type CriticalAuthHeaders,
  type ApiCriticalApprovalRequest,
} from '../../../services/api';
import Modal from '../../overlay/Modal/Modal';
import styles from './CriticalApprovalModal.module.css';

interface Props {
  open: boolean;
  action: CriticalApprovalAction;
  actionLabel: string;
  resourceType?: string | null;
  resourceId?: string | null;
  payload?: Record<string, unknown>;
  onClose: () => void;
  onExecute: (auth: CriticalAuthHeaders) => Promise<void>;
}

function sameNullable(a?: string | null, b?: string | null) {
  return (a ?? null) === (b ?? null);
}

export default function CriticalApprovalModal({
  open,
  action,
  actionLabel,
  resourceType,
  resourceId,
  payload,
  onClose,
  onExecute,
}: Props) {
  const [adminPassword, setAdminPassword] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [approvalId, setApprovalId] = useState('');
  const [approvedOptions, setApprovedOptions] = useState<ApiCriticalApprovalRequest[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAdminPassword('');
    setRequestReason('');
    setApprovalId('');
    setError(null);
    setSuccess(null);

    const loadApprovals = async () => {
      try {
        setLoadingApprovals(true);
        const response = await criticalApprovalsApi.listMine({
          status: 'approved',
          action,
          limit: 100,
        });
        setApprovedOptions(
          response.data.filter((item) =>
            sameNullable(item.resource_type, resourceType) && sameNullable(item.resource_id, resourceId),
          ),
        );
      } catch {
        setApprovedOptions([]);
      } finally {
        setLoadingApprovals(false);
      }
    };

    void loadApprovals();
  }, [open, action, resourceType, resourceId]);

  const selectedApproval = useMemo(
    () => approvedOptions.find((item) => item.id === approvalId) ?? null,
    [approvedOptions, approvalId],
  );

  if (!open) return null;

  const handleExecuteWithPassword = async () => {
    if (!adminPassword.trim()) {
      setError('Informe a senha administrativa.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await onExecute({ admin_password: adminPassword.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao executar operacao critica');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteWithApproval = async () => {
    if (!approvalId) {
      setError('Selecione uma aprovacao existente.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await onExecute({ approval_request_id: approvalId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao executar com aprovacao');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestPermission = async () => {
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      await criticalApprovalsApi.createRequest({
        action,
        action_label: actionLabel,
        resource_type: resourceType ?? undefined,
        resource_id: resourceId ?? undefined,
        request_reason: requestReason.trim() || undefined,
        payload,
      });
      setSuccess('Solicitacao enviada para aprovacao de um administrador.');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao solicitar aprovacao');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Aprovacao obrigatoria"
      subtitle={`A operacao '${actionLabel}' exige autorizacao.`}
      onClose={onClose}
      size="md"
      footer={(
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>Fechar</button>
        </div>
      )}
    >
      <div className={styles.body}>
        <div className={styles.metaBox}>
          <p><strong>Acao:</strong> {actionLabel}</p>
          <p><strong>Recurso:</strong> {resourceType ?? '-'} / {resourceId ?? '-'}</p>
        </div>

        <div className={styles.block}>
          <h4>Executar agora com senha admin</h4>
          <input
            className={styles.input}
            type="password"
            placeholder="Senha administrativa"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
          <button className={styles.primaryBtn} onClick={() => void handleExecuteWithPassword()} disabled={submitting}>
            Executar com senha
          </button>
        </div>

        <div className={styles.block}>
          <h4>Usar aprovacao ja concedida</h4>
          <select
            className={styles.select}
            value={approvalId}
            onChange={(e) => setApprovalId(e.target.value)}
            disabled={loadingApprovals || approvedOptions.length === 0}
          >
            <option value="">
              {loadingApprovals
                ? 'Carregando aprovacoes...'
                : approvedOptions.length === 0
                  ? 'Nenhuma aprovacao disponivel para esta acao'
                  : 'Selecione uma aprovacao'}
            </option>
            {approvedOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id.slice(0, 8)}... (expira: {item.expires_at ? new Date(item.expires_at).toLocaleString('pt-BR') : 'sem prazo'})
              </option>
            ))}
          </select>
          <button
            className={styles.secondaryBtn}
            onClick={() => void handleExecuteWithApproval()}
            disabled={submitting || !approvalId || !selectedApproval}
          >
            Executar com aprovacao
          </button>
        </div>

        <div className={styles.block}>
          <h4>Pedir permissao para admin</h4>
          {payload && (
            <div className={styles.payloadWrap}>
              <span>Resumo da operacao</span>
              <pre className={styles.payloadPreview}>{JSON.stringify(payload, null, 2)}</pre>
            </div>
          )}
          <textarea
            className={styles.textarea}
            placeholder="Motivo da solicitacao (opcional)"
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            rows={3}
          />
          <button className={styles.warningBtn} onClick={() => void handleRequestPermission()} disabled={submitting}>
            Pedir permissao
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}
      </div>
    </Modal>
  );
}
