import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { sendEvolutionText } from '../../integrations/evolution-api/client';
import { getSystemMonitorSnapshot } from '../../core/performance/system-monitor';
import { getThreadPoolStats } from '../../core/performance/thread-pool';
import { getWorkersSnapshot } from '../../workers/worker-registry';
import { isRedisAvailable } from '../../queue/redis-client';

type BotCommand = 'help' | 'datasources' | 'storages' | 'jobs' | 'machine';

type ChatbotConfig = {
  enabled: boolean;
  allowedNumbers: string[];
  webhookToken: string;
  apiUrl: string;
  apiKey: string;
  instance: string;
};

type InboundMessage = {
  from: string;
  text: string;
  messageId: string;
  fromMe: boolean;
  isGroup: boolean;
};

export type ChatbotWebhookResult = {
  processed: boolean;
  reason?: string;
  command?: BotCommand;
  from?: string;
  sent_messages?: number;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((v) => asString(v)).filter(Boolean)
    : [];
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, '');
}

function normalizeInboundPhone(value: string) {
  const normalized = digitsOnly(value);
  if (!normalized) return '';
  return normalized.split('@')[0] ?? normalized;
}

function maybeAddBrazilCode(value: string) {
  const normalized = digitsOnly(value);
  if (!normalized) return [];
  if (normalized.startsWith('55')) return [normalized, normalized.slice(2)];
  return [normalized, `55${normalized}`];
}

function isAllowedNumber(from: string, allowed: string[]) {
  if (allowed.length === 0) return true;
  const fromCandidates = new Set(maybeAddBrazilCode(from));
  for (const raw of allowed) {
    for (const candidate of maybeAddBrazilCode(raw)) {
      if (fromCandidates.has(candidate)) return true;
    }
  }
  return false;
}

function formatDate(value: Date | null) {
  if (!value) return 'n/a';
  return value.toLocaleString('pt-BR', { hour12: false });
}

