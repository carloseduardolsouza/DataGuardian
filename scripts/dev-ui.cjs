const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const dotenv = require('dotenv');

dotenv.config({ path: resolve(__dirname, '..', '.env') });

const projectRoot = resolve(__dirname, '..');
const rawHost = (process.env.HOST || '127.0.0.1').trim();
const apiHost = rawHost === '0.0.0.0' || rawHost === '::' ? '127.0.0.1' : rawHost;
const apiPort = (process.env.PORT || '3000').trim();
const apiTarget = (process.env.VITE_API_PROXY_TARGET || `http://${apiHost}:${apiPort}`).trim();
const healthUrl = new URL('/health', apiTarget);
const timeoutMs = 60_000;
const retryIntervalMs = 1_000;

function checkHealth() {
  return fetch(healthUrl, { signal: AbortSignal.timeout(2_000) }).then((res) => {
    if (res.status >= 200 && res.status < 500) {
      return;
    }

    throw new Error(`API respondeu com status ${res.status}`);
  });
}

async function waitForApi() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await checkHealth();
      console.log(`[dev-ui] API pronta em ${apiTarget}`);
      return;
    } catch {
      await delay(retryIntervalMs);
    }
  }

  throw new Error(`API nao ficou pronta em ${healthUrl.href} dentro de ${timeoutMs / 1000}s`);
}

async function main() {
  await waitForApi();

  const child = spawn(
    'npm run dev --prefix interface',
    {
      cwd: projectRoot,
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: apiTarget,
      },
    },
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(`[dev-ui] ${error.message}`);
  process.exit(1);
});
