import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PWA Configuration, Icons & Offline Architecture', () => {
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, 'public');

  describe('PWA Icon Assets & Headers', () => {
    it('verifies 192x192 PNG icon exists and has valid PNG header', () => {
      const pwa192Path = path.join(publicDir, 'pwa-192x192.png');
      expect(fs.existsSync(pwa192Path)).toBe(true);

      const buffer = fs.readFileSync(pwa192Path);
      // PNG magic bytes: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);

      // IHDR chunk begins at offset 8 (length: 13, type: 'IHDR')
      expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(192);
      expect(height).toBe(192);
    });

    it('verifies 512x512 PNG icon exists and has valid PNG header', () => {
      const pwa512Path = path.join(publicDir, 'pwa-512x512.png');
      expect(fs.existsSync(pwa512Path)).toBe(true);

      const buffer = fs.readFileSync(pwa512Path);
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);

      expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(512);
      expect(height).toBe(512);
    });

    it('verifies 512x512 maskable PNG icon exists and has valid PNG header', () => {
      const maskablePath = path.join(publicDir, 'pwa-maskable-512x512.png');
      expect(fs.existsSync(maskablePath)).toBe(true);

      const buffer = fs.readFileSync(maskablePath);
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);

      expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(512);
      expect(height).toBe(512);
    });

    it('verifies Apple Touch Icon (180x180) exists and has valid PNG header', () => {
      const appleIconPath = path.join(publicDir, 'apple-touch-icon.png');
      expect(fs.existsSync(appleIconPath)).toBe(true);

      const buffer = fs.readFileSync(appleIconPath);
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);

      expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(180);
      expect(height).toBe(180);
    });

    it('verifies scalable pwa-icon.svg exists and contains valid SVG vectors', () => {
      const pwaSvgPath = path.join(publicDir, 'pwa-icon.svg');
      expect(fs.existsSync(pwaSvgPath)).toBe(true);

      const svgContent = fs.readFileSync(pwaSvgPath, 'utf-8');
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('viewBox="0 0 512 512"');
      expect(svgContent).toContain('path');
      expect(svgContent).toContain('</svg>');
    });
  });

  describe('Vite PWA Plugin Configuration', () => {
    it('verifies vite.config.ts incorporates VitePWA with required manifest and Workbox rules', () => {
      const viteConfigPath = path.join(rootDir, 'vite.config.ts');
      expect(fs.existsSync(viteConfigPath)).toBe(true);

      const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');
      expect(viteConfig).toContain('VitePWA');
      expect(viteConfig).toContain("'ScribeNode — AI Speech & Transcript Engine'");
      expect(viteConfig).toContain("'ScribeNode'");
      expect(viteConfig).toContain("process.env.APP_NAME");
      expect(viteConfig).toContain("name: appName");
      expect(viteConfig).toContain("short_name: appShortName");
      expect(viteConfig).toContain("display: 'standalone'");
      expect(viteConfig).toContain("theme_color: '#0f172a'");
      expect(viteConfig).toContain("background_color: '#0f172a'");
      expect(viteConfig).toContain('/pwa-192x192.png');
      expect(viteConfig).toContain('/pwa-512x512.png');
      expect(viteConfig).toContain("purpose: 'maskable'");
      expect(viteConfig).toContain('navigateFallbackDenylist');
      expect(viteConfig).toContain('cleanupOutdatedCaches: true');
      expect(viteConfig).toContain("handler: 'NetworkOnly'");
    });
  });

  describe('HTML Entry Point PWA Headers', () => {
    it('verifies index.html specifies theme-color and mobile-web-app meta tags', () => {
      const indexPath = path.join(rootDir, 'index.html');
      expect(fs.existsSync(indexPath)).toBe(true);

      const indexHtml = fs.readFileSync(indexPath, 'utf-8');
      expect(indexHtml).toContain('<meta name="theme-color" content="#0f172a" />');
      expect(indexHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
      expect(indexHtml).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
      expect(indexHtml).toContain('<meta name="apple-mobile-web-app-title" content="ScribeNode" />');
      expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    });
  });
});
