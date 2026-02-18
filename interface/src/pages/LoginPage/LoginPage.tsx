import { useState } from 'react';
import styles from './LoginPage.module.css';

interface Props {
  onLogin: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function LoginPage({ onLogin, theme, onToggleTheme }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Preencha o usuário e a senha.');
      return;
    }

    setLoading(true);
    setError('');

    // Simulação de autenticação — substituir por chamada real à API
    await new Promise((r) => setTimeout(r, 900));

    setLoading(false);
    onLogin();
  };

  return (
    <div className={styles.root}>
      {/* Toggle de tema */}
      <button
        className={styles.themeToggle}
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        aria-label="Alternar tema"
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>

      <div className={styles.card}>
        {/* Marca */}
        <div className={styles.brand}>
          <div className={styles.logoWrap}>
            <LogoIcon />
          </div>
          <h1 className={styles.brandName}>DataGuardian</h1>
          <span className={styles.brandSub}>Backup Manager</span>
        </div>

        <p className={styles.formTitle}>Acesse sua conta</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">
              Usuário
            </label>
            <input
              id="username"
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && (
            <p className={styles.error}>
              <AlertIcon />
              {error}
            </p>
          )}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading && <span className={styles.spinner} />}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className={styles.footer}>DataGuardian v1.0.0 — Self-hosted</p>
      </div>
    </div>
  );
}

/* ── Ícones inline ─────────────────────────────────────────── */

function LogoIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 4C10.48 4 6 6.69 6 10v3c0 3.31 4.48 6 10 6s10-2.69 10-6v-3c0-3.31-4.48-6-10-6z"
        fill="var(--color-primary)"
      />
      <path
        d="M6 16v3c0 3.31 4.48 6 10 6s10-2.69 10-6v-3c-2.1 1.66-5.8 2.75-10 2.75S8.1 17.66 6 16z"
        fill="var(--color-primary)"
        opacity="0.6"
      />
      <path
        d="M6 22v3c0 3.31 4.48 6 10 6s10-2.69 10-6v-3c-2.1 1.66-5.8 2.75-10 2.75S8.1 23.66 6 22z"
        fill="var(--color-primary)"
        opacity="0.3"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
