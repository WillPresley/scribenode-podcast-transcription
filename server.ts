import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Set up multer to handle uploads safely in temporary storage
const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for audio files
  }
});

// Initialize Gemini SDK with User-Agent header for tracking
let aiInstance: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server. Please check your API keys in Settings.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// Helper to call Gemini with a list of backup/fallback models in case of high demand (503) or rate limits (429)
async function generateContentWithFallback(params: {
  contents: any;
  config?: any;
  onModelSelected?: (model: string) => void;
}) {
  const modelsToTry = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    const maxRetries = 3;
    let delay = 1000; // 1 second initial delay
    
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
        
        const response = await getAIClient().models.generateContent({
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

interface TranscribeJob {
  id: string;
  filename: string;
  fileSize: number;
  status: 'uploading' | 'processing_audio' | 'transcribing' | 'completed' | 'failed' | 'archived';
  progress: number;
  error?: string;
  transcript?: string;
  createdAt: number;
  duration?: string;
  localFilePath?: string;
  mimeType?: string;
  modelUsed?: string;
  summary?: string;
  key_takeaways?: string;
  chapters?: string;
  social_media?: string;
}

const jobs = new Map<string, TranscribeJob>();

// Preseed sample jobs with far-future createdAt so they don't get cleared
const sampleJobsList: TranscribeJob[] = [
  {
    id: "sample-sarah",
    filename: "Interview_Sarah_Drabner_Final.mp3",
    fileSize: 43200000,
    status: "completed",
    progress: 100,
    createdAt: Date.now() + 1000 * 365 * 24 * 3600 * 1000,
    modelUsed: "gemini-3.6-flash",
    transcript: `[00:12] SPEAKER A: Welcome to the Product Mindset podcast. Today we're diving deep into the architecture of modern SaaS applications and how engineering teams can leverage AI models to automate workflows. I'm joined today by Sarah Drabner, VP of Product Engineering. Welcome, Sarah.

[00:34] SPEAKER B: Thanks for having me! It's fascinating because the barrier to entry has never been lower, but the barrier to excellence has never been higher. When we talk about building with APIs, specifically Gemini 3.6 Flash, it completely changes how we approach multimodal processing of large audio, video, and text streams.

[01:15] SPEAKER A: Absolutely. We've seen teams struggle with latency and cost. How do you balance transcription quality with rapid content generation?

[01:45] SPEAKER B: The key is multi-stage workflows. First, use a highly capable reasoning model like Gemini 3.6 Flash for direct audio-to-text alignment, which maintains speaker identity and captures verbal nuances. Once you have that high-fidelity transcript, you feed it into downstream summarization and chaptering pipelines. That keeps things highly cost-efficient and incredibly fast.`,
    duration: "45:00",
    summary: `### Executive Summary
In this episode of the Product Mindset podcast, host Speaker A sits down with Sarah Drabner, VP of Product Engineering, to explore the architectural principles of modern, AI-augmented SaaS applications. 

### Key Themes:
- **API-First Orchestration**: How teams can leverage multimodal capabilities of foundation models.
- **Barrier to Excellence**: While building simple wrappers is easier than ever, constructing robust, production-grade applications requires deep engineering discipline.
- **Workflow Automation**: Transitioning from manual operations to intelligent, automated, and structured pipeline-driven processing.`,
    key_takeaways: `### Key Takeaways

1. **Excellence is the New Differentiator**
   The barrier to entry for AI features has dropped to near-zero, but the bar for high-quality, dependable excellence in enterprise applications is higher than ever.

2. **Leverage Multimodal Foundation Models**
   Using models like Gemini 3.6 Flash allows developer teams to process complex audio, video, and text streams natively without chaining fragile, single-purpose microservices.

3. **Multi-Stage API Pipelines**
   Instead of demanding reasoning and heavy extraction in a single API call, employ a sequential architecture: first perform high-fidelity transcription, then branch to specialized summarization and chaptering.

4. **Efficiency Over Raw Size**
   Optimizing speed and context window efficiency is critical. Models designed for speed, such as Gemini 3.6 Flash, are often superior choices for high-velocity user interfaces and background workers.`,
    chapters: `### Episode Chapters

- **[00:00] Introduction to SaaS Architecture**
  Opening remarks on how modern SaaS applications leverage foundation models to automate complex end-user tasks.

- **[00:34] The Barrier to Excellence**
  Sarah Drabner discusses the current landscape where entry barriers are extremely low, but crafting premium, reliable experiences remains a formidable challenge.

- **[01:15] Quality vs. Speed Tradeoffs**
  Addressing the common developer friction points of latency, token cost, and accuracy when working with multimodal APIs.

- **[01:45] Sequential Pipeline Engineering**
  Breaking down the architectural pattern of multi-stage pipelines: aligning raw audio files to high-fidelity text first, then downstream processing.`,
    social_media: `### Listener Share Drafts

#### 🧵 Threads / Bluesky
API wrappers are easy. AI excellence is hard. 🛠️

In the latest episode, Sarah Drabner (VP of Product Engineering) breaks down why modern product teams must move from single-prompt hacks to multi-stage pipelines using Gemini 3.6 Flash.

The secret? Extract a pristine, high-fidelity transcript first, then run downstream summaries. Faster, cheaper, and infinitely more reliable. 🚀

---

#### 🌐 Facebook / Mastodon
How is your engineering team balancing speed and quality when building AI features? 

In this episode of the Product Mindset podcast, Sarah Drabner, VP of Product Engineering, shares her playbook on sequential workflow automation. Instead of overloading a single API call with complex prompts, Sarah recommends building a multi-stage pipeline:
1️⃣ High-fidelity transcribing (preserving speaker voice/identity)
2️⃣ Targeted downstream generation (chapters, summaries, takeaways)

Check out the clip and let us know your thoughts on sequential pipelines! 👇`
  },
  {
    id: "sample-brief",
    filename: "Marketing_Brief_Sync.mp3",
    fileSize: 12687770, // 12.1MB
    status: "archived",
    progress: 100,
    createdAt: Date.now() + 1000 * 365 * 24 * 3600 * 1000 - 30000,
    modelUsed: "gemini-3.6-flash",
    transcript: `[00:01] SPEAKER A: Let's quickly sync on the Q3 marketing campaigns. The podcast adoption rates are looking fantastic. Our automated workflow has processed over one thousand hours.

[00:45] SPEAKER B: Yes, we need to focus on streamlining social asset creation. Creating snippets for LinkedIn and Twitter makes a huge difference in driving engagement back to the core episodes.`,
    duration: "15:02"
  }
];

// Helper to safely clean env var strings (strip surrounding quotes, whitespace)
const cleanEnvString = (val: string | undefined): string => {
  if (!val) return "";
  let s = val.trim();
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
};

const isDisableDefaultItems = (): boolean => {
  const raw = cleanEnvString(process.env.DISABLE_DEFAULT_ITEMS).toLowerCase();
  return ["true", "1", "yes", "enabled", "on"].includes(raw);
};

// Disk persistence helper routines
const JOBS_DB_PATH = path.join(UPLOADS_DIR, "jobs.json");

function loadJobsFromDisk() {
  try {
    if (fs.existsSync(JOBS_DB_PATH)) {
      const rawData = fs.readFileSync(JOBS_DB_PATH, "utf-8");
      const list: TranscribeJob[] = JSON.parse(rawData);
      for (const j of list) {
        jobs.set(j.id, j);
      }
      console.log(`[Storage] Loaded ${list.length} persisted jobs from ${JOBS_DB_PATH}`);
    }
  } catch (err) {
    console.error("[Storage] Failed to load jobs from disk:", err);
  }
}

function saveJobsToDisk() {
  try {
    const list = Array.from(jobs.values());
    fs.writeFileSync(JOBS_DB_PATH, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("[Storage] Failed to save jobs to disk:", err);
  }
}

function initializeJobsStorage() {
  loadJobsFromDisk();

  if (isDisableDefaultItems()) {
    console.log("[Storage] DISABLE_DEFAULT_ITEMS=true -> Preseeded default items are DISABLED.");
    let removed = false;
    for (const sampleJob of sampleJobsList) {
      if (jobs.has(sampleJob.id)) {
        jobs.delete(sampleJob.id);
        removed = true;
      }
    }
    if (removed) {
      saveJobsToDisk();
    }
  } else {
    let seededNew = false;
    for (const sampleJob of sampleJobsList) {
      if (!jobs.has(sampleJob.id)) {
        jobs.set(sampleJob.id, sampleJob);
        seededNew = true;
      }
    }
    if (seededNew) {
      console.log("[Storage] Default sample audio jobs preseeded.");
      saveJobsToDisk();
    }
  }
}

function printStartupBanner() {
  const VERSION = "1.1.0";
  const tag = process.env.DOCKER_TAG || process.env.CONTAINER_TAG || process.env.IMAGE_TAG || "latest";
  
  let rawSha = (process.env.GIT_SHA || process.env.COMMIT_SHA || process.env.GITHUB_SHA || process.env.BUILD_SHA || process.env.IMAGE_SHA || process.env.IMAGE_DIGEST || process.env.SHA || "").trim();

  // Try reading build-info.json if present from dist build
  if (!rawSha) {
    try {
      const buildInfoPath = path.join(process.cwd(), "dist", "build-info.json");
      if (fs.existsSync(buildInfoPath)) {
        const info = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
        if (info.gitSha) rawSha = info.gitSha;
      }
    } catch {}
  }

  // Format hash tag if SHA or image digest is passed via environment at runtime
  let dockerTagOutput = tag;
  if (rawSha) {
    if (rawSha.startsWith("sha256:")) {
      dockerTagOutput = `${tag} (${rawSha.substring(0, 19)})`;
    } else if (/^[a-f0-9]{64}$/i.test(rawSha)) {
      dockerTagOutput = `${tag} (sha256: ${rawSha.substring(0, 12)})`;
    } else if (/^[a-f0-9]{40}$/i.test(rawSha)) {
      dockerTagOutput = `${tag} (sha: ${rawSha.substring(0, 8)})`;
    } else {
      dockerTagOutput = `${tag} (${rawSha})`;
    }
  }

  const banner = `
   _____           _ _          _   _           _      
  / ____|         (_) |        | \\ | |         | |     
 | (___   ___ _ __ _| |__   ___|  \\| | ___   __| | ___ 
  \\___ \\ / __| '__| | '_ \\ / _ \\ . \` |/ _ \\ / _\` |/ _ \\
  ____) | (__| |  | | |_) |  __/ |\\  | (_) | (_| |  __/
 |_____/ \\___|_|  |_|_.__/ \\___|_| \\_|\\___/ \\__,_|\\___|
`;
  console.log(banner);
  console.log(`=======================================================`);
  console.log(` ScribeNode - AI Speech & Transcript Engine`);
  console.log(` Version      : v${VERSION}`);
  console.log(` Docker/Tag   : ${dockerTagOutput}`);
  console.log(` Environment  : ${process.env.NODE_ENV || 'development'}`);
  console.log(` Node Runtime : ${process.version} (${process.platform} ${process.arch})`);
  console.log(` Server URL   : http://0.0.0.0:${PORT}`);
  console.log(` Uploads Dir  : ${UPLOADS_DIR}`);
  console.log(` Temp Storage : ${os.tmpdir()}`);
  console.log(` Gemini API   : ${process.env.GEMINI_API_KEY ? 'Configured [OK]' : 'NOT CONFIGURED [WARNING]'}`);
  console.log(` Preseed Items: ${isDisableDefaultItems() ? 'Disabled (DISABLE_DEFAULT_ITEMS=true)' : 'Enabled (Default)'}`);
  console.log(`=======================================================\n`);
}

function cleanOrphanedAndTempFiles() {
  console.log("[Storage GC] Running storage & temp directory cleanup sweep...");
  let removedCount = 0;
  let bytesFreed = 0;

  // 1. Clean orphaned upload files in UPLOADS_DIR
  try {
    if (fs.existsSync(UPLOADS_DIR)) {
      const activeFilePaths = new Set<string>();
      for (const job of jobs.values()) {
        if (job.localFilePath) {
          activeFilePaths.add(path.resolve(job.localFilePath));
        }
      }

      const files = fs.readdirSync(UPLOADS_DIR);
      for (const file of files) {
        if (file === "jobs.json") continue; // Protect jobs database
        const fullPath = path.resolve(path.join(UPLOADS_DIR, file));
        if (!activeFilePaths.has(fullPath)) {
          try {
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
              bytesFreed += stats.size;
              fs.unlinkSync(fullPath);
              removedCount++;
              console.log(`[Storage GC] Deleted orphaned upload file: ${file} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
            }
          } catch (err) {
            console.error(`[Storage GC] Error deleting orphaned upload file ${file}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error("[Storage GC] Failed cleaning UPLOADS_DIR:", err);
  }

  // 2. Clean stale temporary upload files in os.tmpdir() older than 15 minutes
  try {
    const tmpDir = os.tmpdir();
    if (fs.existsSync(tmpDir)) {
      const now = Date.now();
      const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
      const files = fs.readdirSync(tmpDir);

      for (const file of files) {
        const fullPath = path.join(tmpDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile() && (now - stats.mtimeMs) > MAX_AGE_MS) {
            // Match multer temporary upload files (32 char hex or common temp upload prefixes/extensions)
            if (/^[a-f0-9]{32}$/i.test(file) || file.startsWith("multer-") || file.endsWith(".audio") || file.endsWith(".tmp")) {
              bytesFreed += stats.size;
              fs.unlinkSync(fullPath);
              removedCount++;
              console.log(`[Storage GC] Deleted stale temp file: ${file} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error("[Storage GC] Failed cleaning temp dir:", err);
  }

  if (removedCount > 0) {
    console.log(`[Storage GC] Sweep completed. Removed ${removedCount} stale/orphaned file(s), freed ${(bytesFreed / (1024 * 1024)).toFixed(2)} MB.`);
  } else {
    console.log("[Storage GC] Storage clean. No orphaned or stale temporary files found.");
  }
}

// Initial load on server boot
loadJobsFromDisk();

const BASE_TRANSCRIPTION_STANDARDS = `# Role & Operational Goal
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

function getSystemInstruction(style: string): string {
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

async function processTranscriptionJob(
  jobId: string,
  tempFilePath: string,
  mimeType: string,
  promptStyle: string,
  customPrompt?: string
) {
  const job = jobs.get(jobId);
  if (!job) {
    try { fs.unlinkSync(tempFilePath); } catch {}
    return;
  }

  try {
    // 1. Upload to Gemini Files API
    job.status = 'processing_audio';
    job.progress = 20;
    jobs.set(jobId, job);

    console.log(`[Job ${jobId}] Uploading local file ${tempFilePath} to Gemini Files API...`);
    const uploadResult = await getAIClient().files.upload({
      file: tempFilePath,
      config: {
        mimeType: mimeType || 'audio/mp3',
      }
    });

    const remoteFileName = uploadResult.name;
    if (!remoteFileName) {
      throw new Error("Upload failed: remote file name missing.");
    }

    // Delete the local temp file immediately to save disk space
    try {
      fs.unlinkSync(tempFilePath);
      console.log(`[Job ${jobId}] Local file successfully deleted from temp storage.`);
    } catch (err) {
      console.error(`[Job ${jobId}] Failed to delete local temp file:`, err);
    }

    job.progress = 40;
    jobs.set(jobId, job);

    // 2. Poll the File status
    console.log(`[Job ${jobId}] Polling status for remote file ${remoteFileName}...`);
    let file = await getAIClient().files.get({ name: remoteFileName });
    let attempts = 0;
    const maxAttempts = 150; // Max 5 minutes of polling
    
    while (file.state === 'PROCESSING' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      file = await getAIClient().files.get({ name: remoteFileName });
      attempts++;
      
      const processingProgress = Math.min(40 + attempts * 2, 65);
      job.progress = processingProgress;
      jobs.set(jobId, job);
    }

    if (file.state === 'FAILED') {
      throw new Error("Gemini file processing failed.");
    }
    
    if (file.state !== 'ACTIVE') {
      throw new Error("File processing timed out or entered an unexpected state.");
    }

    console.log(`[Job ${jobId}] File is ACTIVE. Executing Gemini transcription...`);
    job.status = 'transcribing';
    job.progress = 75;
    jobs.set(jobId, job);

    // 3. Generate Transcription
    const instruction = getSystemInstruction(promptStyle);
    let promptText = "Please transcribe this entire recording following the strict polished clean verbatim standards. Do not summarize or skip spoken content.";
    if (customPrompt && customPrompt.trim()) {
      promptText = customPrompt;
    } else if (promptStyle === 'combined') {
      promptText = "Please transcribe this recording in Markdown format starting with exactly ONE H1 title line (# Title), followed by speaker turns and macro timestamps [MM:SS] or [HH:MM:SS], adhering strictly to the polished clean verbatim transcription standards. Do NOT include preambles, horizontal rules, or duplicate headers.";
    } else if (promptStyle === 'timestamped') {
      promptText = "Please transcribe this recording in Markdown format starting with exactly ONE H1 title line (# Title), followed by macro timestamps [MM:SS] or [HH:MM:SS] at natural paragraph breaks, adhering strictly to the polished clean verbatim transcription standards.";
    } else if (promptStyle === 'verbatim') {
      promptText = "Please transcribe this recording in Markdown format starting with exactly ONE H1 title line (# Title), with clearly identified speaker turns, adhering strictly to the polished clean verbatim transcription standards.";
    }

    const { response, model } = await generateContentWithFallback({
      contents: [
        {
          fileData: {
            fileUri: file.uri,
            mimeType: file.mimeType
          }
        },
        {
          text: promptText
        }
      ],
      config: {
        systemInstruction: instruction,
        temperature: 0.2,
      },
      onModelSelected: (selectedModel) => {
        job.modelUsed = selectedModel;
        jobs.set(jobId, job);
      }
    });

    const transcript = response.text;
    if (!transcript) {
      throw new Error("Received empty response from transcription model.");
    }

    console.log(`[Job ${jobId}] Job finished successfully using model: ${model}`);
    job.status = 'completed';
    job.progress = 100;
    job.transcript = transcript;
    job.modelUsed = model;
    jobs.set(jobId, job);
    saveJobsToDisk();

    // Cleanup file from Gemini cloud files storage to keep it neat
    try {
      await getAIClient().files.delete({ name: remoteFileName });
      console.log(`[Job ${jobId}] Deleted file from Gemini remote storage: ${remoteFileName}`);
    } catch (err) {
      console.warn(`[Job ${jobId}] Could not delete file from Gemini storage:`, err);
    }

  } catch (err: any) {
    console.error(`[Job ${jobId}] Error:`, err);
    job.status = 'failed';
    job.error = err.message || "Failed to process the audio file.";
    jobs.set(jobId, job);
    saveJobsToDisk();

    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {}
  }
}

async function startServer() {
  // Initialize jobs storage and check preseeded items setting
  initializeJobsStorage();

  // Parse json and urlencoded payloads
  app.use(express.json({ limit: '10mb' }));

  // Helper to determine if Basic Auth is genuinely enabled
  const getBasicAuthCredentials = (): { enabled: boolean; user: string; pass: string; reason: string } => {
    const rawEnableFlag = cleanEnvString(process.env.BASIC_AUTH_ENABLED || process.env.ENABLE_BASIC_AUTH).toLowerCase();
    const rawDisableFlag = cleanEnvString(process.env.DISABLE_BASIC_AUTH).toLowerCase();

    // 1. Explicit disable flag
    if (["true", "1", "yes", "enabled", "on"].includes(rawDisableFlag)) {
      return { enabled: false, user: "", pass: "", reason: "DISABLE_BASIC_AUTH is set to true" };
    }

    // 2. Strict Opt-In requirement: BASIC_AUTH_ENABLED must be explicitly set to 'true'
    const isExplicitlyEnabled = ["true", "1", "yes", "enabled", "on"].includes(rawEnableFlag);
    if (!isExplicitlyEnabled) {
      return {
        enabled: false,
        user: "",
        pass: "",
        reason: "BASIC_AUTH_ENABLED is not set to 'true' (defaults to FULLY DISABLED)"
      };
    }

    // 3. Validate user and password credentials
    const user = cleanEnvString(process.env.BASIC_AUTH_USER);
    const pass = cleanEnvString(process.env.BASIC_AUTH_PASS);

    if (!user || !pass) {
      return {
        enabled: false,
        user: "",
        pass: "",
        reason: "BASIC_AUTH_ENABLED is 'true', but BASIC_AUTH_USER or BASIC_AUTH_PASS is missing or empty"
      };
    }

    const invalidTokens = [
      "",
      "null",
      "undefined",
      "none",
      "disabled",
      "false",
      "off",
      "0",
      "unset",
      "$basic_auth_user",
      "${basic_auth_user}",
      "$basic_auth_pass",
      "${basic_auth_pass}",
      "your_secure_password_here"
    ];

    if (invalidTokens.includes(user.toLowerCase()) || invalidTokens.includes(pass.toLowerCase())) {
      return {
        enabled: false,
        user: "",
        pass: "",
        reason: `Placeholder or invalid token detected ("${user}" / "${pass}")`
      };
    }

    return { enabled: true, user, pass, reason: "Explicitly enabled via BASIC_AUTH_ENABLED=true" };
  };

  // Unauthenticated Health Probe Endpoint
  app.get(["/api/health", "/healthz", "/health"], (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Optional HTTP Basic Auth for private deployment
  const authState = getBasicAuthCredentials();

  if (authState.enabled) {
    console.log(`[Auth] Basic authentication ENABLED for user "${authState.user}".`);
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const match = authHeader.match(/^Basic\s+(.*)$/i);
        if (match) {
          const credentials = Buffer.from(match[1], 'base64').toString('utf-8');
          const [reqUser, reqPass] = credentials.split(':');
          if (reqUser === authState.user && reqPass === authState.pass) {
            return next();
          }
        }
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="Private Audio Transcriber App"');
      return res.status(401).send('Unauthorized: Password required.');
    });
  } else {
    console.log(`[Auth] Basic authentication DISABLED (${authState.reason}).`);
  }

  // API Routes
  app.get("/api/config", (req, res) => {
    const appTitle = process.env.APP_TITLE || "ScribeNode – Transcription Engine";
    res.json({
      appTitle,
      basicAuthEnabled: authState.enabled,
      disableDefaultItems: isDisableDefaultItems(),
      hasGeminiKey: Boolean(cleanEnvString(process.env.GEMINI_API_KEY))
    });
  });

  app.post("/api/transcribe", (req, res, next) => {
    console.log("[API] POST /api/transcribe - Request received, content-type:", req.headers['content-type']);
    next();
  }, upload.single("file") as any, async (req, res) => {
    try {
      console.log("[API] POST /api/transcribe - File parsed successfully:", req.file ? {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path
      } : "No file received");

      if (!process.env.GEMINI_API_KEY) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch {}
        }
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Please upload an audio file." });
      }

      const { promptStyle, customPrompt, duration } = req.body;
      const jobId = Math.random().toString(36).substring(2, 15);
      
      // Save copy to UPLOADS_DIR for re-transcription reuse
      const localFilePath = path.join(UPLOADS_DIR, `${jobId}.audio`);
      try {
        fs.copyFileSync(req.file.path, localFilePath);
      } catch (err) {
        console.error("[API] Failed to copy file to persistent uploads directory:", err);
      }

      const job: TranscribeJob = {
        id: jobId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: 'uploading',
        progress: 10,
        createdAt: Date.now(),
        localFilePath,
        mimeType: req.file.mimetype,
        modelUsed: 'gemini-3.6-flash',
        duration: duration || "--:--",
      };
      
      jobs.set(jobId, job);
      saveJobsToDisk();
      
      // Run background transcription process (uses req.file.path which is the temp multer file)
      processTranscriptionJob(jobId, req.file.path, req.file.mimetype, promptStyle, customPrompt);
      
      res.json({ jobId });
    } catch (err: any) {
      console.error("[API] Transcribe API error inside route handler:", err);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      res.status(500).json({ error: err.message || "Failed to start transcription job" });
    }
  });

  app.get("/api/jobs", (req, res) => {
    const allJobs = Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
    res.json(allJobs);
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  });

  app.delete("/api/jobs/:id", (req, res) => {
    const jobId = req.params.id;
    const job = jobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Clean up local persistent file if exists
    if (job.localFilePath) {
      try {
        if (fs.existsSync(job.localFilePath)) {
          fs.unlinkSync(job.localFilePath);
          console.log(`[API] Deleted local file ${job.localFilePath}`);
        }
      } catch (err) {
        console.error("[API] Failed to delete local persistent file:", err);
      }
    }
    
    jobs.delete(jobId);
    saveJobsToDisk();
    cleanOrphanedAndTempFiles();
    res.json({ success: true, message: `Job ${jobId} deleted successfully` });
  });

  app.post("/api/jobs/:id/retranscribe", async (req, res) => {
    try {
      const parentJobId = req.params.id;
      const parentJob = jobs.get(parentJobId);
      if (!parentJob) {
        return res.status(404).json({ error: "Original job not found" });
      }

      const { promptStyle, customPrompt } = req.body;
      const jobId = Math.random().toString(36).substring(2, 15);

      // Handle sample jobs mock simulation
      if (parentJobId.startsWith("sample-")) {
        let simulatedTranscript = parentJob.transcript || "";
        
        if (promptStyle === "clean") {
          // Remove timestamps and speaker tags
          simulatedTranscript = simulatedTranscript
            .replace(/\[\d{2}:\d{2}\] SPEAKER [A-Z]:\s*/g, "")
            .replace(/\[\d{2}:\d{2}:\d{2}\] SPEAKER [A-Z]:\s*/g, "")
            .replace(/SPEAKER [A-Z]:\s*/g, "");
        } else if (promptStyle === "timestamped") {
          // Remove speaker tags but keep timestamps
          simulatedTranscript = simulatedTranscript
            .replace(/SPEAKER [A-Z]:\s*/g, "");
        } else if (promptStyle === "verbatim") {
          // Keep speaker tags, add filler words
          simulatedTranscript = simulatedTranscript
            .replace(/Welcome/g, "Um, welcome")
            .replace(/Thanks/g, "Uh, thanks")
            .replace(/It's/g, "It's, like,");
        } else if (promptStyle === "combined") {
          simulatedTranscript = parentJob.transcript || "";
        } else if (promptStyle === "custom") {
          simulatedTranscript = `[Custom Processed Version based on prompt: "${customPrompt}"]\n\n${parentJob.transcript}`;
        }

        const newJob: TranscribeJob = {
          id: jobId,
          filename: `${promptStyle === 'custom' ? 'Custom' : promptStyle.charAt(0).toUpperCase() + promptStyle.slice(1)} - ${parentJob.filename}`,
          fileSize: parentJob.fileSize,
          status: 'completed',
          progress: 100,
          createdAt: Date.now(),
          transcript: simulatedTranscript,
          duration: parentJob.duration,
        };

        jobs.set(jobId, newJob);
        saveJobsToDisk();
        return res.json({ jobId });
      }

      // Handle real job re-transcription
      if (!parentJob.localFilePath || !fs.existsSync(parentJob.localFilePath)) {
        return res.status(400).json({ error: "The audio file for this job is no longer available. Please upload the file again." });
      }

      // Copy file to a new path for this job so they have separate lifecycles
      const newFilePath = path.join(UPLOADS_DIR, `${jobId}.audio`);
      try {
        fs.copyFileSync(parentJob.localFilePath, newFilePath);
      } catch (err) {
        console.error("[API] Failed to copy file for re-transcription:", err);
        return res.status(500).json({ error: "Failed to set up file for re-transcription." });
      }

      const job: TranscribeJob = {
        id: jobId,
        filename: `${promptStyle === 'custom' ? 'Custom' : promptStyle.charAt(0).toUpperCase() + promptStyle.slice(1)} - ${parentJob.filename}`,
        fileSize: parentJob.fileSize,
        status: 'uploading',
        progress: 15,
        createdAt: Date.now(),
        localFilePath: newFilePath,
        mimeType: parentJob.mimeType,
        duration: parentJob.duration || "--:--",
      };

      jobs.set(jobId, job);
      saveJobsToDisk();
      processTranscriptionJob(jobId, newFilePath, job.mimeType || 'audio/mp3', promptStyle, customPrompt);
      res.json({ jobId });

    } catch (err: any) {
      console.error("[API] Retranscribe error:", err);
      res.status(500).json({ error: err.message || "Failed to start re-transcription" });
    }
  });

  app.post("/api/jobs/:id/archive", (req, res) => {
    const jobId = req.params.id;
    const job = jobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (job.status === 'archived') {
      job.status = 'completed';
    } else if (job.status === 'completed') {
      job.status = 'archived';
    } else {
      return res.status(400).json({ error: "Only completed jobs can be archived or unarchived." });
    }
    jobs.set(jobId, job);
    saveJobsToDisk();
    res.json(job);
  });

  // Secondary rapid analysis endpoint (Show notes, Summary, Chapters, Social posts)
  app.post("/api/jobs/:id/analyze", async (req, res) => {
    try {
      const job = jobs.get(req.params.id);
      if (!job || (job.status !== 'completed' && job.status !== 'archived') || !job.transcript) {
        return res.status(404).json({ error: "Completed job not found" });
      }

      const { mode } = req.body; // 'summary' | 'key_takeaways' | 'chapters' | 'social_media'
      let prompt = "";
      
      if (mode === 'summary') {
        prompt = "Generate a concise executive summary and overview of the following podcast transcript. Use clear sections, bullet points, and highlight the main topic discussed.";
      } else if (mode === 'key_takeaways') {
        prompt = "Extract the top 5-10 actionable key takeaways, lessons, or insights from the following podcast transcript. Make them concise and highly valuable.";
      } else if (mode === 'chapters') {
        prompt = "Analyze the following transcript and break it down into logical sequential chapters/topics with timestamps (e.g., [12:34] Introduction, [15:45] Main Discussion Point, etc.) and a 1-sentence description for each chapter.";
      } else if (mode === 'social_media') {
        prompt = "Based on this podcast transcript, generate a set of short, highly concise, objective, and non-personal listener sharing drafts for Facebook, Threads, Mastodon, or Bluesky. Write them from the perspective of an appreciative listener sharing an interesting episode they enjoyed with their followers. Focus on summarizing the core topic or an interesting takeaway. Do not make it look like self-promotion or host-written copy. Keep it short, engaging, and readable.";
      } else {
        return res.status(400).json({ error: "Invalid analysis mode" });
      }

      const { response, model } = await generateContentWithFallback({
        contents: [
          { text: `Podcast Transcript:\n\n${job.transcript}` },
          { text: prompt }
        ],
        config: {
          systemInstruction: "You are a professional content marketing and podcast assistant. Your goal is to analyze transcripts and generate high-quality, engaging promotional material, clear documentation, and listener sharing drafts."
        }
      });

      const text = response.text;
      
      // Store on the job object so it persists across client state changes
      if (mode === 'summary') job.summary = text;
      else if (mode === 'key_takeaways') job.key_takeaways = text;
      else if (mode === 'chapters') job.chapters = text;
      else if (mode === 'social_media') job.social_media = text;
      
      jobs.set(job.id, job);
      saveJobsToDisk();

      res.json({ result: text, modelUsed: model });
    } catch (err: any) {
      console.error("Analysis API error:", err);
      res.status(500).json({ error: err.message || "Failed to analyze transcript" });
    }
  });

  // Error handling middleware to catch errors and return JSON instead of HTML
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[EXPRESS ERROR]", err);
    res.status(err.status || 500).json({
      error: err.message || "An unexpected server error occurred during request processing.",
      code: err.code || null,
      name: err.name || null
    });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*all', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf-8');
        const appTitle = process.env.APP_TITLE || "ScribeNode – Transcription Engine";
        html = html.replace(/<title>.*?<\/title>/i, `<title>${appTitle}</title>`);
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      }
      res.sendFile(indexPath);
    });
  }

  // Run initial storage & temp directory GC sweep and schedule periodic checks
  cleanOrphanedAndTempFiles();
  setInterval(cleanOrphanedAndTempFiles, 15 * 60 * 1000);

  app.listen(PORT, "0.0.0.0", () => {
    printStartupBanner();
  });
}

startServer();
