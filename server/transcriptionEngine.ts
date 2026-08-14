import { GoogleGenAI } from "@google/genai";

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

export async function generateContentWithFallback(params: {
  aiClient: GoogleGenAI;
  contents: any;
  config?: any;
  onModelSelected?: (model: string) => void;
  modelsToTry?: string[];
  maxRetries?: number;
  initialDelayMs?: number;
}) {
  const modelsToTry = params.modelsToTry || [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
  ];
  const maxRetries = params.maxRetries ?? 3;
  let lastError: any = null;

  for (const model of modelsToTry) {
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
        
        const response = await params.aiClient.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return { response, model };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        const isTransient = errorMsg.includes("503") || 
                            errorMsg.includes("UNAVAILABLE") || 
                            errorMsg.includes("429") || 
                            errorMsg.includes("Resource exhausted") ||
                            errorMsg.includes("Overloaded") ||
                            errorMsg.includes("rate limit") ||
                            errorMsg.includes("temp");
        
        console.warn(`[Gemini API] Model ${model} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, errorMsg);
        lastError = error;

        // If it's not a transient error, or we reached max retries, don't retry this model, fall back to next model
        if (!isTransient || attempt === maxRetries) {
          break;
        }
      }
    }
  }

  throw lastError || new Error("All Gemini models failed to respond.");
}
