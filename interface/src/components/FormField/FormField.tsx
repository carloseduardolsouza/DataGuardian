import styles from './FormField.module.css';

interface Props {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

export default function FormField({ label, hint, children }: Props) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

export { styles as formStyles };
