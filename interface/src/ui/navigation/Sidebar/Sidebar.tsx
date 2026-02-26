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
  PlugIcon,
  HealthIcon,
  BellIcon,
  LogIcon,
  SettingsIcon,
  UsersIcon,
  ApprovalIcon,
  LogoutIcon,
} from '../../icons/Icons';
import { PERMISSIONS } from '../../../constants/permissions';

export type NavKey =
  | 'dashboard'
  | 'datasources'
  | 'storage'
  | 'backup-jobs'
  | 'sync'
  | 'backups'
  | 'executions'
  | 'health'
  | 'notifications'
  | 'audit'
  | 'approvals'
  | 'access'
  | 'settings';

export const ROUTE_PATHS: Record<NavKey, string> = {
  dashboard: '/dashboard',
  datasources: '/datasources',
  storage: '/storage',
  'backup-jobs': '/backup-jobs',
  sync: '/sync',
  backups: '/backups',
  executions: '/executions',
  health: '/health-check',
  notifications: '/notifications',
  audit: '/audit',
  approvals: '/critical-approvals',
  access: '/access-control',
  settings: '/settings',
};

interface Props {
  active: NavKey;
  onLogout: () => void;
  unreadNotifications?: number;
  currentUser?: {
    username: string;
    roles: string[];
    permissions: string[];
  };
}

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ReactNode;
  permission: string;
}

const mainNav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <DashboardIcon />, permission: PERMISSIONS.DASHBOARD_READ },
  { key: 'datasources', label: 'Datasources', icon: <DatabaseIcon />, permission: PERMISSIONS.DATASOURCES_READ },
  { key: 'storage', label: 'Storage', icon: <ServerIcon />, permission: PERMISSIONS.STORAGE_READ },
  { key: 'backup-jobs', label: 'Backup Jobs', icon: <JobsIcon />, permission: PERMISSIONS.BACKUP_JOBS_READ },
  { key: 'sync', label: 'Sincronizacao', icon: <PlugIcon />, permission: PERMISSIONS.DB_SYNC_JOBS_READ },
  { key: 'backups', label: 'Backups', icon: <FolderIcon />, permission: PERMISSIONS.BACKUPS_READ },
  { key: 'executions', label: 'Execucoes', icon: <PlayIcon />, permission: PERMISSIONS.EXECUTIONS_READ },
];

const systemNav: NavItem[] = [
  { key: 'health', label: 'Health', icon: <HealthIcon />, permission: PERMISSIONS.HEALTH_READ },
  { key: 'notifications', label: 'Notificacoes', icon: <BellIcon />, permission: PERMISSIONS.NOTIFICATIONS_READ },
  { key: 'audit', label: 'Auditoria', icon: <LogIcon />, permission: PERMISSIONS.AUDIT_READ },
  { key: 'approvals', label: 'Requisicoes Criticas', icon: <ApprovalIcon />, permission: PERMISSIONS.ACCESS_MANAGE },
  { key: 'access', label: 'Usuarios e Roles', icon: <UsersIcon />, permission: PERMISSIONS.ACCESS_MANAGE },
  { key: 'settings', label: 'Configuracoes', icon: <SettingsIcon />, permission: PERMISSIONS.SYSTEM_READ },
];

const SIDEBAR_MIN_WIDTH = 210;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_STORAGE_KEY = 'dg-sidebar-width';
const SIDEBAR_COLLAPSED_KEY = 'dg-sidebar-collapsed';

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

