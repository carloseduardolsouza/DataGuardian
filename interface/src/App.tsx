import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage/LoginPage';
import SetupPage from './pages/SetupPage/SetupPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import { ROUTE_PATHS, type NavKey } from './components/Sidebar/Sidebar';
import { ToastProvider } from './components/Toast/ToastProvider';
import { notify } from './components/Toast/notify';
import { authApi, notificationsApi, type ApiAuthUser } from './services/api';
import { PERMISSIONS } from './constants/permissions';

type Theme = 'dark' | 'light';

const APP_PAGES: NavKey[] = [
  'dashboard',
  'datasources',
  'storage',
  'backup-jobs',
  'backups',
  'executions',
  'health',
  'notifications',
  'audit',
  'settings',
];

const PAGE_PERMISSIONS: Record<NavKey, string> = {
  dashboard: PERMISSIONS.DASHBOARD_READ,
  datasources: PERMISSIONS.DATASOURCES_READ,
  storage: PERMISSIONS.STORAGE_READ,
  'backup-jobs': PERMISSIONS.BACKUP_JOBS_READ,
  backups: PERMISSIONS.BACKUPS_READ,
  executions: PERMISSIONS.EXECUTIONS_READ,
  health: PERMISSIONS.HEALTH_READ,
  notifications: PERMISSIONS.NOTIFICATIONS_READ,
  audit: PERMISSIONS.AUDIT_READ,
  settings: PERMISSIONS.SYSTEM_READ,
};

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
  const [currentUser, setCurrentUser] = useState<ApiAuthUser | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const status = await authApi.status();
        setHasUser(status.has_user);
        setIsAuthenticated(status.authenticated);
        setCurrentUser(status.user);
      } catch {
        setHasUser(false);
        setIsAuthenticated(false);
        setCurrentUser(null);
      } finally {
        setLoadingAuth(false);
      }
    };

    void bootstrapAuth();
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setUnreadNotifications(0);
    };
    window.addEventListener('dg:unauthorized', handler);
    return () => window.removeEventListener('dg:unauthorized', handler);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    let stopped = false;
    let bootstrapped = false;
    const seenIds = new Set<string>();

    const pollNotifications = async () => {
      try {
        const response = await notificationsApi.list({ page: 1, limit: 20 });
        if (stopped) return;

        setUnreadNotifications(response.unread_count ?? 0);

        const items = response.data ?? [];
        if (!bootstrapped) {
          for (const item of items) seenIds.add(item.id);
          bootstrapped = true;
          return;
        }

        for (const item of [...items].reverse()) {
          if (seenIds.has(item.id)) continue;
          seenIds.add(item.id);
          notify({
            title: item.title || 'Nova notificacao',
            message: item.message,
            tone: item.severity === 'critical' ? 'error' : item.severity === 'warning' ? 'warning' : 'info',
            durationMs: item.severity === 'critical' ? 9000 : 6000,
          });
        }

        if (seenIds.size > 500) {
          const keep = new Set(items.map((item) => item.id));
          for (const id of [...seenIds]) {
            if (!keep.has(id)) seenIds.delete(id);
          }
        }
      } catch {
        // ignore transient notification polling errors
      }
    };

    void pollNotifications();
    const timer = window.setInterval(() => {
      void pollNotifications();
    }, 10000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

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
    setCurrentUser(response.user);
  };

  const handleSetup = async (payload: { username: string; password: string }) => {
    const response = await authApi.setup(payload);
    setHasUser(true);
    setIsAuthenticated(true);
    setCurrentUser(response.user);
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
    }
  };

  const allowedPages = APP_PAGES.filter((page) => {
    const permission = PAGE_PERMISSIONS[page];
    return currentUser?.permissions?.includes(permission) ?? false;
  });
  const defaultPage = allowedPages[0] ?? 'dashboard';

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
              <Route path="/" element={<Navigate to={ROUTE_PATHS[defaultPage]} replace />} />
              <Route path="/login" element={<Navigate to={ROUTE_PATHS[defaultPage]} replace />} />
              <Route path="/setup" element={<Navigate to={ROUTE_PATHS[defaultPage]} replace />} />
              {allowedPages.map((page) => (
                <Route
                  key={page}
                  path={ROUTE_PATHS[page]}
                  element={
                    <DashboardPage
                      activePage={page}
                      theme={theme}
                      onToggleTheme={toggleTheme}
                      onLogout={handleLogout}
                      currentUser={currentUser ?? undefined}
                      permissions={currentUser?.permissions ?? []}
                      unreadNotifications={unreadNotifications}
                    />
                  }
                />
              ))}
              <Route path="*" element={<Navigate to={ROUTE_PATHS[defaultPage]} replace />} />
            </>
          )}
        </Routes>
      </ToastProvider>
    </div>
  );
}
