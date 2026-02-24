import * as fs from 'node:fs';
import * as path from 'node:path';

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8');
}

describe('build pipeline configuration', () => {
  it('keeps required npm build scripts in package.json', () => {
    const packageJsonRaw = readProjectFile('package.json');
    const packageJson = JSON.parse(packageJsonRaw) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.build).toBe('npm run build:api && npm run build:ui');
    expect(packageJson.scripts?.['build:api']).toBe('tsc');
    expect(packageJson.scripts?.['build:ui']).toBe('npm run build --prefix interface');
    expect(packageJson.scripts?.['db:deploy']).toBe('prisma migrate deploy');
  });

  it('runs prisma migrations before starting app in Docker image', () => {
    const dockerfile = readProjectFile(path.join('docker', 'Dockerfile'));
    expect(dockerfile).toContain('CMD ["sh", "-c", "npm run db:deploy && node dist/index.js"]');
  });
});
