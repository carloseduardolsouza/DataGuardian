function unique(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function listContainerRuntimeCandidates() {
  const envCandidates = (process.env.DATAGUARDIAN_CONTAINER_RUNTIMES ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const defaults = process.platform === 'win32'
    ? ['docker', 'podman', 'nerdctl']
    : ['docker', '/usr/bin/docker', '/usr/local/bin/docker', 'podman', 'nerdctl'];

  return unique([...envCandidates, ...defaults]);
}

export function buildPostgresDumpRecoveryMessage(params: {
  serverMajor: number;
  attemptedRuntimes: string[];
  lastError?: string;
}) {
  const runtimeList = params.attemptedRuntimes.length
    ? params.attemptedRuntimes.join(', ')
    : 'docker/podman/nerdctl';

  const lines = [
    `Nenhum mecanismo compativel para dump PostgreSQL ${params.serverMajor} foi encontrado.`,
    `Runtimes tentados: ${runtimeList}`,
    `Solucoes:`,
    `1) Instale um runtime de container e deixe no PATH (docker/podman/nerdctl).`,
    `2) Ou instale pg_dump ${params.serverMajor} no host (ex.: postgresql-client-${params.serverMajor}).`,
    `3) Em Debian/Ubuntu, habilite PGDG e instale:`,
    `   apt-get update && apt-get install -y ca-certificates gnupg wget`,
    `   install -d /etc/apt/keyrings`,
    `   wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg`,
    `   echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list`,
    `   apt-get update && apt-get install -y postgresql-client-${params.serverMajor}`,
  ];

  if (params.lastError) {
    lines.push(`Detalhe tecnico: ${params.lastError}`);
  }

  return lines.join('\n');
}
