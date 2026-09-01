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
  if (options?.promptStyle) {
    config.mode = mapPromptStyleToTranscriptionMode(options.promptStyle);
  }
  if (options?.languageCodes && options.languageCodes.length > 0) {
    config.languageCodes = options.languageCodes;
  }
  if (options?.customVocabulary && options.customVocabulary.length > 0) {
    config.customVocabulary = options.customVocabulary;
  }
  if (options?.diarization !== undefined) {
    config.diarization = options.diarization;
  }
  if (options?.wordTimestamp !== undefined) {
    config.wordTimestamp = options.wordTimestamp;
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
export function buildTranscribeModelPrompt(promptStyle: string, customPrompt?: string): string {
  if (customPrompt && customPrompt.trim()) {
    return `${customPrompt.trim()}

Output Format Requirements:
- Start directly with exactly one H1 title (# Title).
- If hosts or speakers are identified, include "**Hosts:** *Host 1, Host 2*" on the line below the title, followed by "---".
- Output clean Markdown directly with no introductory preambles or code fences.`;
  }

  switch (promptStyle) {
    case 'combined':
      return `Transcribe this audio recording into a clean, publication-ready Markdown transcript.

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
      return `Transcribe this audio recording into a clean, publication-ready Markdown transcript with paragraph timestamps.

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
      return `Transcribe this audio recording into a clean, publication-ready Markdown transcript with speaker identification.

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
      return `Transcribe this audio recording into a clean, publication-ready Markdown transcript.

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
export function buildTranscriptionPrompt(promptStyle: string, customPrompt?: string): string {
  if (customPrompt && customPrompt.trim()) {
    return customPrompt.trim();
  }
  if (promptStyle === 'combined') {
    return "Please transcribe this recording in Markdown format starting with exactly ONE H1 title line (# Title), followed by speaker turns and macro timestamps [MM:SS] or [HH:MM:SS], adhering strictly to the polished clean verbatim transcription standards. Do NOT include preambles, horizontal rules, or duplicate headers.";
  }
  if (promptStyle === 'timestamped') {
    return "Please transcribe this recording in Markdown format starting with exactly ONE H1 title line (# Title), followed by macro timestamps [MM:SS] or [HH:MM:SS] at natural paragraph breaks, adhering strictly to the polished clean verbatim transcription standards.";
  }
  if (promptStyle === 'verbatim') {
    return "Please transcribe this recording in Markdown format starting with exactly ONE H1 title line (# Title), with clearly identified speaker turns, adhering strictly to the polished clean verbatim transcription standards.";
  }
  return "Please transcribe this entire recording following the strict polished clean verbatim standards. Do not summarize or skip spoken content.";
}

export const PRIMARY_TRANSCRIPTION_MODEL = "gemini-3.5-transcribe";
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
  "gemini-3.5-transcribe",
  ...DEFAULT_DOWNSTREAM_MODELS
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
  const durationSec = parseDurationToSeconds(duration);
  // If the audio is explicitly longer than 59 minutes (3540s), fallback/bypass gemini-3.5-transcribe to gemini-3.7-flash
  if (durationSec !== null && durationSec > MAX_TRANSCRIBE_MODEL_DURATION_SECONDS) {
    return [...DEFAULT_DOWNSTREAM_MODELS];
  }
  // Otherwise (<= 59 minutes or unknown duration), use gemini-3.5-transcribe as primary with full fallback cascade
  return [...DEFAULT_TRANSCRIPTION_MODELS];
}

export function formatModelDisplayName(modelId?: string): string {
  if (!modelId) return "Gemini 3.5 Transcribe";
  switch (modelId) {
    case "gemini-3.5-transcribe":
      return "Gemini 3.5 Transcribe";
    case "gemini-3.7-flash":
      return "Gemini 3.7 Flash";
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
  category: 'high_demand' | 'rate_limit' | 'config_error' | 'auth_error' | 'timeout' | 'not_found' | 'duration_limit' | 'general';
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
  
  return msg;
}

export async function generateContentWithFallback(params: {
  aiClient: GoogleGenAI;
  contents?: any;
  config?: any;
  promptStyle?: string;
  customPrompt?: string;
  fileUri?: string;
  mimeType?: string;
  onModelSelected?: (model: string) => void;
  onFallbackTransition?: (fromModel: string, toModel: string, reason: string, friendlyReason?: string, rawError?: any) => void;
  onModelError?: (model: string, rawError: any, friendlyError: string, shortBadge: string) => void;
  modelsToTry?: string[];
  maxRetries?: number;
  initialDelayMs?: number;
}) {
  const modelsToTry = params.modelsToTry || DEFAULT_TRANSCRIPTION_MODELS;
  const maxRetries = params.maxRetries ?? 3;
  let lastError: any = null;
  const recordedErrors: Record<string, string> = {};

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const model = modelsToTry[mIdx];
    let delay = params.initialDelayMs ?? 1000;
    
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
            delete modelConfig.systemInstruction;
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
                text: buildTranscribeModelPrompt(params.promptStyle, params.customPrompt)
              }
            ];
          } else {
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
                text: buildTranscriptionPrompt(params.promptStyle, params.customPrompt)
              }
            ];
          }
        } else {
          // Fallback for custom or direct contents calls: sanitize systemInstruction for transcribe models
          if (isTranscribeModel && modelConfig?.systemInstruction) {
            const sysInstruction = typeof modelConfig.systemInstruction === "string"
              ? modelConfig.systemInstruction
              : modelConfig.systemInstruction?.parts?.map((p: any) => p.text).join("\n") || "";

            delete modelConfig.systemInstruction;
            if (Object.keys(modelConfig).length === 0) {
              modelConfig = undefined;
            }

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
        }

        const response = await params.aiClient.models.generateContent({
          model,
          contents: modelContents,
          config: modelConfig,
        });
        return { response, model };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        const isTransient = errorMsg.includes("503") || 
                            errorMsg.includes("UNAVAILABLE") || 
                            errorMsg.includes("429") || 
                            errorMsg.includes("Resource exhausted") ||
                            errorMsg.includes("RESOURCE_EXHAUSTED") ||
                            errorMsg.includes("Overloaded") ||
                            errorMsg.includes("high demand") ||
                            errorMsg.includes("rate limit") ||
                            errorMsg.includes("temp");
        
        console.warn(`[Gemini API] Model ${model} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, errorMsg);
        lastError = error;
        recordedErrors[model] = errorMsg;

        // If it's not a transient error, or we reached max retries, don't retry this model, fall back to next model
        if (!isTransient || attempt === maxRetries) {
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
