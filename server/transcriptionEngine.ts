import { GoogleGenAI, AudioTranscriptionConfigMode, AudioTranscriptionConfig } from "@google/genai";

export { AudioTranscriptionConfigMode };
export type { AudioTranscriptionConfig };

/**
 * Maps ScribeNode prompt styles to @google/genai AudioTranscriptionConfigMode.
 * 'verbatim' maps to AudioTranscriptionConfigMode.VERBATIM.
 * 'clean', 'combined', 'timestamped', 'custom' map to AudioTranscriptionConfigMode.SMART (disfluency & filler filtering).
 */
export function mapPromptStyleToTranscriptionMode(promptStyle?: string): AudioTranscriptionConfigMode {
  if (!promptStyle) return AudioTranscriptionConfigMode.SMART;
  switch (promptStyle) {
    case 'verbatim':
      return AudioTranscriptionConfigMode.VERBATIM;
    case 'clean':
    case 'combined':
    case 'timestamped':
    case 'custom':
    default:
      return AudioTranscriptionConfigMode.SMART;
  }
}

/**
 * Helper to construct a structured AudioTranscriptionConfig object for speech recognition.
 */
export function buildAudioTranscriptionConfig(options?: {
  promptStyle?: string;
  languageCodes?: string[];
  customVocabulary?: string[];
  diarization?: boolean;
  wordTimestamp?: boolean;
}): AudioTranscriptionConfig {
  const config: AudioTranscriptionConfig = {};
  const style = options?.promptStyle;

  // Determine if diarization is requested (Combined or Verbatim default to true)
  const needsDiarization = options?.diarization !== undefined
    ? options.diarization
    : (style === 'combined' || style === 'verbatim');

  // Determine if word timestamps are requested (Combined or Timestamped default to true)
  const needsWordTimestamps = options?.wordTimestamp !== undefined
    ? options.wordTimestamp
    : (style === 'combined' || style === 'timestamped');

  if (options?.promptStyle) {
    // In Gemini API, SMART mode is incompatible with diarization & timestamps.
    // When diarization or timestamps are enabled (or when style is verbatim), use VERBATIM mode.
    if (needsDiarization || needsWordTimestamps || style === 'verbatim') {
      config.mode = AudioTranscriptionConfigMode.VERBATIM;
    } else {
      config.mode = AudioTranscriptionConfigMode.SMART;
    }
  }

  if (options?.diarization !== undefined || style) {
    config.diarization = needsDiarization;
  }
  if (options?.wordTimestamp !== undefined || style) {
    config.wordTimestamp = needsWordTimestamps;
  }

  if (options?.languageCodes && options.languageCodes.length > 0) {
    config.languageCodes = options.languageCodes;
  }
  if (options?.customVocabulary && options.customVocabulary.length > 0) {
    config.customVocabulary = options.customVocabulary;
  }
  return config;
}

export const BASE_TRANSCRIPTION_STANDARDS = `# Role & Operational Goal
You are an expert audio transcriptionist and content editor. Your task is to convert provided audio/video recordings into clean, highly readable, publication-ready Markdown transcripts.

Follow these strict output and formatting standards regardless of default model behavior:

---

## 1. Strict Output Rules & Zero Preambles
* **NO Meta-Text or Conversational Commentary:** Start IMMEDIATELY with the transcript document. Do NOT output phrases like "Here is the transcript...", "Sure!", or introductory summaries.
* **Single Top-Level Title:** Include exactly ONE H1 header (\`# Title\`) at the very top of the output. Never repeat or create secondary H1 headers.
* **No Unnecessary Horizontal Rules:** Do not wrap headers or sections in \`---\` unless separating major document sections.

---

## 2. Speaker Tag & Timestamp Syntax (Strict Markdown)
* **Exact Syntax Pattern:** Format timestamped speaker lines using EXACTLY this pattern:
  \`[MM:SS] **Speaker Name**: Spoken text here.\`
* **Avoid Malformed Bold Syntax:** Ensure closing asterisks (\`**\`) are placed BEFORE the colon or immediately around the name. NEVER output mangled strings like \`**Name**:**\`.
* **Continuous Speaker Flow:** Do not repeat the speaker tag every few paragraphs if the same person is continuously speaking. Only introduce a timestamp and speaker tag at the start of the transcript or during actual speaker switches / major structural topic shifts.

---

## 3. Transcription Style: Polished Clean Verbatim
* **Remove Speech Disfluencies:** Eliminate all vocal fillers, hesitation sounds, and pause words (e.g., "uh", "um", "er", "like", "you know", "ah").
* **Remove Stutters & Duplications:** Strip out accidentally repeated words, false starts, and speech stutters (e.g., convert "and and" to "and", "if you if you" to "if you").
* **Smooth Out Restarts:** Clean up minor mid-sentence self-corrections into smooth, grammatically correct sentences without altering the speaker's core intent or meaning.
* **Preserve Speaker Voice:** Maintain the speaker's vocabulary, formal/informal tone, and technical terminology while removing conversational clutter.

---

## 4. Contextual & Semantic Accuracy (Domain Intelligence)
* **Context Over Raw Phonetics:** Do NOT transcribe slurred or mumbled speech phonetically. Use surrounding sentence context, speaker background, and industry domain knowledge to infer and correct acoustic ambiguities (e.g., prefer domain terms like "juggling ball" over phonetically similar non-sequiturs like "juggling Cohen").
* **Proper Nouns & Entities:** Standardize capitalization, official product names, book titles, business concepts, and proper nouns (e.g., *Execution*, Manager Tools).

---

## 5. Structure & Paragraphing
* **Paragraph Density:** Group related thoughts into natural, cohesive paragraphs. Avoid breaking every sentence or short phrase into its own line.
* **Macro Timestamps:** Apply timestamps sparingly at major section transitions.`;

