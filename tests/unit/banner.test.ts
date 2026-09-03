import { describe, it, expect, vi } from 'vitest';
import {
  buildStartupBannerLines,
  printStartupBanner,
  fitLine,
  BANNER_BORDER_WIDTH,
  ASCII_LOGO
} from '../../server/banner';
import {
  DEFAULT_TRANSCRIPTION_MODELS,
  PRIMARY_TRANSCRIPTION_MODEL,
  formatModelDisplayName
} from '../../server/transcriptionEngine';

describe('Server Startup Banner Formatter (server/banner.ts)', () => {
  it('enforces that banner border width is exactly 70 columns', () => {
    expect(BANNER_BORDER_WIDTH).toBe(70);
    expect(BANNER_BORDER_WIDTH).toBeLessThan(80);
  });

  describe('fitLine utility', () => {
    it('leaves values unchanged when they fit comfortably within maxWidth', () => {
      const line = fitLine(' Version      : ', 'v1.5.0', 70);
      expect(line).toBe(' Version      : v1.5.0');
      expect(line.length).toBeLessThanOrEqual(70);
    });

    it('truncates paths with leading ellipsis to preserve the informative tail', () => {
      const longPath = '/home/runner/work/scribenode-podcast-transcription/scribenode-podcast-transcription/uploads';
      const line = fitLine(' Uploads Dir  : ', longPath, 70);
      expect(line.length).toBe(70);
      expect(line.startsWith(' Uploads Dir  : ...')).toBe(true);
      expect(line.endsWith('/uploads')).toBe(true);
    });

    it('truncates generic non-path text with trailing ellipsis', () => {
      const longText = 'A very long description that exceeds the seventy character maximum width threshold by a substantial margin';
      const line = fitLine(' Environment  : ', longText, 70);
      expect(line.length).toBe(70);
      expect(line.startsWith(' Environment  : ')).toBe(true);
      expect(line.endsWith('...')).toBe(true);
    });
  });

  it('ensures every single generated banner line is strictly <= 70 characters', () => {
    const lines = buildStartupBannerLines();

    expect(lines.length).toBeGreaterThan(15);
    lines.forEach((line, idx) => {
      expect(
        line.length,
        `Line ${idx + 1} exceeds 70 character limit: "${line}" (${line.length} chars)`
      ).toBeLessThanOrEqual(BANNER_BORDER_WIDTH);
    });
  });

  it('safely handles long GitHub Actions runner work directories without exceeding 70 columns', () => {
    const lines = buildStartupBannerLines({
      uploadsDir: '/home/runner/work/scribenode-podcast-transcription/scribenode-podcast-transcription/uploads',
      tempStorageDir: '/home/runner/work/scribenode-podcast-transcription/temp-storage-directory-on-runner',
      serverUrl: 'https://extremely-long-custom-subdomain-hostname.internal.cloudprovider.example.com:3000'
    });

    expect(lines.length).toBeGreaterThan(15);
    lines.forEach((line, idx) => {
      expect(
        line.length,
        `Line ${idx + 1} exceeds 70 character limit in simulated CI runner: "${line}" (${line.length} chars)`
      ).toBeLessThanOrEqual(BANNER_BORDER_WIDTH);
    });
  });

  it('ensures no content line extends beyond the header and footer divider lines', () => {
    const lines = buildStartupBannerLines();
    const header = lines[0];
    const footer = lines[lines.length - 1];

    expect(header).toBe('='.repeat(BANNER_BORDER_WIDTH));
    expect(footer).toBe('='.repeat(BANNER_BORDER_WIDTH));

    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(header.length);
    });
  });

  it('preserves all 9 models and their display names in the fallback hierarchy', () => {
    const lines = buildStartupBannerLines();
    const joined = lines.join('\n');

    expect(lines).toContain(` Primary Model: ${PRIMARY_TRANSCRIPTION_MODEL} (${formatModelDisplayName(PRIMARY_TRANSCRIPTION_MODEL)})`);
    expect(joined).toContain(`Fallback Chain (${DEFAULT_TRANSCRIPTION_MODELS.length} models):`);

    DEFAULT_TRANSCRIPTION_MODELS.forEach((m, idx) => {
      const isPrimary = idx === 0;
      const expectedTag = isPrimary ? ' (Primary)' : '';
      const displayName = formatModelDisplayName(m);

      expect(joined).toContain(`[${idx + 1}]`);
      expect(joined).toContain(m);
      expect(joined).toContain(displayName);
      if (isPrimary) {
        expect(joined).toContain(`[1] ${m.padEnd(25)} -> ${displayName}${expectedTag}`);
      }
    });
  });

  it('properly formats custom options when supplied', () => {
    const lines = buildStartupBannerLines({
      version: '1.9.9',
      dockerTag: 'v1.9.9-release',
      gitSha: '1234567890abcdef1234567890abcdef12345678',
      nodeEnv: 'test-environment',
      serverUrl: 'http://127.0.0.1:9999',
      uploadsDir: '/custom/storage',
      tempStorageDir: '/tmp/custom',
      hasGeminiApiKey: true,
      primaryModel: 'gemini-3.8-flash',
      disableDefaultItems: true,
      maxUploadMB: 500
    });

    const joined = lines.join('\n');
    expect(joined).toContain('Version      : v1.9.9');
    expect(joined).toContain('Environment  : test-environment');
    expect(joined).toContain('Server URL   : http://127.0.0.1:9999');
    expect(joined).toContain('Uploads Dir  : /custom/storage');
    expect(joined).toContain('Temp Storage : /tmp/custom');
    expect(joined).toContain('Gemini API   : Configured [OK]');
    expect(joined).toContain('Preseed Items: Disabled (DISABLE_DEFAULT_ITEMS=true)');
    expect(joined).toContain('Max Upload   : 500MB');

    // Still satisfies strict column constraints
    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(BANNER_BORDER_WIDTH);
    });
  });

  it('prints startup banner including ASCII logo without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      printStartupBanner();
      expect(consoleSpy).toHaveBeenCalledWith(ASCII_LOGO);
      expect(consoleSpy).toHaveBeenCalledWith('='.repeat(BANNER_BORDER_WIDTH));
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
