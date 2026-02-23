import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiBackupJob, ApiDatasource, ApiStorageLocation } from '../../services/api';
import {
  CheckIcon,  InfoIcon,
  DbIcon,
  StorageIcon,
  ClockIcon,
  RetentionIcon,
} from '../../ui/icons/Icons';
import Modal from '../../ui/overlay/Modal/Modal';
import { DS_ABBR, SL_ABBR } from '../../constants';
import styles from './JobFormModal.module.css';

export type BackupType = 'full' | 'incremental' | 'differential';
type Frequency = 'daily' | 'weekly' | 'monthly';

interface JobPayload {
  name: string;
  datasource_id: string;
  storage_location_id: string;
  schedule_cron: string;
  schedule_timezone: string;
  enabled: boolean;
  retention_policy: {
    max_backups: number;
    auto_delete: boolean;
  };
  backup_options: {
    backup_type?: 'full' | 'incremental' | 'differential';
    compression: 'gzip' | 'zstd' | 'lz4' | 'none';
    compression_level?: number;
    parallel_jobs?: number;
    exclude_tables?: string[];
    include_tables?: string[];
    max_file_size_mb?: number;
    storage_strategy?: 'replicate' | 'fallback';
    storage_targets?: Array<{
      storage_location_id: string;
      order: number;
    }>;
    referenced_files?: {
      enabled: boolean;
      discovery_query?: string;
      path_column?: string;
      base_directories?: string[];
      missing_file_policy?: 'warn' | 'fail';
      max_files?: number;
      source_type?: 'local' | 'ssh';
      source?: {
        host?: string;
        port?: number;
        username?: string;
        password?: string;
        private_key?: string;
      };
    };
  };
}

