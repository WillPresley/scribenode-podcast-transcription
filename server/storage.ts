import fs from 'fs';
import path from 'path';
import os from 'os';
import { isDisableDefaultItems } from './config';
import { resolveJobDurationSync } from './audioDuration';

export interface TranscribeJob {
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
  hasAudioFile?: boolean;
  modelUsed?: string;
  summary?: string;
  key_takeaways?: string;
  chapters?: string;
  social_media?: string;
  glossary?: string;
  customVocabulary?: string[];
  sourceType?: 'upload' | 'rss' | 'url';
  sourceUrl?: string;
  feedTitle?: string;
  episodeTitle?: string;
}

export const sampleJobsList: TranscribeJob[] = [
  {
    id: "sample-sarah",
    filename: "Interview_Sarah_Drabner_Final.mp3",
    fileSize: 43200000,
    status: "completed",
    progress: 100,
    createdAt: Date.now() + 1000 * 365 * 24 * 3600 * 1000,
    modelUsed: "gemini-3.7-flash",
    transcript: `[00:12] SPEAKER A: Welcome to the Product Mindset podcast. Today we're diving deep into the architecture of modern SaaS applications and how engineering teams can leverage AI models to automate workflows. I'm joined today by Sarah Drabner, VP of Product Engineering. Welcome, Sarah.

[00:34] SPEAKER B: Thanks for having me! It's fascinating because the barrier to entry has never been lower, but the barrier to excellence has never been higher. When we talk about building with APIs, specifically Gemini 3.7 Flash, it completely changes how we approach multimodal processing of large audio, video, and text streams.

[01:15] SPEAKER A: Absolutely. We've seen teams struggle with latency and cost. How do you balance transcription quality with rapid content generation?

[01:45] SPEAKER B: The key is multi-stage workflows. First, use a highly capable reasoning model like Gemini 3.7 Flash for direct audio-to-text alignment, which maintains speaker identity and captures verbal nuances. Once you have that high-fidelity transcript, you feed it into downstream summarization and chaptering pipelines. That keeps things highly cost-efficient and incredibly fast.`,
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
    fileSize: 12687770,
    status: "archived",
    progress: 100,
    createdAt: Date.now() + 1000 * 365 * 24 * 3600 * 1000 - 30000,
    modelUsed: "gemini-3.6-flash",
    transcript: `[00:01] SPEAKER A: Let's quickly sync on the Q3 marketing campaigns. The podcast adoption rates are looking fantastic. Our automated workflow has processed over one thousand hours.

[00:45] SPEAKER B: Yes, we need to focus on streamlining social asset creation. Creating snippets for LinkedIn and Twitter makes a huge difference in driving engagement back to the core episodes.`,
    duration: "15:02"
  }
];

export class JobsStorage {
  private jobs = new Map<string, TranscribeJob>();
  public uploadsDir: string;
  public dbPath: string;

  constructor(uploadsDir = path.join(process.cwd(), "uploads")) {
    this.uploadsDir = uploadsDir;
    this.dbPath = path.join(this.uploadsDir, "jobs.json");
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  public get(id: string): TranscribeJob | undefined {
    return this.jobs.get(id);
  }

  public set(id: string, job: TranscribeJob): void {
    this.jobs.set(id, job);
  }

  public has(id: string): boolean {
    return this.jobs.has(id);
  }

  public delete(id: string): boolean {
    return this.jobs.delete(id);
  }

  public values(): TranscribeJob[] {
    return Array.from(this.jobs.values());
  }

  public clear(): void {
    this.jobs.clear();
  }

  public loadFromDisk(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const rawData = fs.readFileSync(this.dbPath, "utf-8");
        const list: TranscribeJob[] = JSON.parse(rawData);
        for (const j of list) {
          this.jobs.set(j.id, j);
        }
      }
    } catch (err) {
      console.error("[Storage] Failed to load jobs from disk:", err);
    }
  }

  public saveToDisk(): void {
    try {
      const list = Array.from(this.jobs.values());
      fs.writeFileSync(this.dbPath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      console.error("[Storage] Failed to save jobs to disk:", err);
    }
  }

  public initialize(env = process.env): void {
    this.loadFromDisk();

    if (isDisableDefaultItems(env)) {
      let removed = false;
      for (const sampleJob of sampleJobsList) {
        if (this.jobs.has(sampleJob.id)) {
          this.jobs.delete(sampleJob.id);
          removed = true;
        }
      }
      if (removed) {
        this.saveToDisk();
      }
    } else {
      let seededNew = false;
      for (const sampleJob of sampleJobsList) {
        if (!this.jobs.has(sampleJob.id)) {
          this.jobs.set(sampleJob.id, sampleJob);
          seededNew = true;
        }
      }
      if (seededNew) {
        this.saveToDisk();
      }
    }

    // Auto-heal and populate missing durations for stored jobs
    let healedDurations = false;
    for (const [id, job] of this.jobs.entries()) {
      if (!job.duration || job.duration === "--:--" || job.duration.trim() === "") {
        const resolved = resolveJobDurationSync(job);
        if (resolved && resolved !== "--:--") {
          job.duration = resolved;
          healedDurations = true;
        }
      }
    }
    if (healedDurations) {
      this.saveToDisk();
    }
  }

  public cleanOrphanedAndTempFiles(tmpDir = os.tmpdir()): { removedCount: number; bytesFreed: number } {
    let removedCount = 0;
    let bytesFreed = 0;

    // 1. Clean orphaned upload files in uploadsDir
    try {
      if (fs.existsSync(this.uploadsDir)) {
        const activeFilePaths = new Set<string>();
        for (const job of this.jobs.values()) {
          if (job.localFilePath) {
            activeFilePaths.add(path.resolve(job.localFilePath));
          }
        }

        const files = fs.readdirSync(this.uploadsDir);
        for (const file of files) {
          if (file === "jobs.json") continue;
          const fullPath = path.resolve(path.join(this.uploadsDir, file));
          if (!activeFilePaths.has(fullPath)) {
            try {
              const stats = fs.statSync(fullPath);
              if (stats.isFile()) {
                bytesFreed += stats.size;
                fs.unlinkSync(fullPath);
                removedCount++;
              }
            } catch {}
          }
        }
      }
    } catch {}

    // 2. Clean stale temporary upload files in tmpDir older than 15 minutes
    try {
      if (fs.existsSync(tmpDir)) {
        const now = Date.now();
        const MAX_AGE_MS = 15 * 60 * 1000;
        const files = fs.readdirSync(tmpDir);

        for (const file of files) {
          const fullPath = path.join(tmpDir, file);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.isFile() && (now - stats.mtimeMs) > MAX_AGE_MS) {
              if (/^[a-f0-9]{32}$/i.test(file) || file.startsWith("multer-") || file.endsWith(".audio") || file.endsWith(".tmp")) {
                bytesFreed += stats.size;
                fs.unlinkSync(fullPath);
                removedCount++;
              }
            }
          } catch {}
        }
      }
    } catch {}

    return { removedCount, bytesFreed };
  }
}