function readCollapsedState() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Sidebar({ active, onLogout, unreadNotifications = 0, currentUser }: Props) {
  const [width, setWidth] = useState<number>(readStoredSidebarWidth);
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsedState);
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const userPanelRef = useRef<HTMLDivElement | null>(null);
  const currentUsername = currentUser?.username || 'Usuario';
  const currentRole = currentUser?.roles?.[0] || 'sem role';
  const permissions = new Set(currentUser?.permissions ?? []);
  const isRoleAdmin = currentUser?.roles?.includes('admin') ?? false;
  const visibleMainNav = mainNav.filter((item) => permissions.has(item.permission));
  const visibleSystemNav = systemNav.filter((item) => {
    if (item.key === 'approvals') return isRoleAdmin;
    return permissions.has(item.permission);
  });

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      `${collapsed ? SIDEBAR_COLLAPSED_WIDTH : width}px`,
    );
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // noop
    }
  }, [collapsed, width]);

  useEffect(() => {
    if (!userPanelOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!userPanelRef.current) return;
      const target = event.target as Node | null;
      if (target && userPanelRef.current.contains(target)) return;
      setUserPanelOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserPanelOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [userPanelOpen]);

  useEffect(() => {
    setUserPanelOpen(false);
  }, [collapsed]);

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

  const avatar = currentUsername.trim().charAt(0).toUpperCase() || 'U';
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;
  const roleNames = currentUser?.roles?.length ? currentUser.roles.join(', ') : 'Sem roles';
  const permissionsList = currentUser?.permissions ?? [];
  const permissionPreview = permissionsList.slice(0, 4);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`} style={{ width: sidebarWidth }}>
      <div className={styles.header}>
        <div className={styles.logoWrap}>
          <LogoIcon />
        </div>
        {!collapsed && <span className={styles.brandName}>DataGuardian</span>}
        <button
          className={styles.collapseBtn}
          type="button"
          title={collapsed ? 'Expandir menu' : 'Mostrar apenas icones'}
          aria-label={collapsed ? 'Expandir menu' : 'Mostrar apenas icones'}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? '>' : '<'}
        </button>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navGroup}>
          {!collapsed && <p className={styles.navGroupLabel}>Principal</p>}
          {visibleMainNav.map((item) => (
            <Link
              key={item.key}
              to={ROUTE_PATHS[item.key]}
              className={`${styles.navItem}${active === item.key ? ` ${styles.active}` : ''}`}
              title={collapsed ? item.label : undefined}
              onClick={() => setUserPanelOpen(false)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          ))}
        </div>

        <div className={styles.navGroup}>
          {!collapsed && <p className={styles.navGroupLabel}>Sistema</p>}
          {visibleSystemNav.map((item) => (
            <Link
              key={item.key}
              to={ROUTE_PATHS[item.key]}
              className={`${styles.navItem}${active === item.key ? ` ${styles.active}` : ''}`}
              title={collapsed ? item.label : undefined}
              onClick={() => setUserPanelOpen(false)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {!collapsed && item.label}
              {item.key === 'notifications' && unreadNotifications > 0 && (
                <span className={styles.navBadge}>{unreadNotifications}</span>
              )}
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.footer}>
        <div className={styles.userMenu} ref={userPanelRef}>
          <button
            type="button"
            className={`${styles.userRow} ${userPanelOpen ? styles.userRowOpen : ''}`}
            aria-expanded={userPanelOpen}
            aria-label="Abrir detalhes do usuario"
            onClick={() => setUserPanelOpen((prev) => !prev)}
          >
            <div className={styles.avatar}>{avatar}</div>
            {!collapsed && (
              <div className={styles.userInfo}>
                <p className={styles.userName}>{currentUsername}</p>
                <p className={styles.userRole}>{currentRole}</p>
              </div>
            )}
            <span className={`${styles.userChevron} ${userPanelOpen ? styles.userChevronOpen : ''}`}>v</span>
          </button>

          {userPanelOpen && (
            <div className={`${styles.userPanel} ${collapsed ? styles.userPanelCollapsed : ''}`}>
              <div className={styles.userPanelHeader}>Conta</div>
              <div className={styles.userPanelRow}>
                <span className={styles.userPanelLabel}>Usuario</span>
                <span className={styles.userPanelValue}>{currentUsername}</span>
              </div>
              <div className={styles.userPanelRow}>
                <span className={styles.userPanelLabel}>Roles</span>
                <span className={styles.userPanelValue}>{roleNames}</span>
              </div>
              <div className={styles.userPanelRow}>
                <span className={styles.userPanelLabel}>Permissoes</span>
                <span className={styles.userPanelValue}>{permissionsList.length}</span>
              </div>
              {permissionPreview.length > 0 && (
                <div className={styles.userPanelPermissions}>
                  {permissionPreview.map((permission) => (
                    <span key={permission} className={styles.permissionChip}>{permission}</span>
                  ))}
                  {permissionsList.length > permissionPreview.length && (
                    <span className={styles.permissionChip}>+{permissionsList.length - permissionPreview.length}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          className={styles.logoutBtn}
          onClick={() => {
            setUserPanelOpen(false);
            onLogout();
          }}
          title={collapsed ? 'Sair' : undefined}
        >
          <LogoutIcon />
          {!collapsed && 'Sair'}
        </button>
      </div>

      {!collapsed && (
        <div
          className={styles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar menu lateral"
          onPointerDown={startResize}
          onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH)}
        />
      )}
    </aside>
  );
}
