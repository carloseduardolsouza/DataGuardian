#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const composeFile = path.join('docker', 'docker-compose.yml');
const envExample = path.join(rootDir, 'docker', '.env.example');
const envFile = path.join(rootDir, 'docker', '.env');

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: rootDir,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureEnvFile() {
  if (fs.existsSync(envFile)) {
    console.log('Using existing docker/.env');
    return;
  }

  if (!fs.existsSync(envExample)) {
    console.error('Missing docker/.env.example');
    process.exit(1);
  }

  fs.copyFileSync(envExample, envFile);
  console.log('Created docker/.env from docker/.env.example');
}

const composeBaseArgs = ['compose', '--env-file', 'docker/.env', '-f', composeFile];

ensureEnvFile();

console.log('Building app image...');
run('docker', [...composeBaseArgs, 'build', 'app']);

console.log('Starting containers...');
run('docker', [
  ...composeBaseArgs,
  'up',
  '-d',
  '--wait',
  'postgres',
  'redis',
  'evolution-postgres',
  'evolution-redis',
  'evolution-api',
  'app',
]);

console.log('Running Prisma migrations...');
run('docker', [...composeBaseArgs, 'exec', '-T', 'app', 'npm', 'run', 'db:deploy']);

console.log('DataGuardian stack is up.');
console.log('App: http://localhost:3000');
console.log('Evolution API: http://localhost:8080');
