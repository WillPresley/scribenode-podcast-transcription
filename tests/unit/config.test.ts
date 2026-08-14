import { describe, it, expect } from 'vitest';
import {
  cleanEnvString,
  parseBooleanEnv,
  isDisableDefaultItems,
  getBasicAuthCredentials,
  formatDockerTag,
  getAppVersion
} from '../../server/config';

describe('Server Configuration & Security Guard Engine', () => {
  describe('getAppVersion', () => {
    it('returns the current version matching package.json', () => {
      const version = getAppVersion();
      expect(version).toBe('1.2.0');
    });
  });

  describe('cleanEnvString', () => {
    it('strips leading and trailing whitespace', () => {
      expect(cleanEnvString('   my-value   ')).toBe('my-value');
    });

    it('strips matching double quotes', () => {
      expect(cleanEnvString('"my-secret-key"')).toBe('my-secret-key');
      expect(cleanEnvString('  "quoted-val"  ')).toBe('quoted-val');
    });

    it('strips matching single quotes', () => {
      expect(cleanEnvString("'single-quoted'")).toBe('single-quoted');
    });

    it('handles nested quotes correctly', () => {
      expect(cleanEnvString('""nested""')).toBe('nested');
    });

    it('handles undefined and empty string gracefully', () => {
      expect(cleanEnvString(undefined)).toBe('');
      expect(cleanEnvString('')).toBe('');
    });
  });

  describe('parseBooleanEnv', () => {
    it('recognizes truthy boolean strings', () => {
      expect(parseBooleanEnv('true')).toBe(true);
      expect(parseBooleanEnv('TRUE')).toBe(true);
      expect(parseBooleanEnv('"true"')).toBe(true);
      expect(parseBooleanEnv("'1'")).toBe(true);
      expect(parseBooleanEnv('yes')).toBe(true);
      expect(parseBooleanEnv('enabled')).toBe(true);
      expect(parseBooleanEnv('on')).toBe(true);
    });

    it('recognizes falsy boolean strings', () => {
      expect(parseBooleanEnv('false')).toBe(false);
      expect(parseBooleanEnv('"false"')).toBe(false);
      expect(parseBooleanEnv('0')).toBe(false);
      expect(parseBooleanEnv('no')).toBe(false);
      expect(parseBooleanEnv('disabled')).toBe(false);
      expect(parseBooleanEnv('off')).toBe(false);
    });

    it('uses fallback default when string is undefined or unrecognized', () => {
      expect(parseBooleanEnv(undefined, true)).toBe(true);
      expect(parseBooleanEnv(undefined, false)).toBe(false);
      expect(parseBooleanEnv('unrecognized', true)).toBe(true);
    });
  });

  describe('isDisableDefaultItems', () => {
    it('returns false by default when not specified', () => {
      expect(isDisableDefaultItems({})).toBe(false);
    });

    it('returns true when DISABLE_DEFAULT_ITEMS is set to true', () => {
      expect(isDisableDefaultItems({ DISABLE_DEFAULT_ITEMS: 'true' })).toBe(true);
      expect(isDisableDefaultItems({ DISABLE_DEFAULT_ITEMS: '"1"' })).toBe(true);
    });
  });

  describe('getBasicAuthCredentials', () => {
    it('defaults to disabled when BASIC_AUTH_ENABLED is not set', () => {
      const auth = getBasicAuthCredentials({});
      expect(auth.enabled).toBe(false);
      expect(auth.reason).toContain('defaults to FULLY DISABLED');
    });

    it('is disabled if DISABLE_BASIC_AUTH is set to true', () => {
      const auth = getBasicAuthCredentials({
        BASIC_AUTH_ENABLED: 'true',
        DISABLE_BASIC_AUTH: 'true',
        BASIC_AUTH_USER: 'admin',
        BASIC_AUTH_PASS: 'secret123'
      });
      expect(auth.enabled).toBe(false);
      expect(auth.reason).toContain('DISABLE_BASIC_AUTH');
    });

    it('is disabled if user or password is missing', () => {
      const auth1 = getBasicAuthCredentials({
        BASIC_AUTH_ENABLED: 'true',
        BASIC_AUTH_USER: 'admin'
      });
      expect(auth1.enabled).toBe(false);

      const auth2 = getBasicAuthCredentials({
        BASIC_AUTH_ENABLED: 'true',
        BASIC_AUTH_PASS: 'secret'
      });
      expect(auth2.enabled).toBe(false);
    });

    it('filters out common dummy placeholders or invalid tokens', () => {
      const auth = getBasicAuthCredentials({
        BASIC_AUTH_ENABLED: 'true',
        BASIC_AUTH_USER: 'admin',
        BASIC_AUTH_PASS: 'your_secure_password_here'
      });
      expect(auth.enabled).toBe(false);
      expect(auth.reason).toContain('Placeholder or invalid token');
    });

    it('enables authentication when valid credentials and opt-in flag are provided', () => {
      const auth = getBasicAuthCredentials({
        BASIC_AUTH_ENABLED: 'true',
        BASIC_AUTH_USER: 'podcast_admin',
        BASIC_AUTH_PASS: 'UltraSecurePass2026!'
      });
      expect(auth.enabled).toBe(true);
      expect(auth.user).toBe('podcast_admin');
      expect(auth.pass).toBe('UltraSecurePass2026!');
    });
  });

  describe('formatDockerTag', () => {
    it('returns tag alone if no SHA is present', () => {
      expect(formatDockerTag('latest', '')).toBe('latest');
    });

    it('formats 40-char commit SHA correctly', () => {
      const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4';
      expect(formatDockerTag('v1.1.0', sha)).toBe('v1.1.0 (sha: e3b0c442)');
    });

    it('formats 64-char sha256 image digest correctly', () => {
      const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
      expect(formatDockerTag('latest', sha)).toBe('latest (sha256: ba7816bf8f01)');
    });

    it('formats sha256: prefixed digest correctly', () => {
      const digest = 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
      expect(formatDockerTag('latest', digest)).toBe('latest (sha256:ba7816bf8f01)');
    });
  });
});
