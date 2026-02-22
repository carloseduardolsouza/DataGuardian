import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const mockGetPrometheusMetricsText = jest.fn();

jest.mock('../../src/api/models/metrics.model', () => ({
  getPrometheusMetricsText: mockGetPrometheusMetricsText,
}));

jest.mock('../../src/api/middlewares/audit-trail', () => ({
  auditTrailMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('E2E Metrics Route', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    mockGetPrometheusMetricsText.mockResolvedValue('dg_redis_up 1\n');
    const { createApp } = await import('../../src/api/server');
    const app = createApp();
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('should return metrics in text format', async () => {
    const response = await fetch(`${baseUrl}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain('dg_redis_up 1');
  });
});
