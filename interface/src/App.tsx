import { useState } from 'react';
import LoginPage from './pages/LoginPage/LoginPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';

type Page  = 'login' | 'dashboard';
type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('dg-theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* sem acesso ao localStorage */
  }
  return 'dark'; // dark mode como padrão
}

export default function App() {
  const [page,  setPage]  = useState<Page>('login');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('dg-theme', next); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <div data-theme={theme} style={{ minHeight: '100vh' }}>
      {page === 'login' ? (
        <LoginPage
          onLogin={() => setPage('dashboard')}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <DashboardPage
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={() => setPage('login')}
        />
      )}
    </div>
  );
}
