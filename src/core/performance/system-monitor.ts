import { cpus, freemem, hostname, loadavg, platform, release, totalmem, uptime, arch } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

interface CpuTotals {
  idle: number;
  total: number;
}

export interface MonitorSample {
  ts: string;
  cpu_percent: number;
  load_avg_1m: number;
  load_avg_5m: number;
  load_avg_15m: number;
  memory_total_bytes: number;
  memory_free_bytes: number;
  memory_used_bytes: number;
  memory_usage_percent: number;
  process_cpu_percent: number;
  process_memory_rss_bytes: number;
  process_heap_used_bytes: number;
  process_heap_total_bytes: number;
  event_loop_lag_ms: number;
}

interface MonitorState {
  started: boolean;
  timer: NodeJS.Timeout | null;
  history: MonitorSample[];
  intervalMs: number;
  maxHistory: number;
  lastCpuTotals: CpuTotals;
  lastProcessCpu: NodeJS.CpuUsage;
  lastProcessHrNs: bigint;
}

const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });

function readCpuTotals(): CpuTotals {
  const cpu = cpus();
  let idle = 0;
  let total = 0;

  for (const core of cpu) {
    const t = core.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }

  return { idle, total };
}

function toFixed1(value: number) {
  return Number(value.toFixed(1));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

const state: MonitorState = {
  started: false,
  timer: null,
  history: [],
  intervalMs: 5000,
  maxHistory: 120,
  lastCpuTotals: readCpuTotals(),
  lastProcessCpu: process.cpuUsage(),
  lastProcessHrNs: process.hrtime.bigint(),
};

function captureSample(): MonitorSample {
  const nowCpuTotals = readCpuTotals();
  const cpuDeltaTotal = nowCpuTotals.total - state.lastCpuTotals.total;
  const cpuDeltaIdle = nowCpuTotals.idle - state.lastCpuTotals.idle;
  const cpuPercent = cpuDeltaTotal > 0
    ? clampPercent(((cpuDeltaTotal - cpuDeltaIdle) / cpuDeltaTotal) * 100)
    : 0;

  state.lastCpuTotals = nowCpuTotals;

  const procNow = process.cpuUsage();
  const procHrNow = process.hrtime.bigint();
  const procDiffMicros = (procNow.user - state.lastProcessCpu.user) + (procNow.system - state.lastProcessCpu.system);
  const elapsedMicros = Number(procHrNow - state.lastProcessHrNs) / 1000;
  const cores = Math.max(1, cpus().length);
  const processCpuPercent = elapsedMicros > 0
    ? clampPercent((procDiffMicros / (elapsedMicros * cores)) * 100)
    : 0;

  state.lastProcessCpu = procNow;
  state.lastProcessHrNs = procHrNow;

  const memoryTotal = totalmem();
  const memoryFree = freemem();
  const memoryUsed = Math.max(0, memoryTotal - memoryFree);
  const memoryPercent = memoryTotal > 0 ? clampPercent((memoryUsed / memoryTotal) * 100) : 0;

  const processMemory = process.memoryUsage();
  const [l1, l5, l15] = loadavg();

  const lagMeanNs = eventLoopDelay.mean;
  eventLoopDelay.reset();
  const eventLoopLagMs = Number.isFinite(lagMeanNs) ? Number(lagMeanNs) / 1_000_000 : 0;

  return {
    ts: new Date().toISOString(),
    cpu_percent: toFixed1(cpuPercent),
    load_avg_1m: toFixed1(l1 ?? 0),
    load_avg_5m: toFixed1(l5 ?? 0),
    load_avg_15m: toFixed1(l15 ?? 0),
    memory_total_bytes: memoryTotal,
    memory_free_bytes: memoryFree,
    memory_used_bytes: memoryUsed,
    memory_usage_percent: toFixed1(memoryPercent),
    process_cpu_percent: toFixed1(processCpuPercent),
    process_memory_rss_bytes: processMemory.rss,
    process_heap_used_bytes: processMemory.heapUsed,
    process_heap_total_bytes: processMemory.heapTotal,
    event_loop_lag_ms: toFixed1(eventLoopLagMs),
  };
}

function appendSample(sample: MonitorSample) {
  state.history.push(sample);
  if (state.history.length > state.maxHistory) {
    state.history.splice(0, state.history.length - state.maxHistory);
  }
}

export function startSystemMonitor(params?: { intervalMs?: number; maxHistory?: number }) {
  if (state.started) return;
  state.started = true;

  state.intervalMs = Math.max(1000, Math.floor(params?.intervalMs ?? 5000));
  state.maxHistory = Math.max(30, Math.floor(params?.maxHistory ?? 120));
  state.lastCpuTotals = readCpuTotals();
  state.lastProcessCpu = process.cpuUsage();
  state.lastProcessHrNs = process.hrtime.bigint();
  state.history = [];

  eventLoopDelay.enable();
  appendSample(captureSample());
  state.timer = setInterval(() => {
    appendSample(captureSample());
  }, state.intervalMs);
}

export function stopSystemMonitor() {
  if (!state.started) return;
  state.started = false;
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  eventLoopDelay.disable();
}

export function getSystemMonitorSnapshot() {
  const latest = state.history[state.history.length - 1] ?? captureSample();
  const history = state.history.length > 0 ? [...state.history] : [latest];
  const cpuList = cpus();

  return {
    machine: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu_cores: cpuList.length,
      cpu_model: cpuList[0]?.model ?? 'unknown',
      total_memory_bytes: totalmem(),
      system_uptime_seconds: Math.floor(uptime()),
      process_uptime_seconds: Math.floor(process.uptime()),
      node_version: process.version,
    },
    current: latest,
    history,
  };
}
