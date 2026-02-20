import { useEffect, useRef, useState } from 'react';
import styles from './Sidebar.module.css';
import { Link } from 'react-router-dom';
import {
  LogoIcon,
  DashboardIcon,
  DatabaseIcon,
  ServerIcon,
  JobsIcon,
  FolderIcon,
  PlayIcon,
  HealthIcon,
  BellIcon,
  SettingsIcon,
  LogoutIcon,
} from '../Icons';

export type NavKey =
  | 'dashboard'
  | 'datasources'
  | 'storage'
  | 'backup-jobs'
  | 'backups'
  | 'executions'
  | 'health'
  | 'notifications'
  | 'settings';

export const ROUTE_PATHS: Record<NavKey, string> = {
  dashboard: '/dashboard',
  datasources: '/datasources',
  storage: '/storage',
  'backup-jobs': '/backup-jobs',
  backups: '/backups',
  executions: '/executions',
  health: '/health',
  notifications: '/notifications',
  settings: '/settings',
};

interface Props {
  active: NavKey;
  onLogout: () => void;
  unreadNotifications?: number;
  currentUsername?: string;
}

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ReactNode;
}

const mainNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { key: 'datasources', label: 'Datasources', icon: <DatabaseIcon /> },
  { key: 'storage', label: 'Storage', icon: <ServerIcon /> },
  { key: 'backup-jobs', label: 'Backup Jobs', icon: <JobsIcon /> },
  { key: 'backups', label: 'Backups', icon: <FolderIcon /> },
  { key: 'executions', label: 'Execucoes', icon: <PlayIcon /> },
];

const systemNav: NavItem[] = [
  { key: 'health', label: 'Health', icon: <HealthIcon /> },
  { key: 'notifications', label: 'Notificacoes', icon: <BellIcon /> },
  { key: 'settings', label: 'Configuracoes', icon: <SettingsIcon /> },
];

const SIDEBAR_MIN_WIDTH = 210;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_STORAGE_KEY = 'dg-sidebar-width';

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
}

function readStoredSidebarWidth() {
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return clampSidebarWidth(parsed);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

export default function Sidebar({ active, onLogout, unreadNotifications = 0, currentUsername = 'Admin' }: Props) {
  const [width, setWidth] = useState<number>(readStoredSidebarWidth);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
    } catch {
      // noop
    }
  }, [width]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - dragState.startX;
      setWidth(clampSidebarWidth(dragState.startWidth + deltaX));
    };

    const onPointerUp = (event: PointerEvent) => {
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const avatar = currentUsername.trim().charAt(0).toUpperCase() || 'A';
  return (
    <aside className={styles.sidebar} style={{ width }}>
      <div className={styles.header}>
        <div className={styles.logoWrap}>
          <LogoIcon />
        </div>
        <span className={styles.brandName}>DataGuardian</span>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navGroup}>
          <p className={styles.navGroupLabel}>Principal</p>
          {mainNav.map((item) => (
            <Link
              key={item.key}
              to={ROUTE_PATHS[item.key]}
              className={`${styles.navItem}${active === item.key ? ` ${styles.active}` : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>

        <div className={styles.navGroup}>
          <p className={styles.navGroupLabel}>Sistema</p>
          {systemNav.map((item) => (
            <Link
              key={item.key}
              to={ROUTE_PATHS[item.key]}
              className={`${styles.navItem}${active === item.key ? ` ${styles.active}` : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
              {item.key === 'notifications' && unreadNotifications > 0 && (
                <span className={styles.navBadge}>{unreadNotifications}</span>
              )}
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.footer}>
        <div className={styles.userRow}>
          <div className={styles.avatar}>{avatar}</div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{currentUsername}</p>
            <p className={styles.userRole}>Usuario unico</p>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={onLogout}>
          <LogoutIcon />
          Sair
        </button>
      </div>

      <div
        className={styles.resizeHandle}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar menu lateral"
        onPointerDown={startResize}
        onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH)}
      />
    </aside>
  );
}