function formatBytes(value: number) {
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(1)} ${units[idx]}`;
}

function splitMessage(text: string, maxLen = 3200) {
  if (text.length <= maxLen) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      if (current) chunks.push(current);
      if (line.length > maxLen) {
        chunks.push(line.slice(0, maxLen));
        current = line.slice(maxLen);
      } else {
        current = line;
      }
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function detectCommand(rawText: string): BotCommand {
  const normalized = rawText.toLowerCase().trim().replace(/^[/!]/, '');
  if (!normalized || normalized === 'ajuda' || normalized === 'help' || normalized === '?') return 'help';
  if (normalized.startsWith('bancos') || normalized.startsWith('datasources') || normalized.startsWith('dbs')) {
    return 'datasources';
  }
  if (normalized.startsWith('storages') || normalized.startsWith('armazenamentos')) return 'storages';
  if (normalized.startsWith('jobs') || normalized.startsWith('agendamentos') || normalized.startsWith('proximas')) {
    return 'jobs';
  }
  if (normalized.startsWith('maquina') || normalized.startsWith('machine') || normalized.startsWith('servidor')) {
    return 'machine';
  }
  return 'help';
}

function extractInboundMessage(payload: unknown): InboundMessage | null {
  const root = asObject(payload);
  const data = asObject(root.data);
  const key = asObject(data.key ?? root.key);
  const message = asObject(data.message ?? root.message);

  const remoteJid = asString(
    key.remoteJid
    ?? data.remoteJid
    ?? root.remoteJid
    ?? data.sender
    ?? root.sender
    ?? data.from
    ?? root.from,
  );
  const from = normalizeInboundPhone(remoteJid);
  const isGroup = remoteJid.includes('@g.us');

  const text = asString(
    message.conversation
    ?? asObject(message.extendedTextMessage).text
    ?? asObject(message.imageMessage).caption
    ?? asObject(message.videoMessage).caption
    ?? data.text
    ?? root.text
    ?? asObject(data.body).text
    ?? asObject(root.body).text,
  );

  const fromMe = Boolean(key.fromMe ?? data.fromMe ?? root.fromMe);
  const messageId = asString(key.id ?? data.messageId ?? root.messageId ?? `${Date.now()}`);

  if (!from || !text) return null;
  return { from, text, messageId, fromMe, isGroup };
}

async function readConfig(): Promise<ChatbotConfig> {
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          'notifications.whatsapp_evolution_config',
          'notifications.whatsapp_chatbot_enabled',
          'notifications.whatsapp_chatbot_allowed_numbers',
          'notifications.whatsapp_chatbot_webhook_token',
        ],
      },
    },
    select: { key: true, value: true },
  });

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const wa = asObject(map.get('notifications.whatsapp_evolution_config'));

  return {
    enabled: asBoolean(map.get('notifications.whatsapp_chatbot_enabled'), false),
    allowedNumbers: asStringArray(map.get('notifications.whatsapp_chatbot_allowed_numbers')),
    webhookToken: asString(map.get('notifications.whatsapp_chatbot_webhook_token')),
    apiUrl: asString(wa.api_url),
    apiKey: asString(wa.api_key),
    instance: asString(wa.instance),
  };
}

async function buildDatasourcesMessage() {
  const datasources = await prisma.datasource.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      enabled: true,
      lastHealthCheckAt: true,
    },
  });

  if (datasources.length === 0) {
    return '🗄️ *Bancos de dados*\nNenhum datasource cadastrado.';
  }

  const checks = await prisma.healthCheck.findMany({
    where: { datasourceId: { in: datasources.map((d) => d.id) } },
    orderBy: { checkedAt: 'desc' },
    select: {
      datasourceId: true,
      status: true,
      latencyMs: true,
      checkedAt: true,
      errorMessage: true,
    },
  });
  const latestByDatasource = new Map<string, typeof checks[number]>();
  for (const row of checks) {
    if (!latestByDatasource.has(row.datasourceId)) latestByDatasource.set(row.datasourceId, row);
  }

  const lines = ['🗄️ *Bancos de dados e saude*', `Total: ${datasources.length}`, ''];
  for (const ds of datasources) {
    const emoji = ds.status === 'healthy' ? '🟢' : ds.status === 'warning' ? '🟡' : ds.status === 'critical' ? '🔴' : '⚪';
    const hc = latestByDatasource.get(ds.id);
    lines.push(`${emoji} *${ds.name}* (${ds.type})`);
    lines.push(`status: ${ds.status} | habilitado: ${ds.enabled ? 'sim' : 'nao'}`);
    if (hc) {
      lines.push(`health: ${hc.status} | latencia: ${hc.latencyMs ?? '-'}ms | ultimo: ${formatDate(hc.checkedAt)}`);
      if (hc.errorMessage) lines.push(`erro: ${hc.errorMessage}`);
    } else {
      lines.push(`health: sem historico`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

async function buildStoragesMessage() {
  const storages = await prisma.storageLocation.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
    },
  });

  if (storages.length === 0) {
    return '🧰 *Storages*\nNenhum storage cadastrado.';
  }

  const checks = await prisma.storageHealthCheck.findMany({
    where: { storageLocationId: { in: storages.map((s) => s.id) } },
    orderBy: { checkedAt: 'desc' },
    select: {
      storageLocationId: true,
      status: true,
      latencyMs: true,
      availableSpaceGb: true,
      checkedAt: true,
      errorMessage: true,
    },
  });
  const latestByStorage = new Map<string, typeof checks[number]>();
  for (const row of checks) {
    if (!latestByStorage.has(row.storageLocationId)) latestByStorage.set(row.storageLocationId, row);
  }

  const lines = ['🧰 *Storages e saude*', `Total: ${storages.length}`, ''];
  for (const storage of storages) {
    const emoji = storage.status === 'healthy' ? '🟢' : storage.status === 'full' ? '🟡' : '🔴';
    const hc = latestByStorage.get(storage.id);
    lines.push(`${emoji} *${storage.name}* (${storage.type})`);
    lines.push(`status: ${storage.status}`);
    if (hc) {
      lines.push(`health: ${hc.status} | latencia: ${hc.latencyMs ?? '-'}ms | ultimo: ${formatDate(hc.checkedAt)}`);
      if (hc.availableSpaceGb !== null) lines.push(`espaco livre: ${Number(hc.availableSpaceGb).toFixed(2)} GB`);
      if (hc.errorMessage) lines.push(`erro: ${hc.errorMessage}`);
    } else {
      lines.push('health: sem historico');
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

async function buildJobsMessage() {
  const jobs = await prisma.backupJob.findMany({
    include: {
      datasource: { select: { name: true, type: true } },
    },
  });

  if (jobs.length === 0) {
    return '📅 *Jobs e proximas execucoes*\nNenhum job cadastrado.';
  }

  jobs.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const aTs = a.nextExecutionAt ? a.nextExecutionAt.getTime() : Number.MAX_SAFE_INTEGER;
    const bTs = b.nextExecutionAt ? b.nextExecutionAt.getTime() : Number.MAX_SAFE_INTEGER;
    return aTs - bTs;
  });

  const lines = ['📅 *Jobs e proximas execucoes*', `Total: ${jobs.length}`, ''];
  for (const job of jobs) {
    const emoji = job.enabled ? '🟢' : '⚪';
    lines.push(`${emoji} *${job.name}*`);
    lines.push(`datasource: ${job.datasource?.name ?? job.datasourceId} (${job.datasource?.type ?? 'n/a'})`);
    lines.push(`cron: ${job.scheduleCron} | tz: ${job.scheduleTimezone}`);
    lines.push(`proxima execucao: ${formatDate(job.nextExecutionAt)} | habilitado: ${job.enabled ? 'sim' : 'nao'}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

