#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const user = process.env.DOCKERHUB_USER || 'carlossouzadev';
const repo = process.env.DOCKERHUB_REPO || 'dataguardian';

function getPackageVersion() {
  if (process.env.npm_package_version) {
    return process.env.npm_package_version.trim();
  }

  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return typeof packageJson.version === 'string' ? packageJson.version.trim() : '';
}

function getSemverAliases(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) return [];
  const [, major, minor] = match;
  return [`${major}.${minor}`];
}

const versionTag = getPackageVersion();
const primaryTag = process.env.DOCKERHUB_TAG || versionTag || 'latest';
const alsoLatest = process.env.DOCKERHUB_ALSO_LATEST !== 'false' && primaryTag !== 'latest';
const additionalTags = process.env.DOCKERHUB_EXTRA_TAGS
  ? process.env.DOCKERHUB_EXTRA_TAGS.split(',').map((tag) => tag.trim()).filter(Boolean)
  : getSemverAliases(primaryTag);
const tags = [...new Set([primaryTag, ...additionalTags, ...(alsoLatest ? ['latest'] : [])])];

if (!user || !repo || !primaryTag) {
  console.error('Missing Docker Hub settings.');
  console.error('Use DOCKERHUB_USER, DOCKERHUB_REPO, DOCKERHUB_TAG.');
  process.exit(1);
}

const primaryImage = `${user}/${repo}:${primaryTag}`;

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Building image: ${primaryImage}`);
run('docker', ['build', '-f', 'docker/Dockerfile', '-t', primaryImage, '.']);

for (const tag of tags) {
  const image = `${user}/${repo}:${tag}`;
  if (tag !== primaryTag) {
    console.log(`Tagging image: ${image}`);
    run('docker', ['tag', primaryImage, image]);
  }

  console.log(`Pushing image: ${image}`);
  run('docker', ['push', image]);
}

console.log(`Done. Published tags: ${tags.join(', ')}`);
