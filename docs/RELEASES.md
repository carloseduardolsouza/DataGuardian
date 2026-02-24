# Releases and Versioning - DataGuardian

This project uses GitHub Actions for automated versioning, tags, changelog generation, and Docker image publication.

## Goals

- Centralize release flow in GitHub
- Generate semantic version tags (`vX.Y.Z`) automatically
- Publish release notes automatically
- Publish Docker image to Docker Hub from release tags

## Workflows

### `CI` (`.github/workflows/ci.yml`)

- Runs on pull requests and pushes to `main`
- Executes `typecheck`, unit tests, and build

### `Release Please` (`.github/workflows/release-please.yml`)

- Runs on push to `main`
- Opens or updates a "Release PR" with:
  - version bump in `package.json`
  - `CHANGELOG.md` updates
  - release metadata files
- After merging the Release PR, the action creates:
  - Git tag (`vX.Y.Z`)
  - GitHub Release

### `Publish Docker Image` (`.github/workflows/docker-publish.yml`)

- Runs on tags `v*.*.*` and manual dispatch
- Builds image from `docker/Dockerfile`
- Pushes tags:
  - `X.Y.Z`
  - `X.Y`
  - `latest`

## Required GitHub secrets

Configure in repository settings:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Use a Docker Hub access token with only the permissions needed to push images.

## Commit format (for automatic semantic versioning)

Use Conventional Commits:

- `feat: add backup verification mode` -> minor version bump
- `fix: handle redis reconnect race` -> patch version bump
- `feat!: remove legacy retention fields` -> major version bump

Breaking changes can also be indicated with `BREAKING CHANGE:` in commit body.

## Recommended branch protections

- Protect `main`
- Require PR review before merge
- Require CI checks to pass
- Restrict who can push directly to `main`

## Community distribution recommendation

For easiest adoption:

1. Keep source code public on GitHub
2. Publish pre-built Docker images for each release tag
3. Keep a stable `latest` tag for fast onboarding
4. Document quick start with Docker Compose
5. Publish release notes with migration notes when needed