async function buildMachineMessage() {
  const [workers, dbCheck] = await Promise.all([
    Promise.resolve(getWorkersSnapshot()),
    prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const).catch(() => 'error' as const),
  ]);
  const redis = isRedisAvailable() ? 'ok' : 'error';
  const system = getSystemMonitorSnapshot();
  const threadPool = getThreadPoolStats();

  return [
    '🖥️ *Informacoes da maquina*',
    '',
    `host: ${system.machine.hostname}`,
    `plataforma: ${system.machine.platform} ${system.machine.release} (${system.machine.arch})`,
    `node: ${system.machine.node_version}`,
    `cpu: ${system.machine.cpu_model} | cores: ${system.machine.cpu_cores}`,
    `uptime sistema: ${system.machine.system_uptime_seconds}s`,
    `uptime processo: ${system.machine.process_uptime_seconds}s`,
    '',
    `cpu maquina: ${system.current.cpu_percent}%`,
    `cpu processo: ${system.current.process_cpu_percent}%`,
    `memoria maquina: ${system.current.memory_usage_percent}% (${formatBytes(system.current.memory_used_bytes)} / ${formatBytes(system.current.memory_total_bytes)})`,
    `rss processo: ${formatBytes(system.current.process_memory_rss_bytes)}`,
    `heap processo: ${formatBytes(system.current.process_heap_used_bytes)} / ${formatBytes(system.current.process_heap_total_bytes)}`,
    `event loop lag: ${system.current.event_loop_lag_ms}ms`,
    `load avg: ${system.current.load_avg_1m} | ${system.current.load_avg_5m} | ${system.current.load_avg_15m}`,
    '',
    `database: ${dbCheck}`,
    `redis: ${redis}`,
    `workers: backup=${workers.backup.status}, restore=${workers.restore.status}, scheduler=${workers.scheduler.status}, health=${workers.health.status}, cleanup=${workers.cleanup.status}`,
    `thread_pool: enabled=${threadPool.enabled}, size=${threadPool.size}, busy=${threadPool.busy}, queued=${threadPool.queued}, processed=${threadPool.processed}, failed=${threadPool.failed}`,
  ].join('\n');
}

function buildHelpMessage() {
  return [
    '🤖 *Chatbot DataGuardian*',
    '',
    'Comandos disponiveis:',
    '• bancos -> lista todos os bancos/datasources e saude',
    '• storages -> lista todos os storages e saude',
    '• jobs -> lista jobs e proximas execucoes',
    '• maquina -> mostra informacoes da maquina/aplicacao',
    '• ajuda -> mostra esta mensagem',
  ].join('\n');
}

async function buildCommandResponse(command: BotCommand) {
  if (command === 'datasources') return buildDatasourcesMessage();
  if (command === 'storages') return buildStoragesMessage();
  if (command === 'jobs') return buildJobsMessage();
  if (command === 'machine') return buildMachineMessage();
  return buildHelpMessage();
}

export async function handleWhatsappChatbotWebhook(params: {
  payload: unknown;
  providedToken?: string;
}): Promise<ChatbotWebhookResult> {
  const cfg = await readConfig();
  if (!cfg.enabled) {
    return { processed: false, reason: 'chatbot_disabled' };
  }

  if (cfg.webhookToken && cfg.webhookToken !== asString(params.providedToken)) {
    return { processed: false, reason: 'invalid_token' };
  }

  if (!cfg.apiUrl || !cfg.apiKey || !cfg.instance) {
    logger.warn('[WHATSAPP_BOT] Configuracao Evolution incompleta para chatbot');
    return { processed: false, reason: 'evolution_not_configured' };
  }

  const inbound = extractInboundMessage(params.payload);
  if (!inbound) return { processed: false, reason: 'payload_not_supported' };
  if (inbound.fromMe) return { processed: false, reason: 'from_me_ignored' };
  if (inbound.isGroup) return { processed: false, reason: 'group_ignored' };

  if (!isAllowedNumber(inbound.from, cfg.allowedNumbers)) {
    logger.warn({ from: inbound.from }, '[WHATSAPP_BOT] Numero nao autorizado');
    return { processed: false, reason: 'sender_not_allowed', from: inbound.from };
  }

  const command = detectCommand(inbound.text);
  const response = await buildCommandResponse(command);
  const parts = splitMessage(response);

  for (const part of parts) {
    await sendEvolutionText({
      apiUrl: cfg.apiUrl,
      apiKey: cfg.apiKey,
      instance: cfg.instance,
      to: inbound.from,
      text: part,
    });
  }

  logger.info(
    { from: inbound.from, command, message_id: inbound.messageId, parts: parts.length },
    '[WHATSAPP_BOT] Resposta enviada',
  );

  return {
    processed: true,
    command,
    from: inbound.from,
    sent_messages: parts.length,
  };
}
