import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  parseTimestampToSeconds,
  calculateTargetPcmParams
} from '../../src/utils/audio';

describe('Audio Utility Engine', () => {
  describe('formatDuration', () => {
    it('formats seconds under 1 hour as MM:SS', () => {
      expect(formatDuration(45)).toBe('00:45');
      expect(formatDuration(90)).toBe('01:30');
      expect(formatDuration(599)).toBe('09:59');
    });

    it('formats seconds over 1 hour as H:MM:SS', () => {
      expect(formatDuration(3600)).toBe('1:00:00');
      expect(formatDuration(3665)).toBe('1:01:05');
      expect(formatDuration(7325)).toBe('2:02:05');
    });

    it('handles zero, negative, NaN or empty inputs with fallback', () => {
      expect(formatDuration(0)).toBe('--:--');
      expect(formatDuration(-10)).toBe('--:--');
      expect(formatDuration(NaN)).toBe('--:--');
    });
  });

  describe('parseTimestampToSeconds', () => {
    it('parses [MM:SS] bracketed timestamps', () => {
      expect(parseTimestampToSeconds('[01:30]')).toBe(90);
      expect(parseTimestampToSeconds('[10:00]')).toBe(600);
      expect(parseTimestampToSeconds('05:20')).toBe(320);
    });

    it('parses [HH:MM:SS] bracketed timestamps', () => {
      expect(parseTimestampToSeconds('[01:15:30]')).toBe(4530);
      expect(parseTimestampToSeconds('02:00:00')).toBe(7200);
    });

    it('returns 0 for empty or invalid strings', () => {
      expect(parseTimestampToSeconds('')).toBe(0);
      expect(parseTimestampToSeconds('invalid')).toBe(0);
    });
  });

  describe('calculateTargetPcmParams', () => {
    it('returns 16kHz 16-bit for high profile', () => {
      const params = calculateTargetPcmParams(1800, 'high');
      expect(params.targetSampleRate).toBe(16000);
      expect(params.targetBitDepth).toBe(16);
    });

    it('returns 12kHz 16-bit for standard profile', () => {
      const params = calculateTargetPcmParams(1800, 'standard');
      expect(params.targetSampleRate).toBe(12000);
      expect(params.targetBitDepth).toBe(16);
    });

    it('returns 8kHz 8-bit for compact profile', () => {
      const params = calculateTargetPcmParams(1800, 'compact');
      expect(params.targetSampleRate).toBe(8000);
      expect(params.targetBitDepth).toBe(8);
    });

    it('automatically optimizes based on duration to prevent oversized payloads', () => {
      // Short audio (e.g. 5 minutes = 300s) -> 16kHz 16-bit
      const shortAudio = calculateTargetPcmParams(300, 'auto');
      expect(shortAudio.targetSampleRate).toBe(16000);
      expect(shortAudio.targetBitDepth).toBe(16);

      // Very long audio (e.g. 2 hours = 7200s) -> 8kHz 8-bit
      const longAudio = calculateTargetPcmParams(7200, 'auto');
      expect(longAudio.targetSampleRate).toBe(8000);
      expect(longAudio.targetBitDepth).toBe(8);
    });
  });
});
