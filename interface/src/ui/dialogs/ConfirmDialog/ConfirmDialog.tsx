import Modal from '../../overlay/Modal/Modal';
import styles from './ConfirmDialog.module.css';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <Modal
      title={title}
      subtitle="Esta acao nao pode ser desfeita."
      onClose={onClose}
      size="sm"
      footer={(
        <>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button className={styles.confirmBtn} onClick={onConfirm} disabled={loading}>
            {loading ? 'Processando...' : confirmLabel}
          </button>
        </>
      )}
    >
      <p className={styles.message}>{message}</p>
    </Modal>
  );
}
