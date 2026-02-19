import { useState } from 'react';
import { LogoIcon, SunIcon, MoonIcon, AlertIcon } from '../../components/Icons';
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
        {theme === 'dark' ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
      </button>

      <div className={styles.card}>
        {/* Marca */}
        <div className={styles.brand}>
          <div className={styles.logoWrap}>
            <LogoIcon width={32} height={32} />
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
              <AlertIcon width={14} height={14} />
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
