export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function parseTimestampToSeconds(ts: string): number {
  if (!ts) return 0;
  const match = ts.match(/\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?/);
  if (!match) return 0;
  
  if (match[3] !== undefined) {
    // [HH:MM:SS]
    return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
  }
  // [MM:SS]
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

export function calculateTargetPcmParams(
  durationSeconds: number,
  profile: 'high' | 'standard' | 'compact' | 'auto' = 'auto'
): { targetSampleRate: number; targetBitDepth: 8 | 16 } {
  let targetSampleRate = 16000;
  let targetBitDepth: 8 | 16 = 16;

  if (profile === 'high') {
    targetSampleRate = 16000;
    targetBitDepth = 16;
  } else if (profile === 'standard') {
    targetSampleRate = 12000;
    targetBitDepth = 16;
  } else if (profile === 'compact') {
    targetSampleRate = 8000;
    targetBitDepth = 8;
  } else {
    // 'auto' mode: calculate duration and keep file size under 25MB
    const targetMaxSizeBytes = 25 * 1024 * 1024; // 25MB safe limit
    if (durationSeconds * 16000 * 2 <= targetMaxSizeBytes) {
      targetSampleRate = 16000;
      targetBitDepth = 16;
    } else if (durationSeconds * 16000 * 1 <= targetMaxSizeBytes) {
      targetSampleRate = 16000;
      targetBitDepth = 8;
    } else if (durationSeconds * 12000 * 1 <= targetMaxSizeBytes) {
      targetSampleRate = 12000;
      targetBitDepth = 8;
    } else {
      targetSampleRate = 8000;
      targetBitDepth = 8;
    }
  }

  return { targetSampleRate, targetBitDepth };
}
