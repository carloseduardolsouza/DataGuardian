import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage/LoginPage';
import SetupPage from './pages/SetupPage/SetupPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import { ROUTE_PATHS, type NavKey } from './components/Sidebar/Sidebar';
import { ToastProvider } from './components/Toast/ToastProvider';
import { authApi } from './services/api';

type Theme = 'dark' | 'light';

const APP_PAGES: NavKey[] = [
  'dashboard',
  'datasources',
  'storage',
  'backup-jobs',
  'executions',
  'health',
  'notifications',
  'settings',
];

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('dg-theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // noop
  }
  return 'dark';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [hasUser, setHasUser] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const status = await authApi.status();
        setHasUser(status.has_user);
        setIsAuthenticated(status.authenticated);
        setCurrentUsername(status.user?.username ?? null);
      } catch {
        setHasUser(false);
        setIsAuthenticated(false);
        setCurrentUsername(null);
      } finally {
        setLoadingAuth(false);
      }
    };

    void bootstrapAuth();
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsAuthenticated(false);
      setCurrentUsername(null);
    };
    window.addEventListener('dg:unauthorized', handler);
    return () => window.removeEventListener('dg:unauthorized', handler);
  }, []);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('dg-theme', next);
      } catch {
        // noop
      }
      return next;
    });
  };

  const handleLogin = async (payload: { username: string; password: string }) => {
    const response = await authApi.login(payload);
    setHasUser(true);
    setIsAuthenticated(true);
    setCurrentUsername(response.user.username);
  };

  const handleSetup = async (payload: { username: string; password: string }) => {
    const response = await authApi.setup(payload);
    setHasUser(true);
    setIsAuthenticated(true);
    setCurrentUsername(response.user.username);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      setIsAuthenticated(false);
      setCurrentUsername(null);
    }
  };

  if (loadingAuth) {
    return (
      <div data-theme={theme} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
        Verificando autenticacao...
      </div>
    );
  }

  return (
    <div data-theme={theme} style={{ minHeight: '100vh' }}>
      <ToastProvider>
        <Routes>
          {!hasUser && (
            <>
              <Route
                path="/setup"
                element={
                  <SetupPage
                    onSetup={handleSetup}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/setup" replace />} />
            </>
          )}

          {hasUser && !isAuthenticated && (
            <>
              <Route
                path="/login"
                element={
                  <LoginPage
                    onLogin={handleLogin}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          )}

          {hasUser && isAuthenticated && (
            <>
              <Route path="/" element={<Navigate to={ROUTE_PATHS.dashboard} replace />} />
              <Route path="/login" element={<Navigate to={ROUTE_PATHS.dashboard} replace />} />
              <Route path="/setup" element={<Navigate to={ROUTE_PATHS.dashboard} replace />} />
              {APP_PAGES.map((page) => (
                <Route
                  key={page}
                  path={ROUTE_PATHS[page]}
                  element={
                    <DashboardPage
                      activePage={page}
                      theme={theme}
                      onToggleTheme={toggleTheme}
                      onLogout={handleLogout}
                      currentUsername={currentUsername ?? undefined}
                    />
                  }
                />
              ))}
              <Route path="*" element={<Navigate to={ROUTE_PATHS.dashboard} replace />} />
            </>
          )}
        </Routes>
      </ToastProvider>
    </div>
  );
}
