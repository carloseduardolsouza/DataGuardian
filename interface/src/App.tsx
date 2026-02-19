import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage/LoginPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import { ROUTE_PATHS, type NavKey } from './components/Sidebar/Sidebar';
import { ToastProvider } from './components/Toast/ToastProvider';

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
    /* sem acesso ao localStorage */
  }
  return 'dark';
}

function getInitialAuth(): boolean {
  try {
    return localStorage.getItem('dg-authenticated') === 'true';
  } catch {
    return false;
  }
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [isAuthenticated, setIsAuthenticated] = useState(getInitialAuth);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('dg-theme', next);
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
    try {
      localStorage.setItem('dg-authenticated', 'true');
    } catch {
      /* noop */
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('dg-authenticated');
    } catch {
      /* noop */
    }
  };

  return (
    <div data-theme={theme} style={{ minHeight: '100vh' }}>
      <ToastProvider>
        <Routes>
          <Route
            path="/"
            element={
              <Navigate
                to={isAuthenticated ? ROUTE_PATHS.dashboard : '/login'}
                replace
              />
            }
          />
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to={ROUTE_PATHS.dashboard} replace />
              ) : (
                <LoginPage
                  onLogin={handleLogin}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                />
              )
            }
          />
          {APP_PAGES.map((page) => (
            <Route
              key={page}
              path={ROUTE_PATHS[page]}
              element={
                isAuthenticated ? (
                  <DashboardPage
                    activePage={page}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    onLogout={handleLogout}
                  />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
          ))}
          <Route
            path="*"
            element={
              <Navigate
                to={isAuthenticated ? ROUTE_PATHS.dashboard : '/login'}
                replace
              />
            }
          />
        </Routes>
      </ToastProvider>
    </div>
  );
}
