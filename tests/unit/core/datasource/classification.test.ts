import {
  normalizeDatasourceTags,
  resolveDatasourceClassification,
  isProductionDatasource,
} from '../../../../src/core/datasource/classification';

describe('datasource classification', () => {
  it('normalizes and deduplicates tags', () => {
    expect(normalizeDatasourceTags([' Prod ', 'produção', 'PROD', 'qa', ''])).toEqual(['prod', 'producao', 'qa']);
  });

  it('resolves classification from aliases', () => {
    expect(resolveDatasourceClassification(['qa'])).toBe('test');
    expect(resolveDatasourceClassification(['producao'])).toBe('production');
    expect(resolveDatasourceClassification(['dev'])).toBe('development');
  });

  it('detects production datasource', () => {
    expect(isProductionDatasource(['prod'])).toBe(true);
    expect(isProductionDatasource(['hml', 'qa'])).toBe(false);
  });
});

