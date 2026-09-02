import { AnalysisMode } from '../types';

export const EXCLUDED_SPEAKER_KEYWORDS = /^(hosts?|chapter|section|part|takeaway|takeaways|summary|notes|episode|title|time|timestamp|minutes?|seconds?|intro|outro|sponsor|ad|break|commercial|transcript|discussion|conclusion|key|overview|points?)$/i;

export const inferPodcastTitle = (filename: string, text: string): string => {
  // Check for H1 header in markdown text
  const h1Match = text.match(/^#\s+(.+)$/m);
  if (h1Match && h1Match[1].trim()) {
    return h1Match[1].replace(/\*\*/g, '').replace(/__/g, '').trim();
  }

  // Clean filename
  let cleanName = filename.replace(/\.[^/.]+$/, ""); // strip extension
  cleanName = cleanName.replace(/[_-]+/g, " "); // replace underscores/hyphens with spaces
  cleanName = cleanName.replace(/\b(audio|recording|final|master|edit|mix|track|raw|sync|v\d+)\b/gi, "").trim();

  // Capitalize words
  return cleanName
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Podcast Transcript";
};

export const inferSpeakers = (rawText: string): string[] => {
  if (!rawText) return [];

  // Check if explicit Hosts line exists in text (e.g. "**Hosts:** *Name 1, Name 2*")
  const explicitHostsMatch = rawText.match(/^\s*(?:\*\*)?Hosts?:?(?:\*\*)?:?\s*\*?([^\n\r*]+)\*?/im);
  if (explicitHostsMatch && explicitHostsMatch[1]) {
    const rawHostsStr = explicitHostsMatch[1].trim();
    const candidateHosts = rawHostsStr
      .split(/[,&/]| and /i)
      .map(h => h.replace(/[*_#\[\]`]/g, '').trim())
      .filter(h => h.length > 1 && h.length < 35 && !/[,?!]/.test(h) && !EXCLUDED_SPEAKER_KEYWORDS.test(h));

    if (candidateHosts.length > 0) {
      return candidateHosts;
    }
  }

  // Look for bolded speaker names or [MM:SS] Speaker lines
  const lines = rawText.split('\n');
  const speakersSet = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;

    // Pattern 1: [00:12] **Speaker Name**: or [00:12] SPEAKER A:
    const tsMatch = trimmed.match(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*(?:\*\*)?([^:*_\n\r]+?)(?:\*\*)?:\s*(.*)/s);
    if (tsMatch) {
      const name = tsMatch[1].replace(/[*_#\[\]`]/g, '').trim();
      if (name && name.length < 35 && !/[,?!]/.test(name) && !EXCLUDED_SPEAKER_KEYWORDS.test(name)) {
        speakersSet.add(name);
      }
      continue;
    }

    // Pattern 2: **Speaker Name**: speech
    const boldMatch = trimmed.match(/^\*\*([^*:]+)\*\*:\s*(.*)/s);
    if (boldMatch) {
      const name = boldMatch[1].replace(/[*_#\[\]`]/g, '').trim();
      if (name && name.length < 35 && !/[,?!]/.test(name) && !EXCLUDED_SPEAKER_KEYWORDS.test(name)) {
        speakersSet.add(name);
      }
      continue;
    }

    // Pattern 3: Speaker Name: speech
    const plainMatch = trimmed.match(/^([A-Z][A-Za-z0-9\s]{1,30}):\s*(.*)/s);
    if (plainMatch) {
      const name = plainMatch[1].trim();
      if (name && name.length < 35 && !/[,?!]/.test(name) && !EXCLUDED_SPEAKER_KEYWORDS.test(name) && !name.includes('[') && !name.includes(']')) {
        speakersSet.add(name);
      }
    }
  }

  return Array.from(speakersSet);
};

export const stripExistingHeader = (text: string): string => {
  if (!text) return "";
  let lines = text.split('\n');

  while (lines.length > 0 && !lines[0].trim()) {
    lines.shift();
  }

  let stripped = true;
  while (stripped && lines.length > 0) {
    stripped = false;
    const line = lines[0].trim();

    if (/^#\s+/.test(line)) {
      lines.shift();
      stripped = true;
    } else if (/^\*\*Hosts:\*\*|^\s*Hosts:/i.test(line)) {
      lines.shift();
      stripped = true;
    } else if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      lines.shift();
      stripped = true;
    }

    while (lines.length > 0 && !lines[0].trim()) {
      lines.shift();
    }
  }

  return lines.join('\n');
};

export const cleanMarkdownHeaders = (mdText: string): string => {
  return mdText.split('\n').map(line => {
    if (/^\s*#+\s+/.test(line)) {
      return line
        .replace(/\*\*/g, '')
        .replace(/__/g, '');
    }
    return line;
  }).join('\n');
};

export const stripMarkdown = (md: string): string => {
  let text = md;
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, "");
  text = text.replace(/^\s*(#+)\s*(.*)/gm, "$2");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/__(.*?)__/g, "$1");
  text = text.replace(/\*(.*?)\*/g, "$1");
  text = text.replace(/_(.*?)_/g, "$1");
  text = text.replace(/`(.*?)`/g, "$1");
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, "$1");
  text = text.replace(/^\s*>\s*(.*)/gm, "$1");
  return text;
};

export const boldSpeakerNamesInMarkdown = (text: string): string => {
  return text.split('\n').map(line => {
    const doubleMatch = line.match(/^(\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*)([^:]+)(:\s*.*)/s);
    if (doubleMatch) {
      const prefix = doubleMatch[1];
      const speaker = doubleMatch[3].trim();
      const suffix = doubleMatch[4];
      
      const cleanSpeaker = speaker.replace(/[*_#\[\]`]/g, "").trim();

      if (cleanSpeaker && cleanSpeaker.length < 35 && !/[,?!]/.test(cleanSpeaker) && !EXCLUDED_SPEAKER_KEYWORDS.test(cleanSpeaker)) {
        return `${prefix}**${cleanSpeaker}**${suffix}`;
      }
    }
    
    const speakerOnlyMatch = line.match(/^([^:]+)(:\s*.*)/s);
    if (speakerOnlyMatch) {
      const speaker = speakerOnlyMatch[1].trim();
      const suffix = speakerOnlyMatch[2];
      
      const cleanSpeaker = speaker.replace(/[*_#\[\]`]/g, "").trim();

      if (cleanSpeaker && cleanSpeaker.length < 35 && !/[,?!]/.test(cleanSpeaker) && !EXCLUDED_SPEAKER_KEYWORDS.test(cleanSpeaker) && !cleanSpeaker.includes("[") && !cleanSpeaker.includes("]")) {
        return `**${cleanSpeaker}**${suffix}`;
      }
    }
    
    return line;
  }).join('\n');
};

export const formatExportContent = (
  rawText: string,
  type: "txt" | "md",
  filename: string,
  suffix: string
): string => {
  if (suffix !== "transcript") {
    if (type === "md") {
      return cleanMarkdownHeaders(rawText);
    } else {
      return stripMarkdown(rawText);
    }
  }

  const title = inferPodcastTitle(filename, rawText);
  const speakers = inferSpeakers(rawText);
  const cleanBody = stripExistingHeader(rawText);

  if (type === "md") {
    let header = `# ${title}\n`;
    if (speakers.length > 0) {
      header += `**Hosts:** *${speakers.join(", ")}*\n`;
    }
    header += `\n---\n\n`;
    const boldedTranscript = boldSpeakerNamesInMarkdown(cleanBody);
    return cleanMarkdownHeaders(header + boldedTranscript);
  } else {
    let header = `${title}\n`;
    if (speakers.length > 0) {
      header += `Hosts: ${speakers.join(", ")}\n`;
    }
    header += `========================================\n\n`;
    return stripMarkdown(header + cleanBody);
  }
};

export interface PreviewLine {
  header: string;
  text: string;
  isSpeaker: boolean;
  speakerColorClass: string;
}

export const getPreviewLines = (transcriptText: string): PreviewLine[] => {
  const cleanBody = stripExistingHeader(transcriptText);
  const paragraphs = cleanBody.split(/\n+/).map(p => p.trim()).filter(Boolean);
  
  return paragraphs.slice(0, 15).map((p, index) => {
    const speakerMatch = p.match(/^(\[[^\]]+\]\s*)?(?:\*\*)?([A-Za-z0-9\s]+?)(?:\*\*)?:\s*(.*)/s);
    if (speakerMatch) {
      const timestamp = speakerMatch[1]?.trim() || "";
      const speaker = speakerMatch[2]?.trim() || "";
      const text = speakerMatch[3]?.trim() || "";
      return {
        header: `${timestamp} ${speaker}`.trim(),
        text,
        isSpeaker: true,
        speakerColorClass: index % 2 === 0 ? "text-blue-400" : "text-emerald-400"
      };
    } else {
      const timestampOnlyMatch = p.match(/^(\[[^\]]+\])\s*(.*)/s);
      if (timestampOnlyMatch) {
        return {
          header: timestampOnlyMatch[1],
          text: timestampOnlyMatch[2],
          isSpeaker: false,
          speakerColorClass: "text-blue-400"
        };
      }
      return {
        header: `Paragraph ${index + 1}`,
        text: p,
        isSpeaker: false,
        speakerColorClass: "text-slate-400"
      };
    }
  });
};

export interface SubtitleCue {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export const parseTranscriptToCues = (rawText: string): SubtitleCue[] => {
  const cleanBody = stripExistingHeader(rawText);
  const paragraphs = cleanBody.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const cues: SubtitleCue[] = [];

  const timestampRegex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/;
  
  let currentStart = 0;
  let cueIndex = 1;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const match = p.match(timestampRegex);
    
    if (match) {
      let seconds = 0;
      if (match[3] !== undefined) {
        // [HH:MM:SS]
        seconds = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
      } else {
        // [MM:SS]
        seconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      }
      currentStart = seconds;
    }

    // Clean text without bracket timestamps for subtitle readability
    let cueText = p.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, '').trim();
    cueText = stripMarkdown(cueText);

    if (cueText) {
      // Default duration heuristic: 5-8 seconds per cue or until next timestamp
      let endSeconds = currentStart + Math.max(4, Math.min(12, Math.ceil(cueText.length / 15)));
      
      cues.push({
        index: cueIndex++,
        startSeconds: currentStart,
        endSeconds,
        text: cueText
      });

      currentStart = endSeconds;
    }
  }

  // Adjust overlapping cues
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].endSeconds > cues[i + 1].startSeconds && cues[i + 1].startSeconds > cues[i].startSeconds) {
      cues[i].endSeconds = cues[i + 1].startSeconds;
    }
  }

  return cues;
};

export const formatSecondsToTimecode = (totalSeconds: number, format: 'srt' | 'vtt'): string => {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = Math.floor(s % 60);
  const millis = Math.floor((s - Math.floor(s)) * 1000);

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  const mmm = millis.toString().padStart(3, '0');

  if (format === 'srt') {
    return `${hh}:${mm}:${ss},${mmm}`;
  } else {
    return `${hh}:${mm}:${ss}.${mmm}`;
  }
};

export const convertTranscriptToVtt = (rawText: string, title?: string): string => {
  const cues = parseTranscriptToCues(rawText);
  let vtt = "WEBVTT";
  if (title) {
    vtt += ` - ${title}`;
  }
  vtt += "\n\n";

  for (const cue of cues) {
    const startStr = formatSecondsToTimecode(cue.startSeconds, 'vtt');
    const endStr = formatSecondsToTimecode(cue.endSeconds, 'vtt');
    vtt += `${startStr} --> ${endStr}\n${cue.text}\n\n`;
  }

  return vtt.trim() + "\n";
};

export const convertTranscriptToSrt = (rawText: string): string => {
  const cues = parseTranscriptToCues(rawText);
  let srt = "";

  for (const cue of cues) {
    const startStr = formatSecondsToTimecode(cue.startSeconds, 'srt');
    const endStr = formatSecondsToTimecode(cue.endSeconds, 'srt');
    srt += `${cue.index}\n${startStr} --> ${endStr}\n${cue.text}\n\n`;
  }

  return srt.trim() + "\n";
};

export const formatModelDisplayName = (modelId?: string): string => {
  if (!modelId) return "Gemini 3.8 Flash";
  switch (modelId) {
    case "gemini-3.8-flash":
      return "Gemini 3.8 Flash";
    case "gemini-3.7-flash":
      return "Gemini 3.7 Flash";
    case "gemini-3.5-transcribe":
      return "Gemini 3.5 Transcribe";
    case "gemini-3.6-flash":
      return "Gemini 3.6 Flash";
    case "gemini-3.5-flash":
      return "Gemini 3.5 Flash";
    case "gemini-2.5-flash":
      return "Gemini 2.5 Flash";
    case "gemini-3.5-flash-lite":
      return "Gemini 3.5 Flash Lite";
    case "gemini-3.1-flash-lite":
      return "Gemini 3.1 Flash Lite";
    case "gemini-2.5-flash-lite":
      return "Gemini 2.5 Flash Lite";
    case "gemini-flash-lite-latest":
      return "Gemini Flash Lite Latest";
    case "gemini-flash-latest":
      return "Gemini Flash Latest";
    default:
      return modelId
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
};

export interface TranscriptSegment {
  id: string;
  index: number;
  rawText: string;
  timestamp: string;
  startSeconds: number;
  endSeconds: number;
  speaker: string;
  speechText: string;
}

export const parseTimestampSeconds = (timestampStr: string): number => {
  if (!timestampStr) return 0;
  const clean = timestampStr.replace(/[[\]]/g, '').trim();
  const parts = clean.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
};

export const formatPlaybackTime = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    const hh = hours.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
};

export const parseTranscriptSegments = (rawText: string): TranscriptSegment[] => {
  if (!rawText) return [];
  const cleanBody = stripExistingHeader(rawText);
  const lines = cleanBody.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const segments: TranscriptSegment[] = [];

  let currentStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse matches
    const doubleMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.*)/s);
    const tsOnlyMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)/s);
    const speakerOnlyMatch = line.match(/^([^:]+):\s*(.*)/s);

    let timestamp = "";
    let speaker = "";
    let speechText = line;
    let startSec = currentStart;

    if (doubleMatch) {
      timestamp = `[${doubleMatch[1]}]`;
      startSec = parseTimestampSeconds(doubleMatch[1]);
      speaker = doubleMatch[2].replace(/[*_#\[\]`]/g, "").trim();
      speechText = doubleMatch[3];
    } else if (tsOnlyMatch) {
      timestamp = `[${tsOnlyMatch[1]}]`;
      startSec = parseTimestampSeconds(tsOnlyMatch[1]);
      speechText = tsOnlyMatch[2];
    } else if (speakerOnlyMatch && speakerOnlyMatch[1].trim().length < 35 && !speakerOnlyMatch[1].includes("\n")) {
      const candidate = speakerOnlyMatch[1].replace(/[*_#\[\]`]/g, "").trim();
      const words = candidate.split(/\s+/);
      const isKeyword = words.some(w => EXCLUDED_SPEAKER_KEYWORDS.test(w.replace(/[^a-zA-Z]/g, '')));
      if (!isKeyword && !/[,?!]/.test(candidate)) {
        speaker = candidate;
        speechText = speakerOnlyMatch[2];
      }
    }

    currentStart = startSec;
    // Estimate endSeconds heuristic based on word length or until next item
    const cleanSpeech = stripMarkdown(speechText);
    const estimatedDuration = Math.max(3, Math.min(15, Math.ceil(cleanSpeech.length / 14)));
    const endSec = startSec + estimatedDuration;

    segments.push({
      id: `seg-${i}`,
      index: i,
      rawText: line,
      timestamp,
      startSeconds: startSec,
      endSeconds: endSec,
      speaker,
      speechText: speechText.trim(),
    });
  }

  // Adjust contiguous endSeconds so each cue leads cleanly into the next
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i + 1].startSeconds > segments[i].startSeconds) {
      segments[i].endSeconds = segments[i + 1].startSeconds;
    }
  }

  return segments;
};

export const findActiveSegmentIndex = (segments: TranscriptSegment[], currentTime: number): number => {
  if (!segments || segments.length === 0) return -1;
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (currentTime >= seg.startSeconds && currentTime < seg.endSeconds) {
      return i;
    }
  }

  // Fallback: If currentTime is past the last segment start, highlight last segment
  if (currentTime >= segments[segments.length - 1].startSeconds) {
    return segments.length - 1;
  }

  return 0;
};