export function getSystemInstruction(style: string): string {
  switch (style) {
    case 'combined':
      return `${BASE_TRANSCRIPTION_STANDARDS}

---

## 6. Speaker Identification & Layout (Combined Mode)
1. **HEADER:** Start the document with exactly ONE top-level H1 title line: "# Title of Recording".
2. **HOSTS / SPEAKERS:** If speakers or hosts are identified in the audio/recording, include "**Hosts:** *Host Name 1, Host Name 2*" on the line immediately following the title line. **CRITICAL:** Strictly list ONLY proper human names on the Hosts line (e.g., "**Hosts:** *Mike Auzenne, Mark Horstman*"). NEVER include surrounding spoken words, dialogue fragments, transition phrases, spoken numbers, or conversational commentary. If host names cannot be identified with certainty, list consistent speaker labels (e.g., "**Hosts:** *Speaker A, Speaker B*") or omit the Hosts line.
3. **DIVIDER:** Add a horizontal rule "---" on its own line below the title/hosts header, followed by a blank line.
4. **NO DUPLICATE HEADERS:** Do NOT add secondary title lines or repeat the header after the "---" line.
5. **SPEAKER NAME INFERENCE:** Carefully analyze dialogue to infer actual names of speakers (e.g. "[00:12] **Mark Horstman**:"). If names cannot be inferred, use consistent speaker IDs (e.g. "[00:12] **Speaker A**:").
6. **SPEAKER TURNS:** Group continuous speech from the same speaker into cohesive paragraphs. Prepend the timestamp and bold speaker tag ONCE at the start of their turn ("[MM:SS] **Speaker Name**:"). Insert a blank line before new speaker turns.
7. **EXAMPLE FORMAT:**
# How to Choose What to Delegate
**Hosts:** *Mark Horstman*

---

[00:00] **Mark Horstman**: Welcome to Manager Tools. Today we are talking about delegation.

[01:15] **Speaker B**: Exactly. We have four points today...`;

    case 'timestamped':
      return `${BASE_TRANSCRIPTION_STANDARDS}

---

## 6. Timestamps Layout
1. **HEADER:** Start the document with exactly ONE top-level H1 title line: "# Title of Recording".
2. **HOSTS / SPEAKERS:** If speakers or hosts are identified in the recording, include "**Hosts:** *Host Name 1, Host Name 2*" on the line immediately following the title line.
3. **DIVIDER:** Add a horizontal rule "---" on its own line below the title/hosts header, followed by a blank line.
4. **TIMESTAMPS:** Add clear macro timestamps in the format "[MM:SS]" or "[HH:MM:SS]" at the beginning of each natural paragraph or major topic shift. Place each timestamped paragraph on its own line separated by a blank line. Do not summarize or skip content.`;

    case 'verbatim':
      return `${BASE_TRANSCRIPTION_STANDARDS}

---

## 6. Speaker Identification Layout
1. **HEADER:** Start the document with exactly ONE top-level H1 title line: "# Title of Recording".
2. **HOSTS / SPEAKERS:** If speakers or hosts are identified in the recording, include "**Hosts:** *Host Name 1, Host Name 2*" on the line immediately following the title line.
3. **DIVIDER:** Add a horizontal rule "---" on its own line below the title/hosts header, followed by a blank line.
4. **SPEAKER TURNS:** Infer speaker names from conversational context or use consistent IDs (e.g. "**Mark Horstman**:", "**Speaker A**:"). Group continuous speech into cohesive paragraphs. Insert a blank line between speaker turns.`;

    case 'clean':
    default:
      return `${BASE_TRANSCRIPTION_STANDARDS}

---

## 6. Layout
1. **HEADER:** Start the document with exactly ONE top-level H1 title line: "# Title of Recording".
2. **HOSTS / SPEAKERS:** If speakers or hosts are identified in the recording, include "**Hosts:** *Host Name 1, Host Name 2*" on the line immediately following the title line.
3. **DIVIDER:** Add a horizontal rule "---" on its own line below the title/hosts header, followed by a blank line.
4. Natural, clean paragraphs following the header.`;
  }
}

/**
 * Dedicated prompt generator for gemini-3.5-transcribe.
 * This model natively performs disfluency removal, multi-speaker diarization, and timestamping.
 * The prompt focuses on precise Markdown schema, speaker attribution, and clean layout.
 */
export function buildTranscribeModelPrompt(promptStyle: string, customPrompt?: string, customVocabulary?: string[] | string): string {
  let vocabInstruction = "";
  if (customVocabulary) {
    const terms = Array.isArray(customVocabulary) ? customVocabulary.filter(Boolean).join(", ") : customVocabulary.trim();
    if (terms) {
      vocabInstruction = `\n\nDomain Glossary & Vocabulary Hints:\nPlease accurately transcribe and prioritize spelling for these key terms, host/guest names, and domain vocabulary: ${terms}.`;
    }
  }

  if (customPrompt && customPrompt.trim()) {
    return `${customPrompt.trim()}${vocabInstruction}

Output Format Requirements:
- Start directly with exactly one H1 title (# Title).
- If hosts or speakers are identified, include "**Hosts:** *Host 1, Host 2*" on the line below the title, followed by "---".
- Output clean Markdown directly with no introductory preambles or code fences.`;
  }

  switch (promptStyle) {
    case 'combined':
      return `Transcribe this audio recording into a clean, publication-ready Markdown transcript.${vocabInstruction}

Document Layout:
# [Title of Recording]
**Hosts:** *[Identified Host / Speaker Names]*

---

[00:00] **[Speaker Name]**: [Spoken text for this turn]

[01:15] **[Speaker Name]**: [Spoken text for this turn]

Formatting Rules:
1. Start directly with exactly ONE H1 title line (# Title).
2. If hosts or speakers are identifiable, add "**Hosts:** *Name 1, Name 2*" immediately below the title, followed by a horizontal rule "---".
3. For each speaker turn, prepend the macro timestamp and bold speaker tag: "[MM:SS] **Speaker Name**:" (e.g. "[00:15] **Mark Horstman**:"). Infer actual names from dialogue introductions, or use consistent labels (e.g. "**Speaker A**").
4. Group continuous speech into cohesive paragraphs. Insert a blank line between speaker turns.
5. Return pure Markdown directly with no preambles, meta-commentary, or markdown code-block fences.`;

    case 'timestamped':
      return `Transcribe this audio recording into a clean, publication-ready Markdown transcript with paragraph timestamps.${vocabInstruction}

Document Layout:
# [Title of Recording]
**Hosts:** *[Identified Host / Speaker Names]*

---

[00:00] [Spoken paragraph text]

[01:30] [Spoken paragraph text]

Formatting Rules:
1. Start directly with exactly ONE H1 title line (# Title).
2. If hosts or speakers are identifiable, add "**Hosts:** *Name 1, Name 2*" immediately below the title, followed by "---".
3. Prepend timestamps in "[MM:SS]" or "[HH:MM:SS]" format at the start of each natural paragraph or major topic transition.
4. Do not include speaker names in this mode.
5. Return pure Markdown directly with no preambles or commentary.`;

    case 'verbatim':
      return `Transcribe this audio recording into a clean, publication-ready Markdown transcript with speaker identification.${vocabInstruction}

Document Layout:
# [Title of Recording]
**Hosts:** *[Identified Host / Speaker Names]*

---

**[Speaker Name]**: [Spoken paragraph text]

**[Speaker Name]**: [Spoken paragraph text]

Formatting Rules:
1. Start directly with exactly ONE H1 title line (# Title).
2. If hosts or speakers are identifiable, add "**Hosts:** *Name 1, Name 2*" immediately below the title, followed by "---".
3. Prepend each speaker turn with a bold speaker name (e.g. "**Mark Horstman**:"). Infer names from dialogue context or use consistent labels ("**Speaker A**").
4. Group continuous speech into cohesive paragraphs separated by blank lines. Do not include timestamps in this mode.
5. Return pure Markdown directly with no preambles or commentary.`;

    case 'clean':
    default:
      return `Transcribe this audio recording into a clean, publication-ready Markdown transcript.${vocabInstruction}

Document Layout:
# [Title of Recording]
**Hosts:** *[Identified Host / Speaker Names]*

---

[Spoken paragraph text]

[Spoken paragraph text]

Formatting Rules:
1. Start directly with exactly ONE H1 title line (# Title).
2. If hosts or speakers are identifiable, add "**Hosts:** *Name 1, Name 2*" immediately below the title, followed by "---".
3. Organize the transcribed text into natural, readable paragraphs separated by blank lines. Do not include speaker names or timestamps.
4. Return pure Markdown directly with no preambles or commentary.`;
  }
}

