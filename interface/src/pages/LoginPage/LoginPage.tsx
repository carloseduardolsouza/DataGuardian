import { useState } from 'react';
import { LogoIcon, SunIcon, MoonIcon, AlertIcon } from '../../ui/icons/Icons';
import styles from './LoginPage.module.css';

interface Props {
  onLogin: (payload: { username: string; password: string }) => Promise<void>;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function LoginPage({ onLogin, theme, onToggleTheme }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError('Preencha usuario e senha.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onLogin({ username: username.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao efetuar login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      <button
        className={styles.themeToggle}
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        aria-label="Alternar tema"
      >
        {theme === 'dark' ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
      </button>

      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logoWrap}>
            <LogoIcon width={32} height={32} />
          </div>
          <h1 className={styles.brandName}>DataGuardian</h1>
          <span className={styles.brandSub}>Acesso do administrador</span>
        </div>

        <p className={styles.formTitle}>Entrar</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">Usuario</label>
            <input
              id="username"
              className={styles.input}
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Senha</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
      </div>
    </div>
  );
}