interface Props {
  job: ApiBackupJob | null;
  datasources: ApiDatasource[];
  storages: ApiStorageLocation[];
  saving: boolean;
  onClose: () => void;
  onSave: (payload: JobPayload, id?: string) => Promise<void>;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

const BACKUP_TYPES: { value: BackupType; label: string; desc: string }[] = [
  { value: 'full', label: 'Completo', desc: 'Copia todos os dados a cada execução' },
  { value: 'incremental', label: 'Incremental', desc: 'Apenas o que mudou desde o último backup' },
  { value: 'differential', label: 'Diferencial', desc: 'Mudanças desde o último backup completo' },
];

function parseCron(cron: string) {
  const [minRaw = '0', hourRaw = '2', domRaw = '*', _monthRaw = '*', dowRaw = '*'] = cron.split(' ');
  const minute = Number(minRaw) || 0;
  const hour = Number(hourRaw) || 2;

  if (domRaw !== '*' && dowRaw === '*') {
    return {
      frequency: 'monthly' as Frequency,
      hour,
      minute,
      daysOfWeek: [1],
      dayOfMonth: Number(domRaw) || 1,
    };
  }

  if (dowRaw !== '*' && domRaw === '*') {
    const days = dowRaw.split(',').map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
    return {
      frequency: 'weekly' as Frequency,
      hour,
      minute,
      daysOfWeek: days.length > 0 ? days : [1],
      dayOfMonth: 1,
    };
  }

  return {
    frequency: 'daily' as Frequency,
    hour,
    minute,
    daysOfWeek: [1],
    dayOfMonth: 1,
  };
}

function buildCron(frequency: Frequency, hour: number, minute: number, daysOfWeek: number[], dayOfMonth: number) {
  if (frequency === 'monthly') {
    return `${minute} ${hour} ${dayOfMonth} * *`;
  }
  if (frequency === 'weekly') {
    const dow = [...new Set(daysOfWeek)].sort((a, b) => a - b).join(',') || '1';
    return `${minute} ${hour} * * ${dow}`;
  }
  return `${minute} ${hour} * * *`;
}

export default function JobFormModal({
  job,
  datasources,
  storages,
  saving,
  onClose,
  onSave,
}: Props) {
  const parsed = parseCron(job?.schedule_cron ?? '0 2 * * *');
  const initialTargets = (
    job?.storage_targets
    ?? job?.backup_options?.storage_targets
    ?? (job?.storage_location_id ? [{ storage_location_id: job.storage_location_id, order: 1 }] : [])
  )
    .map((t) => ({
      storage_location_id: t.storage_location_id,
      order: Number(t.order) || 1,
    }))
    .sort((a, b) => a.order - b.order);

  const [name, setName] = useState(job?.name ?? '');
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [datasourceId, setDatasourceId] = useState(job?.datasource_id ?? '');
  const [storageTargets, setStorageTargets] = useState(initialTargets);
  const [storageToAddId, setStorageToAddId] = useState('');
  const [storageStrategy, setStorageStrategy] = useState<'replicate' | 'fallback'>(
    job?.storage_strategy ?? job?.backup_options?.storage_strategy ?? 'fallback',
  );
  const [backupType, setBackupType] = useState<BackupType>(
    (job?.backup_options?.backup_type as BackupType | undefined) ?? 'full',
  );

  const [frequency, setFrequency] = useState<Frequency>(parsed.frequency);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(parsed.daysOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(parsed.dayOfMonth);

  const initialMaxBackups = Number(
    job?.retention_policy?.max_backups
      ?? (
        Number(job?.retention_policy?.keep_daily ?? 7)
        + Number(job?.retention_policy?.keep_weekly ?? 4)
        + Number(job?.retention_policy?.keep_monthly ?? 12)
      ),
  );
  const [maxBackups, setMaxBackups] = useState(Number.isFinite(initialMaxBackups) ? Math.max(1, initialMaxBackups) : 23);
  const [autoDelete, setAutoDelete] = useState(Boolean(job?.retention_policy?.auto_delete ?? true));

  const [compression, setCompression] = useState<'gzip' | 'zstd' | 'lz4' | 'none'>(
    job?.backup_options?.compression ?? 'gzip',
  );
  const referencedFilesConfig = job?.backup_options?.referenced_files;
  const [includeReferencedFiles, setIncludeReferencedFiles] = useState(
    Boolean(referencedFilesConfig?.enabled),
  );
  const [referencedFilesQuery, setReferencedFilesQuery] = useState(
    referencedFilesConfig?.discovery_query ?? '',
  );
  const [referencedFilesPathColumn, setReferencedFilesPathColumn] = useState(
    referencedFilesConfig?.path_column ?? '',
  );
  const [referencedFilesBaseDirs, setReferencedFilesBaseDirs] = useState(
    (referencedFilesConfig?.base_directories ?? []).join('\n'),
  );
  const [referencedFilesMissingPolicy, setReferencedFilesMissingPolicy] = useState<'warn' | 'fail'>(
    referencedFilesConfig?.missing_file_policy ?? 'warn',
  );
  const [referencedFilesMax, setReferencedFilesMax] = useState(
    Number.isFinite(Number(referencedFilesConfig?.max_files))
      ? Math.max(1, Number(referencedFilesConfig?.max_files))
      : 2000,
  );
  const [referencedFilesSourceType, setReferencedFilesSourceType] = useState<'local' | 'ssh'>(
    referencedFilesConfig?.source_type ?? 'local',
  );
  const [referencedFilesSshHost, setReferencedFilesSshHost] = useState(
    referencedFilesConfig?.source?.host ?? '',
  );
  const [referencedFilesSshPort, setReferencedFilesSshPort] = useState(
    Number.isFinite(Number(referencedFilesConfig?.source?.port))
      ? Math.max(1, Number(referencedFilesConfig?.source?.port))
      : 22,
  );
  const [referencedFilesSshUser, setReferencedFilesSshUser] = useState(
    referencedFilesConfig?.source?.username ?? '',
  );
  const [referencedFilesSshPassword, setReferencedFilesSshPassword] = useState(
    referencedFilesConfig?.source?.password ?? '',
  );
  const [referencedFilesSshPrivateKey, setReferencedFilesSshPrivateKey] = useState(
    referencedFilesConfig?.source?.private_key ?? '',
  );

  const isValid = useMemo(() => {
    if (!name.trim()) return false;
    if (!datasourceId) return false;
    if (storageTargets.length === 0) return false;
    if (frequency === 'weekly' && daysOfWeek.length === 0) return false;
    if (frequency === 'monthly' && (dayOfMonth < 1 || dayOfMonth > 28)) return false;
    if (!Number.isFinite(maxBackups) || maxBackups < 1) return false;
    if (includeReferencedFiles) {
      if (!referencedFilesQuery.trim()) return false;
      const baseDirs = referencedFilesBaseDirs
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (baseDirs.length === 0) return false;
      if (!Number.isFinite(referencedFilesMax) || referencedFilesMax < 1) return false;
      if (referencedFilesSourceType === 'ssh') {
        if (!referencedFilesSshHost.trim()) return false;
        if (!referencedFilesSshUser.trim()) return false;
        if (!referencedFilesSshPassword.trim() && !referencedFilesSshPrivateKey.trim()) return false;
      }
    }
    return true;
  }, [
    name,
    datasourceId,
    storageTargets.length,
    frequency,
    daysOfWeek,
    dayOfMonth,
    maxBackups,
    includeReferencedFiles,
    referencedFilesQuery,
    referencedFilesBaseDirs,
    referencedFilesMax,
    referencedFilesSourceType,
    referencedFilesSshHost,
    referencedFilesSshUser,
    referencedFilesSshPassword,
    referencedFilesSshPrivateKey,
  ]);

  function addStorageTarget() {
    if (!storageToAddId) return;
    if (storageTargets.some((t) => t.storage_location_id === storageToAddId)) return;
    setStorageTargets((prev) => [
      ...prev,
      { storage_location_id: storageToAddId, order: prev.length + 1 },
    ]);
    setStorageToAddId('');
  }

  function moveTarget(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= storageTargets.length) return;
    const next = [...storageTargets];
    const [moved] = next.splice(index, 1);
    next.splice(newIndex, 0, moved);
    setStorageTargets(next.map((t, i) => ({ ...t, order: i + 1 })));
  }

  function removeTarget(storageLocationId: string) {
    const next = storageTargets
      .filter((t) => t.storage_location_id !== storageLocationId)
      .map((t, i) => ({ ...t, order: i + 1 }));
    setStorageTargets(next);
  }

  async function handleSave() {
    if (!isValid) return;
    const baseDirectories = referencedFilesBaseDirs
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const payload: JobPayload = {
      name: name.trim(),
      datasource_id: datasourceId,
      storage_location_id: storageTargets[0].storage_location_id,
      schedule_cron: buildCron(frequency, hour, minute, daysOfWeek, dayOfMonth),
      schedule_timezone: 'UTC',
      enabled,
      retention_policy: {
        max_backups: maxBackups,
        auto_delete: autoDelete,
      },
      backup_options: {
        backup_type: backupType,
        compression,
        storage_strategy: storageStrategy,
        storage_targets: storageTargets.map((t, index) => ({
          storage_location_id: t.storage_location_id,
          order: index + 1,
        })),
        referenced_files: includeReferencedFiles
          ? {
            enabled: true,
            discovery_query: referencedFilesQuery.trim(),
            ...(referencedFilesPathColumn.trim() && { path_column: referencedFilesPathColumn.trim() }),
            base_directories: baseDirectories,
            missing_file_policy: referencedFilesMissingPolicy,
            max_files: Math.max(1, Math.trunc(referencedFilesMax)),
            source_type: referencedFilesSourceType,
            ...(referencedFilesSourceType === 'ssh' && {
              source: {
                host: referencedFilesSshHost.trim(),
                port: Math.max(1, Math.trunc(referencedFilesSshPort || 22)),
                username: referencedFilesSshUser.trim(),
                ...(referencedFilesSshPassword.trim() && { password: referencedFilesSshPassword }),
                ...(referencedFilesSshPrivateKey.trim() && { private_key: referencedFilesSshPrivateKey }),
              },
            }),
          }
          : { enabled: false },
      },
    };

    await onSave(payload, job?.id);
  }

  const footerContent = (
    <>
      <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancelar</button>
      <button className={styles.saveBtn} onClick={() => void handleSave()} disabled={!isValid || saving}>
        {saving ? 'Salvando...' : job ? 'Salvar alterações' : 'Criar job'}
      </button>
    </>
  );

  return (
    <Modal
      title={job ? 'Editar Job' : 'Novo Backup Job'}
      subtitle="Configure o agendamento, origem e destino do backup"
      onClose={onClose}
      footer={footerContent}
      size="lg"
    >
      <Section icon={<InfoIcon />} title="Informações gerais">
        <div className={styles.field}>
          <label className={styles.label}>Nome do job *</label>
          <input
            className={styles.input}
            type="text"
            placeholder="Ex: Postgres - Backup Diário"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Tipo de backup</label>
          <div className={styles.radioCards}>
            {BACKUP_TYPES.map(bt => (
              <button
                key={bt.value}
                className={`${styles.radioCard} ${backupType === bt.value ? styles.radioCardActive : ''}`}
                onClick={() => setBackupType(bt.value)}
                type="button"
              >
                <span className={styles.radioCardLabel}>{bt.label}</span>
                <span className={styles.radioCardDesc}>{bt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <label className={styles.checkLabel}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <span>Job ativo (será agendado automaticamente)</span>
        </label>
      </Section>

      <Section icon={<DbIcon />} title="Datasource de origem">
        <div className={styles.dsGrid}>
          {datasources.map(ds => (
            <button
              key={ds.id}
              className={`${styles.dsCard} ${datasourceId === ds.id ? styles.dsCardActive : ''}`}
              onClick={() => setDatasourceId(ds.id)}
              type="button"
            >
              <span className={`${styles.dsCardIcon} ${styles[ds.type]}`}>
                {DS_ABBR[ds.type]}
              </span>
              <span className={styles.dsCardName}>{ds.name}</span>
              <span className={`${styles.dsCardStatus} ${styles[ds.status]}`} />
              {datasourceId === ds.id && <span className={styles.dsCardCheck}><CheckIcon /></span>}
            </button>
          ))}
        </div>
      </Section>

      <Section icon={<StorageIcon />} title="Storage de destino">
        <div className={styles.addTargetRow}>
          <select
            className={styles.select}
            value={storageToAddId}
            onChange={(e) => setStorageToAddId(e.target.value)}
          >
            <option value="">Selecione um storage...</option>
            {storages
              .filter((s) => !storageTargets.some((t) => t.storage_location_id === s.id))
              .map(sl => (
              <option key={sl.id} value={sl.id}>{sl.name}</option>
              ))}
          </select>
          <button type="button" className={styles.addTargetBtn} onClick={addStorageTarget} disabled={!storageToAddId}>
            Adicionar
          </button>
        </div>

        <div className={styles.targetList}>
          {storageTargets.length === 0 && (
            <p className={styles.emptyTargets}>Selecione pelo menos um storage de destino.</p>
          )}

          {storageTargets.map((target, index) => {
            const sl = storages.find((s) => s.id === target.storage_location_id);
            if (!sl) return null;
            return (
              <div key={target.storage_location_id} className={styles.targetRow}>
                <div className={styles.targetOrder}>
                  <button
                    type="button"
                    className={styles.orderBtn}
                    onClick={() => moveTarget(index, -1)}
                    disabled={index === 0}
                    aria-label="Mover para cima"
                  >
                    Up
                  </button>
                  <span className={styles.orderNum}>{index + 1}</span>
                  <button
                    type="button"
                    className={styles.orderBtn}
                    onClick={() => moveTarget(index, 1)}
                    disabled={index === storageTargets.length - 1}
                    aria-label="Mover para baixo"
                  >
                    Dn
                  </button>
                </div>

                <span className={`${styles.slBadge} ${styles[sl.type]}`}>{SL_ABBR[sl.type]}</span>
                <div className={styles.targetInfo}>
                  <span className={styles.targetName}>{sl.name}</span>
                  {index === 0 && <span className={styles.primaryLabel}>primario</span>}
                </div>

                <button
                  type="button"
                  className={styles.removeTarget}
                  onClick={() => removeTarget(target.storage_location_id)}
                  aria-label="Remover target"
                >
                  X
                </button>
              </div>
            );
          })}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Estrategia de gravacao</label>
          <div className={styles.freqTabs}>
            <button
              type="button"
              className={`${styles.freqTab} ${storageStrategy === 'fallback' ? styles.freqTabActive : ''}`}
              onClick={() => setStorageStrategy('fallback')}
            >
              Fallback
            </button>
            <button
              type="button"
              className={`${styles.freqTab} ${storageStrategy === 'replicate' ? styles.freqTabActive : ''}`}
              onClick={() => setStorageStrategy('replicate')}
            >
              Replicar
            </button>
          </div>
          <p className={styles.sectionHint}>
            Fallback: salva no primeiro storage disponivel. Replicar: tenta salvar em todos os storages.
          </p>
        </div>
      </Section>

      <Section icon={<ClockIcon />} title="Agendamento">
        <div className={styles.field}>
          <label className={styles.label}>Frequência</label>
          <div className={styles.freqTabs}>
            {(['daily', 'weekly', 'monthly'] as Frequency[]).map(f => (
              <button
                key={f}
                className={`${styles.freqTab} ${frequency === f ? styles.freqTabActive : ''}`}
                onClick={() => setFrequency(f)}
                type="button"
              >
                {f === 'daily' ? 'Diário' : f === 'weekly' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>
        </div>

        {frequency === 'weekly' && (
          <div className={styles.field}>
            <label className={styles.label}>Dias da semana</label>
            <div className={styles.dowGrid}>
              {WEEKDAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.dowBtn} ${daysOfWeek.includes(i) ? styles.dowActive : ''}`}
                  onClick={() => setDaysOfWeek(prev =>
                    prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i],
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {frequency === 'monthly' && (
          <div className={styles.field}>
            <label className={styles.label}>Dia do mês</label>
            <input
              className={`${styles.input} ${styles.inputSm}`}
              type="number"
              min="1"
              max="28"
              value={dayOfMonth}
              onChange={e => setDayOfMonth(Number(e.target.value))}
            />
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Horário (UTC)</label>
          <div className={styles.timeRow}>
            <select className={styles.select} value={hour} onChange={e => setHour(Number(e.target.value))}>
              {HOURS.map(h => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
              ))}
            </select>
            <span className={styles.timeSep}>:</span>
            <select className={styles.select} value={minute} onChange={e => setMinute(Number(e.target.value))}>
              {MINUTES.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section icon={<RetentionIcon />} title="Política de retenção">
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={autoDelete} onChange={(e) => setAutoDelete(e.target.checked)} />
          <span>Auto delete habilitado</span>
        </label>

        <div className={styles.retentionGrid}>
          <div className={styles.retField}>
            <label className={styles.retLabel}>Maximo de backups por banco</label>
            <input
              className={`${styles.input} ${styles.retInput}`}
              type="number"
              min={1}
              step={1}
              value={maxBackups}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                setMaxBackups(Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1);
              }}
            />
          </div>
        </div>

        <p className={styles.sectionHint}>
          Exemplo: limite 3. Quando o 4o backup concluir, o mais antigo sera removido.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Compressão</label>
          <select className={styles.select} value={compression} onChange={(e) => setCompression(e.target.value as typeof compression)}>
            <option value="gzip">gzip</option>
            <option value="zstd">zstd</option>
            <option value="lz4">lz4</option>
            <option value="none">none</option>
          </select>
        </div>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={includeReferencedFiles}
            onChange={(e) => setIncludeReferencedFiles(e.target.checked)}
          />
          <span>Incluir arquivos referenciados pelo banco</span>
        </label>

        {includeReferencedFiles && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Origem dos arquivos</label>
              <div className={styles.freqTabs}>
                <button
                  type="button"
                  className={`${styles.freqTab} ${referencedFilesSourceType === 'local' ? styles.freqTabActive : ''}`}
                  onClick={() => setReferencedFilesSourceType('local')}
                >
                  Local (mesmo servidor)
                </button>
                <button
                  type="button"
                  className={`${styles.freqTab} ${referencedFilesSourceType === 'ssh' ? styles.freqTabActive : ''}`}
                  onClick={() => setReferencedFilesSourceType('ssh')}
                >
                  Remoto via SSH/SFTP
                </button>
              </div>
            </div>

            {referencedFilesSourceType === 'ssh' && (
              <>
                <div className={styles.field}>
                  <label className={styles.label}>Host SSH *</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Ex: 10.0.0.15"
                    value={referencedFilesSshHost}
                    onChange={(e) => setReferencedFilesSshHost(e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Porta SSH</label>
                  <input
                    className={`${styles.input} ${styles.inputSm}`}
                    type="number"
                    min={1}
                    max={65535}
                    value={referencedFilesSshPort}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      setReferencedFilesSshPort(Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 22);
                    }}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Usuario SSH *</label>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Ex: ubuntu"
                    value={referencedFilesSshUser}
                    onChange={(e) => setReferencedFilesSshUser(e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Senha SSH (ou chave privada abaixo)</label>
                  <input
                    className={styles.input}
                    type="password"
                    placeholder="Opcional se usar chave privada"
                    value={referencedFilesSshPassword}
                    onChange={(e) => setReferencedFilesSshPassword(e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Chave privada SSH (ou senha acima)</label>
                  <textarea
                    className={styles.textarea}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    value={referencedFilesSshPrivateKey}
                    onChange={(e) => setReferencedFilesSshPrivateKey(e.target.value)}
                    rows={4}
                  />
                </div>
              </>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Query SQL para listar caminhos dos arquivos *</label>
              <textarea
                className={styles.textarea}
                placeholder="Ex: SELECT file_path FROM attachments WHERE file_path IS NOT NULL"
                value={referencedFilesQuery}
                onChange={(e) => setReferencedFilesQuery(e.target.value)}
                rows={4}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Nome da coluna com caminho (opcional)</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Ex: file_path"
                value={referencedFilesPathColumn}
                onChange={(e) => setReferencedFilesPathColumn(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Diretorios base permitidos (1 por linha) *</label>
              <textarea
                className={styles.textarea}
                placeholder={'Ex:\nC:\\dados\\anexos\nD:\\storage\\uploads'}
                value={referencedFilesBaseDirs}
                onChange={(e) => setReferencedFilesBaseDirs(e.target.value)}
                rows={4}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Politica para arquivo faltante</label>
              <div className={styles.freqTabs}>
                <button
                  type="button"
                  className={`${styles.freqTab} ${referencedFilesMissingPolicy === 'warn' ? styles.freqTabActive : ''}`}
                  onClick={() => setReferencedFilesMissingPolicy('warn')}
                >
                  Avisar e continuar
                </button>
                <button
                  type="button"
                  className={`${styles.freqTab} ${referencedFilesMissingPolicy === 'fail' ? styles.freqTabActive : ''}`}
                  onClick={() => setReferencedFilesMissingPolicy('fail')}
                >
                  Falhar backup
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Limite maximo de arquivos</label>
              <input
                className={`${styles.input} ${styles.inputSm}`}
                type="number"
                min={1}
                max={20000}
                value={referencedFilesMax}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  setReferencedFilesMax(Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1);
                }}
              />
            </div>
          </>
        )}
      </Section>
    </Modal>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>{icon}</span>
        <h3 className={styles.sectionTitle}>{title}</h3>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}







