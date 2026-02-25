export const DATASOURCE_CLASSIFICATIONS = [
  'production',
  'staging',
  'homolog',
  'test',
  'development',
  'critical',
] as const;

export type DatasourceClassification = (typeof DATASOURCE_CLASSIFICATIONS)[number];

const CLASSIFICATION_ALIASES: Record<string, DatasourceClassification> = {
  production: 'production',
  prod: 'production',
  producao: 'production',
  staging: 'staging',
  stage: 'staging',
  homolog: 'homolog',
  hml: 'homolog',
  homologacao: 'homolog',
  test: 'test',
  testing: 'test',
  teste: 'test',
  qa: 'test',
  development: 'development',
  dev: 'development',
  critical: 'critical',
  critico: 'critical',
  critica: 'critical',
};

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeDatasourceTag(value: string) {
  return normalizeText(value);
}

export function normalizeDatasourceTags(values: string[]) {
  const unique = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeDatasourceTag(String(value ?? ''));
    if (!normalized) continue;
    if (unique.has(normalized)) continue;
    unique.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function resolveDatasourceClassification(tags: string[]): DatasourceClassification | null {
  for (const rawTag of tags) {
    const key = normalizeDatasourceTag(rawTag);
    const classification = CLASSIFICATION_ALIASES[key];
    if (classification) return classification;
  }
  return null;
}

export function isProductionDatasource(tags: string[]) {
  return resolveDatasourceClassification(tags) === 'production';
}

