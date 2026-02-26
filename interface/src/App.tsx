import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage/LoginPage';
import SetupPage from './pages/SetupPage/SetupPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import { ROUTE_PATHS, type NavKey } from './ui/navigation/Sidebar/Sidebar';
import { ToastProvider } from './ui/feedback/Toast/ToastProvider';
import { notify } from './ui/feedback/Toast/notify';
import { authApi, notificationsApi, type ApiAuthUser } from './services/api';
import { PERMISSIONS } from './constants/permissions';

type Theme = 'dark' | 'light';

const APP_PAGES: NavKey[] = [
  'dashboard',
  'datasources',
  'storage',
  'backup-jobs',
  'sync',
  'backups',
  'executions',
  'health',
  'notifications',
  'audit',
  'approvals',
  'access',
  'settings',
];

const PAGE_PERMISSIONS: Record<NavKey, string> = {
  dashboard: PERMISSIONS.DASHBOARD_READ,
  datasources: PERMISSIONS.DATASOURCES_READ,
  storage: PERMISSIONS.STORAGE_READ,
  'backup-jobs': PERMISSIONS.BACKUP_JOBS_READ,
  sync: PERMISSIONS.DB_SYNC_JOBS_READ,
  backups: PERMISSIONS.BACKUPS_READ,
  executions: PERMISSIONS.EXECUTIONS_READ,
  health: PERMISSIONS.HEALTH_READ,
  notifications: PERMISSIONS.NOTIFICATIONS_READ,
  audit: PERMISSIONS.AUDIT_READ,
  approvals: PERMISSIONS.ACCESS_MANAGE,
  access: PERMISSIONS.ACCESS_MANAGE,
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

  const isRoleAdmin = currentUser?.roles?.includes('admin') ?? false;
  const allowedPages = APP_PAGES.filter((page) => {
    if (page === 'approvals') {
      return isRoleAdmin;
    }
    const permission = PAGE_PERMISSIONS[page];
    return currentUser?.permissions?.includes(permission) ?? false;
  });
  const defaultPage = allowedPages[0] ?? null;

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
              {defaultPage ? (
                <>
                  <Route path="/" element={<Navigate to={ROUTE_PATHS[defaultPage]} replace />} />
                  <Route path="/login" element={<Navigate to={ROUTE_PATHS[defaultPage]} replace />} />
                  <Route path="/setup" element={<Navigate to={ROUTE_PATHS[defaultPage]} replace />} />
                </>
              ) : (
                <>
                  <Route path="/" element={<NoPermissionPage theme={theme} onLogout={handleLogout} />} />
                  <Route path="/login" element={<NoPermissionPage theme={theme} onLogout={handleLogout} />} />
                  <Route path="/setup" element={<NoPermissionPage theme={theme} onLogout={handleLogout} />} />
                </>
              )}
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
              {defaultPage
                ? <Route path="*" element={<Navigate to={ROUTE_PATHS[defaultPage]} replace />} />
                : <Route path="*" element={<NoPermissionPage theme={theme} onLogout={handleLogout} />} />}
            </>
          )}
        </Routes>
      </ToastProvider>
    </div>
  );
}

function NoPermissionPage({ theme, onLogout }: { theme: Theme; onLogout: () => void }) {
  return (
    <div
      data-theme={theme}
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text-muted)',
        padding: 'var(--space-6)',
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          maxWidth: 560,
          width: '100%',
          display: 'grid',
          gap: 'var(--space-3)',
          textAlign: 'center',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--color-text)', fontSize: 'var(--font-size-lg)' }}>Sem permissoes de acesso</h2>
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
          Seu usuario esta autenticado, mas nao possui permissoes para nenhuma pagina.
        </p>
        <button
          onClick={() => void onLogout()}
          style={{
            justifySelf: 'center',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            color: 'var(--color-text)',
            padding: '10px var(--space-4)',
            cursor: 'pointer',
          }}
        >
          Sair
        </button>
      </div>
    </div>
  );
}