/**
 * Prompt generator for general reasoning fallback models (gemini-3.7-flash, gemini-3.6-flash, etc.).
 * Paired with getSystemInstruction() for comprehensive clean-verbatim rules.
 */
export function buildTranscriptionPrompt(promptStyle: string, customPrompt?: string, customVocabulary?: string[] | string): string {
  let basePrompt = "";
  if (customPrompt && customPrompt.trim()) {
    basePrompt = customPrompt.trim();
  } else if (promptStyle === 'combined') {
    basePrompt = "Please transcribe this audio recording into clean, publication-ready Markdown starting with exactly ONE H1 title line (# Title), followed by the identified hosts (**Hosts:** *Name 1, Name 2*), a horizontal divider (---), and timestamped speaker turns ([MM:SS] **Speaker Name**:), adhering strictly to the clean verbatim standards.";
  } else if (promptStyle === 'timestamped') {
    basePrompt = "Please transcribe this recording in Markdown format starting with exactly ONE H1 title line (# Title), followed by macro timestamps [MM:SS] or [HH:MM:SS] at natural paragraph breaks, adhering strictly to the polished clean verbatim transcription standards.";
  } else if (promptStyle === 'verbatim') {
    basePrompt = "Please transcribe this recording in Markdown format starting with exactly ONE H1 title line (# Title), with clearly identified speaker turns, adhering strictly to the polished clean verbatim transcription standards.";
  } else {
    basePrompt = "Please transcribe this entire recording following the strict polished clean verbatim standards. Do not summarize or skip spoken content.";
  }

  if (customVocabulary) {
    const terms = Array.isArray(customVocabulary) ? customVocabulary.filter(Boolean).join(", ") : customVocabulary.trim();
    if (terms) {
      basePrompt += `\n\nDomain Glossary & Vocabulary Hints:\nPlease prioritize accuracy for these domain terms, proper nouns, and technical keywords: ${terms}.`;
    }
  }

  return basePrompt;
}

/**
 * Renames a speaker throughout a transcript in a safe, syntactically clean manner.
 * Supports timestamped lines [MM:SS] **Speaker Name**:, verbatim lines **Speaker Name**:,
 * and the **Hosts:** *Host 1, Host 2* line.
 */
export function renameSpeakerInTranscript(transcript: string, oldName: string, newName: string): string {
  if (!transcript || !oldName || !newName || oldName.trim() === newName.trim()) {
    return transcript || "";
  }
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  const escapedOld = cleanOld.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let updated = transcript;

  // 1. Replace timestamped speaker tags: [MM:SS] **Old Name**: -> [MM:SS] **New Name**:
  const timestampRegex = new RegExp(`(\\[\\d{1,2}:\\d{2}(?::\\d{2})?\\]\\s*\\*\\*)${escapedOld}(\\*\\*:)`, "g");
  updated = updated.replace(timestampRegex, `$1${cleanNew}$2`);

  // 2. Replace non-timestamped speaker tags: **Old Name**: -> **New Name**:
  const boldSpeakerRegex = new RegExp(`(^|\\n)(\\*\\*)${escapedOld}(\\*\\*:)`, "g");
  updated = updated.replace(boldSpeakerRegex, `$1$2${cleanNew}$3`);

  // 3. Replace in Hosts line: **Hosts:** *Old Name* or **Hosts:** *..., Old Name, ...*
  const hostsRegex = /(\*\*Hosts:\*\*\s*\*?)([^\n*]+)(\*?)/gi;
  updated = updated.replace(hostsRegex, (match, prefix, namesStr, suffix) => {
    const names = namesStr.split(",").map((n: string) => n.trim());
    const newNames = names.map((n: string) => (n.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : n));
    return `${prefix}${newNames.join(", ")}${suffix}`;
  });

  return updated;
}

/**
 * Extracts distinct identified speakers from a Markdown transcript.
 */
export function extractSpeakersFromTranscript(transcript: string): string[] {
  if (!transcript) return [];
  const speakersSet = new Set<string>();

  // Extract from timestamped tags [MM:SS] **Speaker Name**:
  const tsRegex = /\[\d{1,2}:\\d{2}(?::\d{2})?\]\s*\*\*([^*]+)\*\*:/g;
  let match: RegExpExecArray | null;
  while ((match = tsRegex.exec(transcript)) !== null) {
    const spk = match[1].trim();
    if (spk && !speakersSet.has(spk)) {
      speakersSet.add(spk);
    }
  }

  // Extract from bold tags **Speaker Name**:
  const boldRegex = /(?:^|\n)\*\*([^*]+)\*\*:/g;
  while ((match = boldRegex.exec(transcript)) !== null) {
    const spk = match[1].trim();
    if (spk && !spk.toLowerCase().startsWith("hosts") && !speakersSet.has(spk)) {
      speakersSet.add(spk);
    }
  }

  // Extract from Hosts line if present
  const hostsMatch = transcript.match(/\*\*Hosts:\*\*\s*\*?([^\n*]+)\*?/i);
  if (hostsMatch && hostsMatch[1]) {
    const names = hostsMatch[1].split(",").map(n => n.trim()).filter(Boolean);
    for (const name of names) {
      if (name && !speakersSet.has(name)) {
        speakersSet.add(name);
      }
    }
  }

  return Array.from(speakersSet);
}

export const PRIMARY_TRANSCRIPTION_MODEL = "gemini-3.7-flash";
export const PRIMARY_DOWNSTREAM_MODEL = "gemini-3.7-flash";

export const DEFAULT_DOWNSTREAM_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest"
];

export const DEFAULT_TRANSCRIPTION_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest"
];

export const DEFAULT_ANALYSIS_MODELS = [...DEFAULT_DOWNSTREAM_MODELS];

export const MAX_TRANSCRIBE_MODEL_DURATION_SECONDS = 59 * 60; // 59 minutes = 3540 seconds

export function parseDurationToSeconds(duration?: string | number | null): number | null {
  if (duration === null || duration === undefined) return null;
  if (typeof duration === "number") {
    return isNaN(duration) || duration <= 0 ? null : Math.floor(duration);
  }
  const clean = duration.trim();
  if (!clean || clean === "--:--") return null;

  // Handle plain numbers as seconds (e.g. "3540" or "120.5")
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const num = parseFloat(clean);
    return isNaN(num) || num <= 0 ? null : Math.floor(num);
  }

  // Handle [HH:MM:SS] or HH:MM:SS or [MM:SS] or MM:SS
  const match = clean.match(/\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?/);
  if (!match) return null;

  if (match[3] !== undefined) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseInt(match[3], 10);
    return h * 3600 + m * 60 + s;
  }

  const m = parseInt(match[1], 10);
  const s = parseInt(match[2], 10);
  return m * 60 + s;
}

