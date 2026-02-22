import styles from './StatusBadge.module.css';

interface Props {
  status: string;
  label?: string;
  size?: 'sm' | 'md';
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  // Executions
  completed: { label: 'Concluído', cls: 'success' },
  failed:    { label: 'Erro',      cls: 'danger' },
  running:   { label: 'Executando', cls: 'running' },
  cancelled: { label: 'Cancelado', cls: 'neutral' },
  queued:    { label: 'Na fila',   cls: 'neutral' },
  // Dashboard / general
  success:   { label: 'Sucesso',   cls: 'success' },
  warning:   { label: 'Aviso',     cls: 'warning' },
  error:     { label: 'Erro',      cls: 'danger' },
  // Jobs
  never:     { label: 'Nunca',     cls: 'neutral' },
};

export default function StatusBadge({ status, label, size = 'md' }: Props) {
  const mapped = STATUS_MAP[status] ?? { label: status, cls: 'neutral' };
  const cls = mapped.cls;
  const showDot = status === 'running';

  return (
    <span className={`${styles.badge} ${styles[cls]} ${size === 'sm' ? styles.sm : ''}`}>
      {showDot && <span className={styles.dot} />}
      {label ?? mapped.label}
    </span>
  );
}
