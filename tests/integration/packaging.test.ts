import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Build, Packaging & Release Configuration Verification', () => {
  const rootDir = process.cwd();

  it('validates package.json scripts and configuration', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.name).toBe('scribenode');
    expect(pkg.engines?.node).toBe('>=24.0.0');
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.start).toBe('node dist/server.cjs');
    expect(pkg.scripts.lint).toBe('tsc --noEmit');
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts['test:coverage']).toBe('vitest run --coverage');
    expect(pkg.dependencies.express).toBeDefined();
    expect(pkg.dependencies['@google/genai']).toBeDefined();
    expect(pkg.overrides?.qs).toBe('^6.16.0');
    expect(pkg.overrides?.nanoid).toBeDefined();
  });

  it('validates Dockerfile configuration and port exposure', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const dockerfile = fs.readFileSync(dockerfilePath, 'utf-8');
    expect(dockerfile).toContain('FROM node:26-alpine');
    expect(dockerfile).toContain('EXPOSE 3000');
    expect(dockerfile).toContain('npm run build');
    expect(dockerfile).toContain('CMD ["node", "dist/server.cjs"]');
  });

  it('validates docker-compose.yml environment passthrough syntax and volume mounts', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');
    expect(fs.existsSync(composePath)).toBe(true);

    const compose = fs.readFileSync(composePath, 'utf-8');
    expect(compose).toContain('PORT=${PORT:-3000}');
    expect(compose).toContain('uploads:/app/uploads');
  });

  it('validates GitHub Actions workflow includes lint, test, and build stages with native runner CLI', () => {
    const workflowPath = path.join(rootDir, '.github/workflows/deploy.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf-8');
    expect(workflow).toContain('git config --global init.defaultBranch main');
    expect(workflow).toContain('git config --global advice.detachedHead false');
    expect(workflow).toContain('git init -b main');
    expect(workflow).toContain('git fetch --depth 1 origin "${{ github.sha }}"');
    expect(workflow).toContain('git checkout --quiet FETCH_HEAD');
    expect(workflow).toContain('nvm install 26 --default');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('Authenticate to GitHub Container Registry');
    expect(workflow).toContain('docker buildx create --use');
  });

  it('validates metadata.json application settings and capabilities', () => {
    const metaPath = path.join(rootDir, 'metadata.json');
    expect(fs.existsSync(metaPath)).toBe(true);

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(meta.name).toBeDefined();
    expect(meta.name.length).toBeGreaterThan(0);
    expect(meta.majorCapabilities).toContain('MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API');
  });

  it('validates .env.example contains core environment variables', () => {
    const envExamplePath = path.join(rootDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const envExample = fs.readFileSync(envExamplePath, 'utf-8');
    expect(envExample).toContain('GEMINI_API_KEY');
    expect(envExample).toContain('PORT');
  });
});