export function getTranscriptionModelsForJob(duration?: string | number | null): string[] {
  return [...DEFAULT_TRANSCRIPTION_MODELS];
}

export function formatModelDisplayName(modelId?: string): string {
  if (!modelId) return "Gemini 3.7 Flash";
  switch (modelId) {
    case "gemini-3.7-flash":
      return "Gemini 3.7 Flash";
    case "gemini-3.5-transcribe":
      return "Gemini 3.5 Transcribe";
    case "gemini-3.6-flash":
      return "Gemini 3.6 Flash";
    case "gemini-3.5-flash":
      return "Gemini 3.5 Flash";
    case "gemini-3.5-flash-lite":
      return "Gemini 3.5 Flash Lite";
    case "gemini-3.1-flash-lite":
      return "Gemini 3.1 Flash Lite";
    case "gemini-flash-latest":
      return "Gemini Flash Latest";
    default:
      return modelId
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

export function categorizeModelError(err: any): {
  friendlyMessage: string;
  shortBadge: string;
  category: 'high_demand' | 'rate_limit' | 'config_error' | 'auth_error' | 'timeout' | 'not_found' | 'duration_limit' | 'empty_response' | 'general';
} {
  const msg = typeof err === "string" ? err : err?.message || String(err || "");
  const lower = msg.toLowerCase();

  // 1. High Demand / Capacity / 503 / 500 / UNAVAILABLE
  if (
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("high demand") ||
    lower.includes("capacity") ||
    lower.includes("server busy") ||
    lower.includes("service unavailable") ||
    lower.includes("500") ||
    lower.includes("internal server error")
  ) {
    return {
      friendlyMessage: "Model demand too high, try again later",
      shortBadge: "Demand too high (503)",
      category: "high_demand"
    };
  }

  // 2. Rate limits / Quota / 429 / RESOURCE_EXHAUSTED
  if (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("resource exhausted") ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("too many requests")
  ) {
    return {
      friendlyMessage: "Model rate limit or quota reached, try again later",
      shortBadge: "Rate limit (429)",
      category: "rate_limit"
    };
  }

  // 3. Auth / Permission / 403 / 401 / Disabled API / Invalid Key
  if (
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("permission_denied") ||
    lower.includes("permission denied") ||
    lower.includes("is disabled") ||
    lower.includes("has not been used in project") ||
    lower.includes("generativelanguage.googleapis.com") ||
    lower.includes("403") ||
    lower.includes("401") ||
    lower.includes("unauthenticated")
  ) {
    return {
      friendlyMessage: "API key invalid or Generative Language API disabled in Google Cloud",
      shortBadge: "API key / 403 issue",
      category: "auth_error"
    };
  }

  // 4. Config / Invalid Argument / 400 / Bad Request / Developer instruction
  if (
    lower.includes("400") ||
    lower.includes("invalid_argument") ||
    lower.includes("invalid argument") ||
    lower.includes("developer instruction is not enabled") ||
    lower.includes("not enabled for this model") ||
    lower.includes("bad request")
  ) {
    return {
      friendlyMessage: "Model not correctly configured for requested parameters",
      shortBadge: "Config error (400)",
      category: "config_error"
    };
  }

  // 5. Timeout / Deadline / 504 / Network
  if (
    lower.includes("504") ||
    lower.includes("deadline_exceeded") ||
    lower.includes("deadline exceeded") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout")
  ) {
    return {
      friendlyMessage: "Model response timed out, try again later",
      shortBadge: "Timed out (504)",
      category: "timeout"
    };
  }

  // 6. Not Found / 404
  if (lower.includes("404") || lower.includes("not_found") || lower.includes("not found")) {
    return {
      friendlyMessage: "Model not found or unsupported in current region",
      shortBadge: "Model not found (404)",
      category: "not_found"
    };
  }

  // 7. Duration limit
  if (lower.includes("59m") || lower.includes("duration") || lower.includes("exceeds model limit")) {
    return {
      friendlyMessage: "Audio exceeds 59-minute duration limit for this model",
      shortBadge: "Exceeds 59m limit",
      category: "duration_limit"
    };
  }

  // 8. Empty or Blank Response
  if (
    lower.includes("empty response") ||
    lower.includes("blank text") ||
    lower.includes("no content") ||
    lower.includes("empty or blank") ||
    lower.includes("returned empty")
  ) {
    return {
      friendlyMessage: "Model returned empty response, automated failover active",
      shortBadge: "Empty response",
      category: "empty_response"
    };
  }

  // Default / General
  return {
    friendlyMessage: "Model temporarily unavailable, try again later",
    shortBadge: "Model unavailable",
    category: "general"
  };
}

export function formatFallbackReason(fromModel: string, toModel: string, rawError: any): string {
  const errCategory = categorizeModelError(rawError);
  const fromName = formatModelDisplayName(fromModel);
  const toName = formatModelDisplayName(toModel);

  switch (errCategory.category) {
    case "high_demand":
      return `Model demand too high on ${fromName} – automated failover to ${toName} active.`;
    case "rate_limit":
      return `Rate limit reached on ${fromName} – automated failover to ${toName} active.`;
    case "config_error":
      return `Configuration issue on ${fromName} – automated failover to ${toName} active.`;
    case "auth_error":
      return `API key or permission issue on ${fromName} – automated failover to ${toName} active.`;
    case "timeout":
      return `Response timed out on ${fromName} – automated failover to ${toName} active.`;
    case "duration_limit":
      return `Audio duration exceeds limit on ${fromName} (>59m) – routed to ${toName}.`;
    case "empty_response":
      return `Empty response from ${fromName} – automated failover to ${toName} active.`;
    default:
      return `${errCategory.friendlyMessage} on ${fromName} – failover to ${toName} active.`;
  }
}

export function formatAllModelsFailedMessage(lastError?: any, errorsByModel?: Record<string, string>): string {
  const errCat = categorizeModelError(lastError);
  if (errCat.category === "auth_error") {
    return `Generative Language API is disabled or API key is invalid: Please verify your GEMINI_API_KEY in Settings or Google Cloud Console.`;
  }
  if (errCat.category === "high_demand") {
    return `All AI transcription models are currently experiencing high demand. Please wait a few moments and try your transcription again later.`;
  }
  if (errCat.category === "rate_limit") {
    return `AI transcription quota or rate limit reached across all available models. Please wait a moment and try again later.`;
  }
  return `All available AI models failed to respond. Please wait a few moments and try your transcription again later.`;
}

export function formatGeminiErrorMessage(err: any): string {
  const msg = typeof err === "string" ? err : err?.message || String(err || "");
  if (msg.includes("generativelanguage.googleapis.com") || msg.includes("has not been used in project") || msg.includes("is disabled")) {
    return `Generative Language API is disabled: Please enable 'generativelanguage.googleapis.com' in your Google Cloud Project (https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com).`;
  }
  if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
    return `Invalid Gemini API Key: Please check your GEMINI_API_KEY in .env (get a key from https://aistudio.google.com/app/apikey).`;
  }
  if (msg.includes("PERMISSION_DENIED") || msg.includes("403")) {
    return `Google Cloud Permission Denied (403): Ensure the 'Generative Language API' (generativelanguage.googleapis.com) is enabled for your project in Google Cloud Console.`;
  }
  
  const categorized = categorizeModelError(err);
  if (categorized.category === "high_demand") {
    return `Model demand too high across Gemini transcription endpoints. Please wait a few moments and try again later.`;
  }
  if (categorized.category === "rate_limit") {
    return `AI transcription rate limit or quota reached. Please wait a moment and try again later.`;
  }
  if (categorized.category === "timeout") {
    return `Transcription request timed out. Please check your network connection and try again later.`;
  }
  if (categorized.category === "empty_response") {
    return `Model returned empty response. Automated failover was attempted.`;
  }
  
  return msg;
}

/**
 * Formats seconds into a timestamp string like [MM:SS] or [HH:MM:SS].
 */
export function formatSecondsToTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `[${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
  }
  return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}]`;
}

