#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const user = process.env.DOCKERHUB_USER || 'carlossouzadev';
const repo = process.env.DOCKERHUB_REPO || 'dataguardian';
const tag = process.env.DOCKERHUB_TAG || 'latest';

if (!user) {
  console.error('Missing DOCKERHUB_USER env var.');
  console.error('Example: DOCKERHUB_USER=myuser DOCKERHUB_REPO=dataguardian DOCKERHUB_TAG=latest npm run docker:publish');
  process.exit(1);
}

const image = `${user}/${repo}:${tag}`;

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Building image: ${image}`);
run('docker', ['build', '-f', 'docker/Dockerfile', '-t', image, '.']);

console.log(`Pushing image: ${image}`);
run('docker', ['push', image]);

console.log(`Done: ${image}`);
