import { useState } from 'react';
import { LogoIcon, SunIcon, MoonIcon, AlertIcon } from '../../components/Icons';
import styles from './SetupPage.module.css';

interface Props {
  onSetup: (payload: { username: string; password: string }) => Promise<void>;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function SetupPage({ onSetup, theme, onToggleTheme }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!username.trim() || !password || !confirmPassword) {
      setError('Preencha todos os campos.');
      return;
    }

    if (password.length < 8) {
      setError('A senha deve ter no minimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('A confirmacao de senha nao confere.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onSetup({ username: username.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuario inicial');
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
          <h1 className={styles.brandName}>Configurar primeiro usuario</h1>
          <span className={styles.brandSub}>Instancia sem usuario cadastrado</span>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="setup-username">Usuario</label>
            <input
              id="setup-username"
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
            <label className={styles.label} htmlFor="setup-password">Senha</label>
            <input
              id="setup-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="setup-password-confirm">Confirmar senha</label>
            <input
              id="setup-password-confirm"
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
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
            {loading ? 'Criando...' : 'Criar usuario e entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
