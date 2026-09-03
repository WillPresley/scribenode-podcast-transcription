import { describe, it, expect, vi } from 'vitest';
import {
  buildStartupBannerLines,
  printStartupBanner,
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