/**
 * Parses startOffset string ("0s", "12.5s", "120.400s") or number into seconds.
 */
export function parseOffsetToSeconds(offset?: string | number): number {
  if (typeof offset === "number") return offset;
  if (!offset) return 0;
  const cleaned = String(offset).replace(/s$/i, "").trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Splits unformatted monolithic text into natural, readable paragraphs at sentence boundaries.
 */
export function splitIntoParagraphs(text: string, targetSentencesPerPara: number = 3): string[] {
  if (!text || !text.trim()) return [];
  const trimmed = text.trim();
  
  // If text already has distinct paragraphs, return them
  const existingParas = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (existingParas.length > 1) {
    return existingParas;
  }

  // Split on sentence boundaries
  const sentenceRegex = /([.?!]+["']?)(?:\s+(?=[A-Z0-9"']))/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(trimmed)) !== null) {
    const end = match.index + match[1].length;
    sentences.push(trimmed.slice(lastIndex, end).trim());
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < trimmed.length) {
    const remaining = trimmed.slice(lastIndex).trim();
    if (remaining) sentences.push(remaining);
  }

  if (sentences.length <= targetSentencesPerPara) {
    return [trimmed];
  }

  const paragraphs: string[] = [];
  let currentGroup: string[] = [];

  for (const sentence of sentences) {
    currentGroup.push(sentence);
    if (currentGroup.length >= targetSentencesPerPara) {
      paragraphs.push(currentGroup.join(" "));
      currentGroup = [];
    }
  }
  if (currentGroup.length > 0) {
    if (paragraphs.length > 0 && currentGroup.length === 1) {
      paragraphs[paragraphs.length - 1] += " " + currentGroup[0];
    } else {
      paragraphs.push(currentGroup.join(" "));
    }
  }

  return paragraphs;
}

/**
 * Infers human speaker names from conversational introductions in the first few speaker turns.
 * Matches patterns like "I'm Johna Till Johnson, CEO of...", "my co-host John Burke", "joined by Sarah Connor".
 */
export function inferSpeakerNamesFromTranscript(
  turns: Array<{ speakerId: string; text: string }>
): Map<string, string> {
  const nameMap = new Map<string, string>();
  if (!Array.isArray(turns) || turns.length === 0) return nameMap;

  for (let i = 0; i < Math.min(turns.length, 6); i++) {
    const turn = turns[i];
    const text = turn.text;

    // Self identification: "I'm <Name>" or "I am <Name>" or "My name is <Name>"
    const selfMatch = text.match(/\b(?:I'm|I am|My name is|This is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
    if (selfMatch && selfMatch[1] && !nameMap.has(turn.speakerId)) {
      const candidateName = selfMatch[1].trim();
      if (!/^(Here|Listening|Going|Looking|Talking|Thinking|Starting|Welcome|Very|Good|Happy)/i.test(candidateName)) {
        nameMap.set(turn.speakerId, candidateName);
      }
    }

    // Co-host identification: "co-host <Name>", "with <Name>", "joined by <Name>"
    const coHostMatch = text.match(/\b(?:co-host|joined by|with me is|with)\s*[:,\.]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
    if (coHostMatch && coHostMatch[1]) {
      const coHostName = coHostMatch[1].trim();
      const otherTurn = turns.find(t => t.speakerId !== turn.speakerId);
      if (otherTurn && !nameMap.has(otherTurn.speakerId)) {
        if (!/^(Here|Listening|Going|Looking|Talking|Thinking|Starting|Welcome|Very|Good|Happy)/i.test(coHostName)) {
          nameMap.set(otherTurn.speakerId, coHostName);
        }
      }
    }
  }

  return nameMap;
}

export interface TranscriptionTurn {
  speakerId: string;
  speakerName: string;
  startTimeSeconds: number;
  text: string;
}

/**
 * Formats a list of speaker turns and promptStyle into structured Markdown.
 */
export function formatTurnsToMarkdown(
  turns: TranscriptionTurn[],
  promptStyle: string = 'combined',
  title?: string
): string {
  if (!turns || turns.length === 0) return "";

  const uniqueSpeakers = Array.from(new Set(turns.map(t => t.speakerName).filter(Boolean)));
  const cleanTitle = title || "Audio Transcript";

  let header = `# ${cleanTitle}\n`;
  if ((promptStyle === 'combined' || promptStyle === 'verbatim') && uniqueSpeakers.length > 0) {
    header += `**Hosts:** *${uniqueSpeakers.join(", ")}*\n\n---\n\n`;
  } else {
    header += `\n---\n\n`;
  }

  if (promptStyle === 'combined') {
    const body = turns.map(t => `${formatSecondsToTimestamp(t.startTimeSeconds)} **${t.speakerName}**: ${t.text}`).join("\n\n");
    return `${header}${body}`.trim();
  } else if (promptStyle === 'timestamped') {
    const body = turns.map(t => `${formatSecondsToTimestamp(t.startTimeSeconds)} ${t.text}`).join("\n\n");
    return `${header}${body}`.trim();
  } else if (promptStyle === 'verbatim') {
    const body = turns.map(t => `**${t.speakerName}**: ${t.text}`).join("\n\n");
    return `${header}${body}`.trim();
  } else { // 'clean' or 'custom'
    const body = turns.map(t => t.text).join("\n\n");
    return `${header}${body}`.trim();
  }
}

/**
 * Builds the structuring prompt used to transform raw ASR audio transcription
 * into publication-ready, diarized Markdown with inferred episode title, hosts,
 * timestamps, and clean-verbatim dialogue turns.
 */
export function buildStructuringPrompt(
  rawTranscript: string,
  promptStyle: string = 'combined',
  audioTitle?: string,
  customPrompt?: string
): string {
  const styleInstructions = getSystemInstruction(promptStyle);
  return `${styleInstructions}

---

## TASK: STRUCTURE, DIARIZE, AND REFINE AUDIO TRANSCRIPTION
You are an expert audio transcriptionist and podcast editor. Transform the raw speech-to-text transcript below into a publication-ready transcript formatted strictly according to the rules and Markdown schema above.

### CRITICAL REQUIREMENTS:
1. **Accurate Title & Hosts:**
   - Infer a concise, professional episode title (e.g. "# Strategy Mid-Course Corrections") based on the actual discussion topic, or use "# ${audioTitle || 'Audio Transcript'}".
   - Identify the actual names of the podcast hosts and speakers from their conversational self-introductions and cues (e.g. "I'm Johna Till Johnson, CEO of Nemertes, and I'm here with my co-host John Burke, CTO of Nemertes").
   - List ONLY the identified human host names on the Hosts line: "**Hosts:** *Johna Till Johnson, John Burke*". Never list more hosts than actually speak.
2. **True Speaker Turns & Diarization:**
   - Detect every natural conversational turn between the speakers based on dialogue flow, perspective, and responses.
   - Prepend speaker turns with the identified speaker name (e.g. "**Johna Till Johnson**:", "**John Burke**:").
   - For combined mode: include accurate timestamps at each speaker turn (e.g. "[00:00] **Johna Till Johnson**:", "[00:10] **John Burke**:").
3. **Clean-Verbatim Editing & Entity Correction:**
   - Remove conversational disfluencies, stuttering, filler words ("uh", "um", "like like", false starts, repeated words).
   - Use industry context to correct phonetic ASR misspellings (e.g. correct "Numerties" to "Nemertes", "John Atchil" to "Johna Till Johnson", "Claude Mythos", "Project Glasswing", "TSMC", "Meter").
   - Do NOT summarize, truncate, or omit spoken content. Preserve the complete conversation and technical substance.
4. **Sponsor & Intro Layout:**
   - Format sponsor reads and intro announcements into clean, distinct paragraphs under the appropriate speaker.

${customPrompt ? `### CUSTOM INSTRUCTIONS:\n${customPrompt}\n` : ''}

### RAW TRANSCRIPT:
${rawTranscript}
`;
}

/**
 * Fallback cleaner for raw transcripts when LLM structuring is offline or fails.
 */
export function cleanFallbackTranscript(
  text: string,
  promptStyle: string = 'combined',
  title?: string
): string {
  if (!text || !text.trim()) return "";
  const trimmed = text.trim();
  const cleanTitle = title || "Audio Transcript";

  // Clean obvious filler words
  const cleanedText = trimmed
    .replace(/\b(uh|um|er|ah)\b,?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Try to infer host names from introductory remarks
  const hostNames: string[] = [];
  const selfMatch = cleanedText.match(/\b(?:I'm|I am|My name is|This is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
  if (selfMatch && selfMatch[1]) {
    const name = selfMatch[1].trim();
    if (!/^(Here|Listening|Going|Looking|Talking|Thinking|Starting|Welcome|Very|Good|Happy)/i.test(name)) {
      hostNames.push(name);
    }
  }
  const coHostMatch = cleanedText.match(/\b(?:co-host|joined by|with me is)\s*[:,\.]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
  if (coHostMatch && coHostMatch[1]) {
    const name = coHostMatch[1].trim();
    if (!/^(Here|Listening|Going|Looking|Talking|Thinking|Starting|Welcome|Very|Good|Happy)/i.test(name) && !hostNames.includes(name)) {
      hostNames.push(name);
    }
  }

  let header = `# ${cleanTitle}\n`;
  if (hostNames.length > 0) {
    header += `**Hosts:** *${hostNames.join(", ")}*\n\n---\n\n`;
  } else {
    header += `\n---\n\n`;
  }

  const paras = splitIntoParagraphs(cleanedText, 3);
  return `${header}${paras.join("\n\n")}`.trim();
}

/**
 * Post-processes raw ASR transcript with gemini-3.7-flash (and downstream fallback models)
 * to format into publication-quality, diarized Markdown with true speaker attribution.
 */
export async function refineTranscriptWithLLM(params: {
  aiClient: GoogleGenAI;
  rawTranscript: string;
  promptStyle?: string;
  audioTitle?: string;
  customPrompt?: string;
  modelsToTry?: string[];
}): Promise<string> {
  const { aiClient, rawTranscript, promptStyle = 'combined', audioTitle, customPrompt } = params;
  if (!rawTranscript || !rawTranscript.trim()) return "";

  // If already structured markdown with title, divider and host or speaker tags, return immediately
  const isAlreadyStructured = rawTranscript.startsWith("# ") && 
    rawTranscript.includes("---") && 
    (rawTranscript.includes("**Hosts:**") || /\[\d{2}:\d{2}\]\s+\*\*/.test(rawTranscript) || /\*\*[A-Z][a-z]+.*?\*\*:/.test(rawTranscript));
  
  if (isAlreadyStructured) {
    return rawTranscript.trim();
  }

  const structuringPrompt = buildStructuringPrompt(rawTranscript, promptStyle, audioTitle, customPrompt);
  const models = params.modelsToTry || DEFAULT_DOWNSTREAM_MODELS;

  for (const model of models) {
    try {
      console.log(`[Gemini API] Structuring transcript with model: ${model}`);
      const response = await aiClient.models.generateContent({
        model,
        contents: [
          {
            text: structuringPrompt
          }
        ],
        config: {
          temperature: 0.2
        }
      });

      const refined = extractResponseText(response);
      if (refined && refined.trim().length > 0) {
        return refined.trim();
      }
    } catch (err) {
      console.warn(`[Gemini API] Structuring pass failed on ${model}:`, err);
    }
  }

  // Fallback if all LLM structuring attempts fail
  return cleanFallbackTranscript(rawTranscript, promptStyle, audioTitle);
}

/**
 * Safely extracts non-empty text content from a GoogleGenAI GenerateContentResponse,
 * candidate structure, audioTranscription parts, or string outputs, and formats it
 * according to the desired promptStyle and title.
 */
export function extractResponseText(response: any, promptStyle?: string, title?: string): string {
  if (!response) return "";

  // 1. Direct string response
  if (typeof response === "string" && response.trim().length > 0) {
    const trimmed = response.trim();
    if (!promptStyle || trimmed.startsWith("# ") || trimmed.startsWith("[00:") || (trimmed.startsWith("**") && trimmed.includes("\n\n"))) {
      return trimmed;
    }
    return cleanFallbackTranscript(trimmed, promptStyle, title);
  }

  // 2. Extract from candidates[0].content.parts (including text, audioTranscription, etc.)
  if (Array.isArray(response.candidates) && response.candidates.length > 0) {
    for (const candidate of response.candidates) {
      if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
        const rawTurns: Array<{ speakerId: string; text: string; startTimeSeconds: number }> = [];
        const rawTextParts: string[] = [];
        let hasAudioTranscription = false;

        for (const part of candidate.content.parts) {
          if (!part) continue;
          
          // Skip thought / internal reasoning parts
          if (part.thought === true) continue;

          // Standard text part
          if (typeof part.text === "string" && part.text.trim()) {
            rawTextParts.push(part.text.trim());
            continue;
          }

          // String primitive in parts array
          if (typeof part === "string" && part.trim()) {
            rawTextParts.push(part.trim());
            continue;
          }

          // Audio transcription specialized part (gemini-3.5-transcribe output)
          if (part.audioTranscription) {
            hasAudioTranscription = true;
            const at = part.audioTranscription;
            const speakerId = at.speakerLabel || "spk_0";
            
            let text = "";
            if (typeof at === "string" && at.trim()) {
              text = at.trim();
            } else if (typeof at.text === "string" && at.text.trim()) {
              text = at.text.trim();
            }

            let startSeconds = 0;
            if (Array.isArray(at.words) && at.words.length > 0) {
              if (!text) {
                text = at.words
                  .map((w: any) => (typeof w === "string" ? w : w?.word || w?.text || ""))
                  .filter(Boolean)
                  .join(" ")
                  .trim();
              }
              const firstWord = at.words[0];
              startSeconds = parseOffsetToSeconds(firstWord?.startOffset);
            }

            if (text) {
              rawTurns.push({
                speakerId,
                text,
                startTimeSeconds: startSeconds
              });
            }
          }
        }

        // If audioTranscription parts were parsed
        if (hasAudioTranscription && rawTurns.length > 0) {
          // If the parsed content is already complete formatted markdown, return directly
          if (rawTurns.length === 1 && rawTurns[0].text.startsWith("# ")) {
            return rawTurns[0].text;
          }

          if (!promptStyle) {
            return rawTurns.map(t => t.text).join(" ").trim();
          }

          // Normalize speaker mapping (e.g. spk_0 -> Speaker 1)
          const speakerMap = new Map<string, string>();
          let speakerCount = 1;
          for (const turn of rawTurns) {
            if (!speakerMap.has(turn.speakerId)) {
              if (/^spk_\d+$/i.test(turn.speakerId)) {
                const num = parseInt(turn.speakerId.replace(/^spk_/i, ""), 10);
                speakerMap.set(turn.speakerId, `Speaker ${num + 1}`);
              } else if (/^\d+$/.test(turn.speakerId)) {
                const num = parseInt(turn.speakerId, 10);
                speakerMap.set(turn.speakerId, `Speaker ${num + 1}`);
              } else if (turn.speakerId) {
                speakerMap.set(turn.speakerId, turn.speakerId);
              } else {
                speakerMap.set(turn.speakerId, `Speaker ${speakerCount++}`);
              }
            }
          }

          // Infer conversational introductions (e.g. "I'm Johna Till Johnson", "with my co-host John Burke")
          const inferredNames = inferSpeakerNamesFromTranscript(rawTurns);
          for (const [spkId, humanName] of inferredNames.entries()) {
            speakerMap.set(spkId, humanName);
          }

          const turns: TranscriptionTurn[] = rawTurns.map(t => ({
            speakerId: t.speakerId,
            speakerName: speakerMap.get(t.speakerId) || "Speaker 1",
            startTimeSeconds: t.startTimeSeconds,
            text: t.text
          }));

          return formatTurnsToMarkdown(turns, promptStyle, title);
        }

        // If standard text parts were found
        if (rawTextParts.length > 0) {
          const joined = rawTextParts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
          if (!promptStyle || joined.startsWith("# ") || joined.startsWith("[00:") || (joined.startsWith("**") && joined.includes("\n\n"))) {
            return joined;
          }
          return cleanFallbackTranscript(joined, promptStyle, title);
        }
      }
    }
  }

  // 3. Fallback: check top-level audioTranscription object
  if (response.audioTranscription) {
    const at = response.audioTranscription;
    if (typeof at === "string" && at.trim()) return at.trim();
    if (typeof at.text === "string" && at.text.trim()) return at.text.trim();
  }

  // 4. Fallback: check direct response.text getter/property
  try {
    if (typeof response.text === "string" && response.text.trim().length > 0) {
      return response.text.trim();
    }
  } catch {
    // Ignore getter errors
  }

  return "";
}

export async function generateContentWithFallback(params: {
  aiClient: GoogleGenAI;
  contents?: any;
  config?: any;
  promptStyle?: string;
  customPrompt?: string;
  fileUri?: string;
  mimeType?: string;
  audioTitle?: string;
  customVocabulary?: string[];
  languageCodes?: string[];
  onModelSelected?: (model: string) => void;
  onFallbackTransition?: (fromModel: string, toModel: string, reason: string, friendlyReason?: string, rawError?: any) => void;
  onModelError?: (model: string, rawError: any, friendlyError: string, shortBadge: string) => void;
  modelsToTry?: string[];
  maxRetries?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
}) {
  const modelsToTry = params.modelsToTry || DEFAULT_TRANSCRIPTION_MODELS;
  const hasExplicitRetries = params.maxRetries !== undefined;
  let lastError: any = null;
  const recordedErrors: Record<string, string> = {};

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const model = modelsToTry[mIdx];
    const hasNextModel = mIdx + 1 < modelsToTry.length;
    // When retries are not explicitly configured:
    // If fallback models exist, limit to 1 retry (2 attempts max) to fail over swiftly and avoid proxy timeouts.
    // Only the final model gets up to 2 retries (3 attempts).
    const maxRetries = hasExplicitRetries ? params.maxRetries! : (hasNextModel ? 1 : 2);
    let delay = params.initialDelayMs ?? (hasExplicitRetries ? 1000 : 500);
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Gemini API] Retrying model: ${model} (attempt ${attempt}/${maxRetries}) after delay of ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
        } else {
          console.log(`[Gemini API] Attempting generateContent with model: ${model}`);
        }

        if (params.onModelSelected) {
          try {
            params.onModelSelected(model);
          } catch (err) {
            console.error("Error in onModelSelected callback:", err);
          }
        }
        
        const isTranscribeModel = model.includes("transcribe");
        let modelConfig = params.config ? { ...params.config } : {};
        let modelContents = params.contents;

        // If fileUri and promptStyle are specified, dynamically assemble optimal payload per model
        if (params.fileUri && params.promptStyle) {
          if (isTranscribeModel) {
            // Transcribe models: NEVER pass developer systemInstruction (avoids HTTP 400 parameter errors)
            delete modelConfig.systemInstruction;
            
            // Inject audioTranscriptionConfig for transcribe model
            modelConfig = {
              ...modelConfig,
              audioTranscriptionConfig: buildAudioTranscriptionConfig({
                promptStyle: params.promptStyle,
                customVocabulary: params.customVocabulary,
                languageCodes: params.languageCodes
              })
            };

            if (Object.keys(modelConfig).length === 0) {
              modelConfig = undefined;
            }
            
            modelContents = [
              {
                fileData: {
                  fileUri: params.fileUri,
                  mimeType: params.mimeType || "audio/mp3"
                }
              },
              {
                text: buildTranscribeModelPrompt(params.promptStyle, params.customPrompt, params.customVocabulary)
              }
            ];
          } else {
            // Non-transcribe models (gemini-3.7-flash, gemini-3.6-flash, etc.):
            // 1. Strictly remove transcribe-only configurations (audioTranscriptionConfig, audioTimestamp)
            delete modelConfig.audioTranscriptionConfig;
            delete modelConfig.audioTimestamp;
            // 2. Inject comprehensive developer system instruction
            modelConfig = {
              systemInstruction: getSystemInstruction(params.promptStyle),
              ...modelConfig
            };
            modelContents = [
              {
                fileData: {
                  fileUri: params.fileUri,
                  mimeType: params.mimeType || "audio/mp3"
                }
              },
              {
                text: buildTranscriptionPrompt(params.promptStyle, params.customPrompt, params.customVocabulary)
              }
            ];
          }
        } else {
          // Fallback for custom or direct contents calls:
          if (isTranscribeModel) {
            // Sanitize systemInstruction for transcribe models
            if (modelConfig?.systemInstruction) {
              const sysInstruction = typeof modelConfig.systemInstruction === "string"
                ? modelConfig.systemInstruction
                : modelConfig.systemInstruction?.parts?.map((p: any) => p.text).join("\n") || "";

              delete modelConfig.systemInstruction;

              if (sysInstruction && typeof sysInstruction === "string" && sysInstruction.trim()) {
                if (Array.isArray(modelContents)) {
                  let prepended = false;
                  modelContents = modelContents.map((item: any) => {
                    if (!prepended && item && typeof item.text === "string") {
                      prepended = true;
                      return { ...item, text: `${sysInstruction}\n\n${item.text}` };
                    }
                    return item;
                  });
                  if (!prepended) {
                    modelContents = [{ text: sysInstruction }, ...modelContents];
                  }
                } else if (typeof modelContents === "string") {
                  modelContents = `${sysInstruction}\n\n${modelContents}`;
                }
              }
            }
            if (modelConfig && Object.keys(modelConfig).length === 0) {
              modelConfig = undefined;
            }
          } else {
            // General reasoning models: strictly strip transcribe-specific fields
            if (modelConfig?.audioTranscriptionConfig) {
              delete modelConfig.audioTranscriptionConfig;
            }
            if (modelConfig?.audioTimestamp) {
              delete modelConfig.audioTimestamp;
            }
          }
        }

        let responsePromise = params.aiClient.models.generateContent({
          model,
          contents: modelContents,
          config: modelConfig,
        });

        let response: any;
        if (params.timeoutMs && params.timeoutMs > 0) {
          let timer: any;
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error(`Model ${model} request timed out after ${params.timeoutMs}ms.`));
            }, params.timeoutMs);
          });
          try {
            response = await Promise.race([responsePromise, timeoutPromise]);
          } finally {
            clearTimeout(timer);
          }
        } else {
          response = await responsePromise;
        }

        const extractedText = extractResponseText(response, params.promptStyle, params.audioTitle);
        if (!extractedText || !extractedText.trim()) {
          const candidate = response?.candidates?.[0];
          const finishReason = candidate?.finishReason;
          const blockReason = response?.promptFeedback?.blockReason;
          const reasonInfo = finishReason ? ` (finishReason: ${finishReason})` : blockReason ? ` (blockReason: ${blockReason})` : '';
          throw new Error(`Model ${model} returned empty or blank text response${reasonInfo}.`);
        }

        // When transcribe model was used, run refinement pass with gemini-3.7-flash to produce publication-grade markdown with real speaker names
        let finalTranscript = extractedText;
        if (params.fileUri && params.promptStyle && isTranscribeModel) {
          try {
            const refined = await refineTranscriptWithLLM({
              aiClient: params.aiClient,
              rawTranscript: extractedText,
              promptStyle: params.promptStyle,
              audioTitle: params.audioTitle,
              customPrompt: params.customPrompt,
              modelsToTry: DEFAULT_DOWNSTREAM_MODELS
            });
            if (refined && refined.trim().length > 0) {
              finalTranscript = refined;
            }
          } catch (refineErr) {
            console.warn("[Gemini API] Structuring/refinement pass warning:", refineErr);
          }
        }

        return { response, model, text: finalTranscript };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        const isHighDemand = errorMsg.includes("high demand") || 
                             errorMsg.includes("Overloaded") || 
                             errorMsg.includes("UNAVAILABLE") ||
                             errorMsg.includes("503");
        const isQuota = errorMsg.includes("429") || 
                        errorMsg.includes("Resource exhausted") || 
                        errorMsg.includes("RESOURCE_EXHAUSTED");
        const isTransient = isHighDemand || 
                            isQuota || 
                            errorMsg.includes("rate limit") || 
                            errorMsg.includes("temp") ||
                            errorMsg.includes("timed out");
        
        console.warn(`[Gemini API] Model ${model} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, errorMsg);
        lastError = error;
        recordedErrors[model] = errorMsg;

        // When not explicitly configured for high retry counts, don't waste time repeating attempts on an
        // overloaded model if there is a healthy fallback model waiting in the cascade.
        const shouldFastFailover = !hasExplicitRetries && hasNextModel && (isHighDemand || isQuota) && attempt >= 1;

        // If it's not a transient error, or we reached max retries, or should fast failover, don't retry this model, fall back to next model
        if (!isTransient || attempt === maxRetries || shouldFastFailover) {
          const categorized = categorizeModelError(error);
          if (params.onModelError) {
            try {
              params.onModelError(model, error, categorized.friendlyMessage, categorized.shortBadge);
            } catch (errCb) {
              console.error("Error in onModelError callback:", errCb);
            }
          }

          if (mIdx + 1 < modelsToTry.length && params.onFallbackTransition) {
            const nextModel = modelsToTry[mIdx + 1];
            const friendlyReason = formatFallbackReason(model, nextModel, error);
            try {
              params.onFallbackTransition(model, nextModel, errorMsg, friendlyReason, error);
            } catch (fbErr) {
              console.error("Error in onFallbackTransition callback:", fbErr);
            }
          }
          break;
        }
      }
    }
  }

  const friendlyFinalMsg = formatAllModelsFailedMessage(lastError, recordedErrors);
  const finalError = new Error(`${friendlyFinalMsg} (Root cause: ${lastError?.message || String(lastError || 'Unknown error')})`);
  (finalError as any).friendlyMessage = friendlyFinalMsg;
  (finalError as any).rawError = lastError;
  throw finalError;
}
