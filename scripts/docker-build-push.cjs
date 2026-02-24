#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const user = process.env.DOCKERHUB_USER || 'carlossouzadev';
const repo = process.env.DOCKERHUB_REPO || 'dataguardian';
const tag = process.env.DOCKERHUB_TAG || 'latest';
const alsoLatest = process.env.DOCKERHUB_ALSO_LATEST !== 'false' && tag !== 'latest';

if (!user || !repo || !tag) {
  console.error('Missing Docker Hub settings.');
  console.error('Use DOCKERHUB_USER, DOCKERHUB_REPO, DOCKERHUB_TAG.');
  process.exit(1);
}

const image = `${user}/${repo}:${tag}`;
const latestImage = `${user}/${repo}:latest`;

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Building image: ${image}`);
run('docker', ['build', '-f', 'docker/Dockerfile', '-t', image, '.']);

if (alsoLatest) {
  console.log(`Tagging latest: ${latestImage}`);
  run('docker', ['tag', image, latestImage]);
}

console.log(`Pushing image: ${image}`);
run('docker', ['push', image]);

if (alsoLatest) {
  console.log(`Pushing image: ${latestImage}`);
  run('docker', ['push', latestImage]);
}

console.log(`Done: ${image}${alsoLatest ? ` and ${latestImage}` : ''}`);
