import { describe, it, expect, vi } from 'vitest';
import {
  formatDurationSeconds,
  parseDurationToSeconds,
  inferDurationFromTranscriptText,
  resolveJobDuration,
  resolveJobDurationSync,
  probeAudioDuration,
  probeAudioDurationSync
} from '../../server/audioDuration';

describe('audioDuration Server Utilities', () => {
  describe('formatDurationSeconds', () => {
    it('formats 0 or invalid inputs with fallback --:--', () => {
      expect(formatDurationSeconds(0)).toBe('--:--');
      expect(formatDurationSeconds(-5)).toBe('--:--');
      expect(formatDurationSeconds(NaN)).toBe('--:--');
    });

    it('formats seconds under 1 hour as MM:SS with zero padding', () => {
      expect(formatDurationSeconds(45)).toBe('00:45');
      expect(formatDurationSeconds(90)).toBe('01:30');
      expect(formatDurationSeconds(599)).toBe('09:59');
      expect(formatDurationSeconds(1958)).toBe('32:38');
    });

    it('formats seconds over 1 hour as H:MM:SS', () => {
      expect(formatDurationSeconds(3600)).toBe('1:00:00');
      expect(formatDurationSeconds(3665)).toBe('1:01:05');
      expect(formatDurationSeconds(7325)).toBe('2:02:05');
    });
  });

  describe('parseDurationToSeconds', () => {
    it('handles null, empty, or --:-- gracefully', () => {
      expect(parseDurationToSeconds(null)).toBe(0);
      expect(parseDurationToSeconds(undefined)).toBe(0);
      expect(parseDurationToSeconds('')).toBe(0);
      expect(parseDurationToSeconds('--:--')).toBe(0);
    });

    it('parses raw numeric string in seconds', () => {
      expect(parseDurationToSeconds('1958')).toBe(1958);
      expect(parseDurationToSeconds('1958.14')).toBe(1958);
    });

    it('parses MM:SS timecodes to total seconds', () => {
      expect(parseDurationToSeconds('00:45')).toBe(45);
      expect(parseDurationToSeconds('32:38')).toBe(1958);
      expect(parseDurationToSeconds('09:59')).toBe(599);
    });

    it('parses H:MM:SS timecodes to total seconds', () => {
      expect(parseDurationToSeconds('1:00:00')).toBe(3600);
      expect(parseDurationToSeconds('1:01:05')).toBe(3665);
      expect(parseDurationToSeconds('2:02:05')).toBe(7325);
    });

    it('returns 0 for malformed timecodes', () => {
      expect(parseDurationToSeconds('abc:def')).toBe(0);
      expect(parseDurationToSeconds('1:2:3:4')).toBe(0);
    });
  });

  describe('inferDurationFromTranscriptText', () => {
    it('returns null for empty or whitespace-only inputs', () => {
      expect(inferDurationFromTranscriptText('', '')).toBeNull();
      expect(inferDurationFromTranscriptText('   ', undefined)).toBeNull();
    });

    it('infers highest MM:SS timestamp from transcript dialogue turns', () => {
      const transcript = `
# Interview
[00:00] **Host**: Welcome.
[05:22] **Guest**: Here is a point.
[32:02] **Host**: Thank you for joining us today!
      `;
      expect(inferDurationFromTranscriptText(transcript)).toBe('32:02');
    });

    it('infers highest H:MM:SS timestamp from chapters or transcript', () => {
      const chapters = `
- [00:00:00] Introduction
- [00:45:10] Architecture Overview
- [01:15:30] Wrap-up & Q&A
      `;
      expect(inferDurationFromTranscriptText(undefined, chapters)).toBe('1:15:30');
    });

    it('picks the maximum timestamp across both transcript and chapters combined', () => {
      const transcript = '[10:15] **Alice**: Midpoint';
      const chapters = '[25:40] Extended Discussion';
      expect(inferDurationFromTranscriptText(transcript, chapters)).toBe('25:40');
    });
  });

  describe('resolveJobDuration and resolveJobDurationSync', () => {
    it('returns existing valid duration if already present', async () => {
      const job = {
        duration: '45:00',
        transcript: '[10:00] Something'
      };
      expect(resolveJobDurationSync(job)).toBe('45:00');
      expect(await resolveJobDuration(job)).toBe('45:00');
    });

    it('falls back to transcript timestamp inference when duration is empty or --:--', async () => {
      const job = {
        duration: '--:--',
        transcript: '[00:00] Start\n[18:45] Conclusion',
        chapters: ''
      };
      expect(resolveJobDurationSync(job)).toBe('18:45');
      expect(await resolveJobDuration(job)).toBe('18:45');
    });

    it('returns --:-- when neither audio file nor timestamps exist', async () => {
      const job = {
        duration: '',
        transcript: 'No timestamps here',
        chapters: ''
      };
      expect(resolveJobDurationSync(job)).toBe('--:--');
      expect(await resolveJobDuration(job)).toBe('--:--');
    });
  });

  describe('probeAudioDuration & probeAudioDurationSync', () => {
    it('returns null for empty or non-existent file path', async () => {
      expect(probeAudioDurationSync('')).toBeNull();
      expect(probeAudioDurationSync('/non/existent/audio.mp3')).toBeNull();
      expect(await probeAudioDuration('')).toBeNull();
      expect(await probeAudioDuration('/non/existent/audio.mp3')).toBeNull();
    });
  });
});
