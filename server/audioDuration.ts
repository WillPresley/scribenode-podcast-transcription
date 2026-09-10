/**
 * ScribeNode Audio Duration Probing and Inference Utilities
 * Accurately extracts audio durations from media files using ffprobe,
 * with resilient fallback to transcript/chapter timestamp inference.
 */

import { execFile, execFileSync } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = util.promisify(execFile);

/**
 * Validates and normalizes audio file paths to prevent path traversal (CWE-22)
 * and ensure files are accessed only from allowed application and temporary directories.
 */
export function getSafeAudioPath(filePath?: string | null): string | null {
  if (!filePath || typeof filePath !== 'string' || filePath.includes('\0')) {
    return null;
  }
  const resolved = path.resolve(filePath);
  const tempDir = path.resolve(os.tmpdir());
  const cwdDir = path.resolve(process.cwd());

  if (
    !resolved.startsWith(tempDir) &&
    !resolved.startsWith(cwdDir) &&
    !resolved.startsWith('/tmp') &&
    !resolved.startsWith('/app')
  ) {
    return null;
  }
  return resolved;
}

/**
 * Formats seconds into standard audio time format: MM:SS or H:MM:SS.
 * e.g. 1958 -> "32:38", 3665 -> "1:01:05"
 */
export function formatDurationSeconds(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return "--:--";
  const totalSec = Math.round(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parses duration string (e.g. "32:38", "1:05:20", or "1958") into total seconds.
 */
export function parseDurationToSeconds(duration?: string | null): number {
  if (!duration) return 0;
  const clean = duration.trim();
  if (!clean || clean === "--:--") return 0;

  // Raw seconds string (e.g. "1958" or "1958.14")
  if (!clean.includes(":") && !isNaN(Number(clean))) {
    const n = parseFloat(clean);
    return n > 0 ? Math.floor(n) : 0;
  }

  const parts = clean.split(":").map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Asynchronously probes an audio file using ffprobe.
 * Returns duration in seconds, or null if probe failed or file does not exist.
 */
export async function probeAudioDuration(filePath: string): Promise<number | null> {
  const safePath = getSafeAudioPath(filePath);
  if (!safePath) return null;
  try {
    if (!fs.existsSync(safePath)) return null;

    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      safePath
    ], { timeout: 8000 });

    const dur = parseFloat(stdout.trim());
    if (!isNaN(dur) && dur > 0) {
      return dur;
    }
  } catch (err) {
    // ffprobe failed or timed out
  }
  return null;
}

/**
 * Synchronously probes an audio file using ffprobe.
 * Suitable for synchronous storage boot and data seeding.
 */
export function probeAudioDurationSync(filePath: string): number | null {
  const safePath = getSafeAudioPath(filePath);
  if (!safePath) return null;
  try {
    if (!fs.existsSync(safePath)) return null;

    const stdout = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      safePath
    ], { encoding: 'utf8', timeout: 5000 });

    const dur = parseFloat(stdout.trim());
    if (!isNaN(dur) && dur > 0) {
      return dur;
    }
  } catch (err) {
    // ffprobe failed or timed out
  }
  return null;
}

/**
 * Extracts the maximum timestamp from a transcript or chapter text.
 * Returns formatted duration string (e.g. "32:02") or null.
 */
export function inferDurationFromTranscriptText(transcript?: string, chapters?: string): string | null {
  const text = `${transcript || ""}\n${chapters || ""}`;
  if (!text.trim()) return null;

  const matches = text.matchAll(/\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?/g);
  let maxSeconds = 0;

  for (const match of matches) {
    let sec = 0;
    if (match[3] !== undefined) {
      sec = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
    } else {
      sec = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
    if (sec > maxSeconds) {
      maxSeconds = sec;
    }
  }

  if (maxSeconds > 0) {
    return formatDurationSeconds(maxSeconds);
  }
  return null;
}

/**
 * Resolves the best available duration for a job:
 * 1. Returns existing valid duration if present
 * 2. Probes local audio file via ffprobe
 * 3. Infers maximum timestamp from transcript and chapters
 * 4. Falls back to "--:--"
 */
export async function resolveJobDuration(job: {
  duration?: string;
  localFilePath?: string;
  transcript?: string;
  chapters?: string;
}): Promise<string> {
  if (job.duration && job.duration.trim() !== "" && job.duration !== "--:--") {
    return job.duration;
  }

  if (job.localFilePath) {
    const probedSec = await probeAudioDuration(job.localFilePath);
    if (probedSec && probedSec > 0) {
      return formatDurationSeconds(probedSec);
    }
  }

  const inferred = inferDurationFromTranscriptText(job.transcript, job.chapters);
  if (inferred && inferred !== "--:--") {
    return inferred;
  }

  return "--:--";
}

/**
 * Synchronous resolution of duration for a job.
 */
export function resolveJobDurationSync(job: {
  duration?: string;
  localFilePath?: string;
  transcript?: string;
  chapters?: string;
}): string {
  if (job.duration && job.duration.trim() !== "" && job.duration !== "--:--") {
    return job.duration;
  }

  if (job.localFilePath) {
    const probedSec = probeAudioDurationSync(job.localFilePath);
    if (probedSec && probedSec > 0) {
      return formatDurationSeconds(probedSec);
    }
  }

  const inferred = inferDurationFromTranscriptText(job.transcript, job.chapters);
  if (inferred && inferred !== "--:--") {
    return inferred;
  }

  return "--:--";
}
