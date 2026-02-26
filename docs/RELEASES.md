# :sparkles: Releases and Versioning - DataGuardian

> Automated release flow using GitHub Actions + Docker Hub.

## :bookmark: Goals

- Centralize release flow in GitHub
- Generate semantic version tags (`vX.Y.Z`) automatically
- Publish release notes automatically
- Publish Docker image to Docker Hub from release tags

## :bookmark: Workflows

### `CI` (`.github/workflows/ci.yml`)

- Runs on pull requests and pushes to `main`
- Executes typecheck, tests, and build

### `Release Please` (`.github/workflows/release-please.yml`)

- Runs on push to `main`
- Opens or updates a Release PR with:
- Version bump in `package.json`
- `CHANGELOG.md` updates
- Release metadata files
- After merging, creates:
- Git tag (`vX.Y.Z`)
- GitHub Release

### `Publish Docker Image` (`.github/workflows/docker-publish.yml`)

- Runs on tags `v*.*.*` and manual dispatch
- Builds image from `docker/Dockerfile`
- Pushes tags:
- `X.Y.Z`
- `X.Y`
- `latest`

## :bookmark: Local Docker publish script

Command: `npm run docker:publish` (`scripts/docker-build-push.cjs`)

Default behavior:

- Primary tag: `DOCKERHUB_TAG` or `package.json` version
- Automatic extra tag: `X.Y` when primary tag is `X.Y.Z`
- Also pushes `latest` unless `DOCKERHUB_ALSO_LATEST=false`

Optional overrides:

- `DOCKERHUB_USER`
- `DOCKERHUB_REPO`
- `DOCKERHUB_TAG`
- `DOCKERHUB_EXTRA_TAGS` (comma-separated)

## :bookmark: Required GitHub secrets

Set in repository settings:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Use a Docker Hub access token with minimal required permissions.

## :bookmark: Commit format (semantic versioning)

Use Conventional Commits:

- `feat: add backup verification mode` -> minor bump
- `fix: handle redis reconnect race` -> patch bump
- `feat!: remove legacy retention fields` -> major bump

You can also use `BREAKING CHANGE:` in commit body.

## :sparkles: Recommended branch protections

- Protect `main`
- Require PR review before merge
- Require CI checks to pass
- Restrict direct pushes to `main`

## :bookmark: Community distribution recommendations

1. Keep source code public on GitHub
2. Publish pre-built Docker images for each release tag
3. Keep a stable `latest` tag for fast onboarding
4. Document a quick start with Docker Compose
5. Include migration notes in release notes when needed

