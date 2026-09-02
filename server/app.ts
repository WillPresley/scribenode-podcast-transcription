import express, { Express } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { cleanEnvString, isDisableDefaultItems, getBasicAuthCredentials, getMaxUploadSizeMB, getMaxUploadSizeBytes } from "./config";
import { JobsStorage, TranscribeJob, sampleJobsList } from "./storage";
import {
  getSystemInstruction,
  buildTranscriptionPrompt,
  generateContentWithFallback,
  extractResponseText,
  formatGeminiErrorMessage,
  categorizeModelError,
  formatFallbackReason,
  formatModelDisplayName,
  renameSpeakerInTranscript,
  DEFAULT_TRANSCRIPTION_MODELS,
  DEFAULT_ANALYSIS_MODELS,
  getTranscriptionModelsForJob
} from "./transcriptionEngine";
import { fetchRssFeed } from "./rss";
import { downloadRemoteAudio } from "./remote";
import { ModelStatusInfo, ModelErrorDetails } from "../src/types";

export type { ModelStatusInfo };

export interface CreateAppOptions {
  storage?: JobsStorage;
  aiClient?: GoogleGenAI | null;
  env?: NodeJS.ProcessEnv;
  skipVite?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const env = options.env || process.env;
  const storage = options.storage || new JobsStorage();
  storage.initialize(env);

  const modelStatus: ModelStatusInfo = {
    primaryModel: DEFAULT_TRANSCRIPTION_MODELS[0],
    activeModel: DEFAULT_TRANSCRIPTION_MODELS[0],
    fallbackModels: [...DEFAULT_TRANSCRIPTION_MODELS],
    status: 'optimal',
    lastTestedTimestamp: Date.now(),
    modelErrors: {}
  };

  const recordModelError = (model: string, rawError: any, friendlyError?: string, shortBadge?: string) => {
    if (!modelStatus.modelErrors) {
      modelStatus.modelErrors = {};
    }
    const cat = categorizeModelError(rawError);
    const rawStr = typeof rawError === "string" ? rawError : (rawError?.message || String(rawError || ""));
    modelStatus.modelErrors[model] = {
      rawError: rawStr.slice(0, 200),
      friendlyMessage: friendlyError || cat.friendlyMessage,
      shortBadge: shortBadge || cat.shortBadge,
      category: cat.category,
      timestamp: Date.now()
    };
  };

  const updateModelStatus = (selectedModel: string, reason?: string) => {
    modelStatus.activeModel = selectedModel;
    modelStatus.lastUsedModel = selectedModel;
    modelStatus.lastTestedTimestamp = Date.now();
    if (selectedModel !== modelStatus.primaryModel) {
      modelStatus.status = 'fallback_active';
      modelStatus.lastFallbackReason = reason || `Automated failover active from ${formatModelDisplayName(modelStatus.primaryModel)} to ${formatModelDisplayName(selectedModel)}`;
    } else {
      modelStatus.status = 'optimal';
      modelStatus.lastFallbackReason = undefined;
      // If primary model succeeded, clear any recorded error on it
      if (modelStatus.modelErrors?.[selectedModel]) {
        delete modelStatus.modelErrors[selectedModel];
      }
    }
  };

  const app = express();

  const maxUploadSizeMB = getMaxUploadSizeMB(env);
  const maxUploadSizeBytes = getMaxUploadSizeBytes(env);

  const upload = multer({
    dest: os.tmpdir(),
    limits: {
      fileSize: maxUploadSizeBytes,
    }
  });

  let aiInstance: GoogleGenAI | null = options.aiClient ?? null;

  function getAIClient(): GoogleGenAI {
    if (!aiInstance) {
      const apiKey = env.GEMINI_API_KEY;
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

  // Parse json and urlencoded payloads
  app.use(express.json({ limit: '10mb' }));

  // Unauthenticated Health Probe Endpoint
  app.get(["/api/health", "/healthz", "/health"], (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Optional HTTP Basic Auth for private deployment
  const authState = getBasicAuthCredentials(env);

  if (authState.enabled) {
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
  }

  // API Routes
  app.get("/api/config", (req, res) => {
    const appTitle = env.APP_TITLE || "ScribeNode – Transcription Engine";
    res.json({
      appTitle,
      basicAuthEnabled: authState.enabled,
      disableDefaultItems: isDisableDefaultItems(env),
      hasGeminiKey: Boolean(cleanEnvString(env.GEMINI_API_KEY)),
      modelStatus,
      maxUploadSizeMB
    });
  });

  app.get("/api/model-status", (req, res) => {
    res.json(modelStatus);
  });

  async function processTranscriptionJob(
    jobId: string,
    tempFilePath: string,
    mimeType: string,
    promptStyle: string,
    customPrompt?: string,
    customVocabulary?: string[] | string
  ) {
    const job = storage.get(jobId);
    if (!job) {
      try { fs.unlinkSync(tempFilePath); } catch {}
      return;
    }

    try {
      job.status = 'processing_audio';
      job.progress = 20;
      storage.set(jobId, job);

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

      try {
        fs.unlinkSync(tempFilePath);
      } catch {}

      job.progress = 40;
      storage.set(jobId, job);

      let file = await getAIClient().files.get({ name: remoteFileName });
      let attempts = 0;
      const maxAttempts = 150;
      
      while (file.state === 'PROCESSING' && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        file = await getAIClient().files.get({ name: remoteFileName });
        attempts++;
        job.progress = Math.min(40 + attempts * 2, 65);
        storage.set(jobId, job);
      }

      if (file.state === 'FAILED') {
        throw new Error("Gemini file processing failed.");
      }
      
      if (file.state !== 'ACTIVE') {
        throw new Error("File processing timed out or entered an unexpected state.");
      }

      job.status = 'transcribing';
      job.progress = 75;
      storage.set(jobId, job);

      const transcriptionModelsToTry = getTranscriptionModelsForJob(job.duration);

      const audioTitle = job.filename ? job.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : undefined;

      const vocabList = customVocabulary
        ? (Array.isArray(customVocabulary) ? customVocabulary : customVocabulary.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean))
        : undefined;

      const { response, model, text: generatedTranscript } = await generateContentWithFallback({
        aiClient: getAIClient(),
        modelsToTry: transcriptionModelsToTry,
        promptStyle,
        customPrompt,
        customVocabulary: vocabList,
        audioTitle,
        fileUri: file.uri,
        mimeType: file.mimeType,
        config: {
          temperature: 0.2,
        },
        onModelSelected: (selectedModel) => {
          job.modelUsed = selectedModel;
          storage.set(jobId, job);
          updateModelStatus(selectedModel);
        },
        onModelError: (failedModel, rawError, friendlyError, shortBadge) => {
          recordModelError(failedModel, rawError, friendlyError, shortBadge);
        },
        onFallbackTransition: (fromModel, toModel, reason, friendlyReason) => {
          console.warn(`[Failover] Transcription model failover: ${fromModel} -> ${toModel}. Reason: ${friendlyReason || reason}`);
          updateModelStatus(toModel, friendlyReason || `Failover from ${fromModel}: ${reason.slice(0, 80)}`);
        }
      });

      const transcript = generatedTranscript || extractResponseText(response, promptStyle, audioTitle);
      if (!transcript || !transcript.trim()) {
        throw new Error("Received empty response from transcription model.");
      }

      job.status = 'completed';
      job.progress = 100;
      job.transcript = transcript;
      job.modelUsed = model;
      storage.set(jobId, job);
      storage.saveToDisk();

      try {
        await getAIClient().files.delete({ name: remoteFileName });
      } catch {}

    } catch (err: any) {
      console.error(`[Job ${jobId}] Error:`, err);
      job.status = 'failed';
      job.error = formatGeminiErrorMessage(err);
      storage.set(jobId, job);
      storage.saveToDisk();

      const categorized = categorizeModelError(err);
      if (categorized.category === "high_demand") {
        modelStatus.status = 'degraded';
        modelStatus.lastFallbackReason = "All AI models are currently experiencing high demand. Please try again later.";
      }

      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {}
    }
  }

  // RSS Feed Preview Endpoint
  app.post("/api/rss/preview", async (req, res) => {
    try {
      const { feedUrl } = req.body;
      if (!feedUrl || typeof feedUrl !== "string" || !feedUrl.trim()) {
        return res.status(400).json({ error: "Please provide a valid podcast RSS feed URL." });
      }
      const feed = await fetchRssFeed(feedUrl.trim());
      res.json({ feed });
    } catch (err: any) {
      console.error("[RSS Preview Error]:", err);
      res.status(400).json({ error: err.message || "Failed to load podcast RSS feed." });
    }
  });

  // Remote Audio / Podcast Episode Transcription Endpoint
  app.post("/api/transcribe-remote", async (req, res) => {
    try {
      if (!env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const { url, audioUrl, filename, promptStyle, customPrompt, duration, glossary, feedTitle, episodeTitle } = req.body;
      const targetUrl = (typeof url === "string" && url.trim()) || (typeof audioUrl === "string" && audioUrl.trim()) || "";
      if (!targetUrl) {
        return res.status(400).json({ error: "Please provide a valid audio or episode URL." });
      }

      const jobId = Math.random().toString(36).substring(2, 15);
      const localFilePath = path.join(storage.uploadsDir, `${jobId}.audio`);

      const displayName = episodeTitle || filename || (targetUrl.split("/").pop()?.split("?")[0]) || "remote-podcast-audio.mp3";

      const job: TranscribeJob = {
        id: jobId,
        filename: displayName,
        fileSize: 0,
        status: 'uploading',
        progress: 5,
        createdAt: Date.now(),
        localFilePath,
        mimeType: 'audio/mpeg',
        modelUsed: modelStatus.activeModel || DEFAULT_TRANSCRIPTION_MODELS[0],
        duration: duration || "--:--",
        glossary: glossary || undefined,
        sourceType: feedTitle ? 'rss' : 'url',
        sourceUrl: targetUrl,
        feedTitle: feedTitle || undefined,
        episodeTitle: episodeTitle || undefined
      };

      storage.set(jobId, job);
      storage.saveToDisk();

      res.json({ jobId });

      // Asynchronously download and process audio
      (async () => {
        try {
          const downloadResult = await downloadRemoteAudio({
            url: targetUrl,
            destPath: localFilePath,
            customFilename: displayName,
            maxSizeBytes: maxUploadSizeBytes
          });

          const currentJob = storage.get(jobId);
          if (!currentJob) return;

          currentJob.fileSize = downloadResult.fileSize;
          currentJob.mimeType = downloadResult.mimeType;
          currentJob.filename = downloadResult.filename || displayName;
          currentJob.progress = 15;
          storage.set(jobId, currentJob);
          storage.saveToDisk();

          const tempProcessPath = path.join(os.tmpdir(), `scribenode-${jobId}-process.audio`);
          fs.copyFileSync(localFilePath, tempProcessPath);

          processTranscriptionJob(
            jobId,
            tempProcessPath,
            downloadResult.mimeType,
            promptStyle || 'combined',
            customPrompt,
            glossary
          );
        } catch (dlErr: any) {
          console.error(`[Remote Audio Download Error for Job ${jobId}]:`, dlErr);
          const currentJob = storage.get(jobId);
          if (currentJob) {
            currentJob.status = 'failed';
            currentJob.error = dlErr.message || "Failed to download remote audio file.";
            storage.set(jobId, currentJob);
            storage.saveToDisk();
          }
        }
      })();

    } catch (err: any) {
      console.error("[Transcribe Remote Error]:", err);
      res.status(500).json({ error: err.message || "Failed to initiate remote audio transcription." });
    }
  });

  app.post("/api/transcribe", (req, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE" || err.message?.includes("File too large")) {
          return res.status(413).json({
            error: `File exceeds maximum allowed upload size of ${maxUploadSizeMB}MB. Configure MAX_UPLOAD_SIZE_MB in your environment to increase this limit.`,
            code: "LIMIT_FILE_SIZE",
            maxUploadSizeMB
          });
        }
        return res.status(400).json({
          error: err.message || "Failed to process audio file upload."
        });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!env.GEMINI_API_KEY) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch {}
        }
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Please upload an audio file." });
      }

      if (req.file.size > maxUploadSizeBytes) {
        if (req.file.path && fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch {}
        }
        return res.status(413).json({
          error: `File exceeds maximum allowed upload size of ${maxUploadSizeMB}MB. Configure MAX_UPLOAD_SIZE_MB in your environment to increase this limit.`,
          code: "LIMIT_FILE_SIZE",
          maxUploadSizeMB
        });
      }

      const { promptStyle, customPrompt, duration, glossary } = req.body;
      const jobId = Math.random().toString(36).substring(2, 15);
      
      const localFilePath = path.join(storage.uploadsDir, `${jobId}.audio`);
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
        modelUsed: modelStatus.activeModel || DEFAULT_TRANSCRIPTION_MODELS[0],
        duration: duration || "--:--",
        glossary: glossary || undefined,
        sourceType: 'upload'
      };
      
      storage.set(jobId, job);
      storage.saveToDisk();
      
      processTranscriptionJob(jobId, req.file.path, req.file.mimetype, promptStyle, customPrompt, glossary);
      
      res.json({ jobId });
    } catch (err: any) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      res.status(500).json({ error: err.message || "Failed to start transcription job" });
    }
  });

  const enrichJobWithAudioStatus = (job: TranscribeJob): TranscribeJob => {
    const hasAudio = Boolean(job.localFilePath && fs.existsSync(job.localFilePath));
    return { ...job, hasAudioFile: hasAudio };
  };

  app.get("/api/jobs", (req, res) => {
    const allJobs = storage.values()
      .map(enrichJobWithAudioStatus)
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json(allJobs);
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = storage.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(enrichJobWithAudioStatus(job));
  });

  app.get("/api/jobs/:id/audio", (req, res) => {
    const jobId = req.params.id;
    const job = storage.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (!job.localFilePath || !fs.existsSync(job.localFilePath)) {
      return res.status(404).json({ error: "Audio file not available on disk" });
    }

    const filePath = job.localFilePath;
    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      // Determine mime type
      let mimeType = job.mimeType || "audio/mpeg";
      if (!job.mimeType) {
        const ext = path.extname(job.filename).toLowerCase();
        if (ext === ".wav") mimeType = "audio/wav";
        else if (ext === ".m4a" || ext === ".mp4") mimeType = "audio/mp4";
        else if (ext === ".ogg") mimeType = "audio/ogg";
        else if (ext === ".flac") mimeType = "audio/flac";
        else if (ext === ".aac") mimeType = "audio/aac";
      }

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
          return res.end();
        }

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": mimeType,
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Accept-Ranges": "bytes",
          "Content-Type": mimeType,
        });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err: any) {
      console.error(`[API] Failed to stream audio for job ${jobId}:`, err);
      res.status(500).json({ error: "Failed to stream audio file" });
    }
  });

  app.delete("/api/jobs/:id", (req, res) => {
    const jobId = req.params.id;
    const job = storage.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (job.localFilePath) {
      try {
        if (fs.existsSync(job.localFilePath)) {
          fs.unlinkSync(job.localFilePath);
        }
      } catch {}
    }
    
    storage.delete(jobId);
    storage.saveToDisk();
    storage.cleanOrphanedAndTempFiles();
    res.json({ success: true, message: `Job ${jobId} deleted successfully` });
  });

  app.post("/api/jobs/:id/retranscribe", async (req, res) => {
    try {
      const parentJobId = req.params.id;
      const parentJob = storage.get(parentJobId);
      if (!parentJob) {
        return res.status(404).json({ error: "Original job not found" });
      }

      const { promptStyle, customPrompt } = req.body;
      const jobId = Math.random().toString(36).substring(2, 15);

      // Handle sample jobs mock simulation
      if (parentJobId.startsWith("sample-")) {
        let simulatedTranscript = parentJob.transcript || "";
        
        if (promptStyle === "clean") {
          simulatedTranscript = simulatedTranscript
            .replace(/\[\d{2}:\d{2}\] SPEAKER [A-Z]:\s*/g, "")
            .replace(/\[\d{2}:\d{2}:\d{2}\] SPEAKER [A-Z]:\s*/g, "")
            .replace(/SPEAKER [A-Z]:\s*/g, "");
        } else if (promptStyle === "timestamped") {
          simulatedTranscript = simulatedTranscript
            .replace(/SPEAKER [A-Z]:\s*/g, "");
        } else if (promptStyle === "verbatim") {
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

        storage.set(jobId, newJob);
        storage.saveToDisk();
        return res.json({ jobId });
      }

      // Handle real job re-transcription
      if (!parentJob.localFilePath || !fs.existsSync(parentJob.localFilePath)) {
        return res.status(400).json({ error: "The audio file for this job is no longer available. Please upload the file again." });
      }

      const newFilePath = path.join(storage.uploadsDir, `${jobId}.audio`);
      try {
        fs.copyFileSync(parentJob.localFilePath, newFilePath);
      } catch (err) {
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

      storage.set(jobId, job);
      storage.saveToDisk();
      processTranscriptionJob(jobId, newFilePath, job.mimeType || 'audio/mp3', promptStyle, customPrompt);
      res.json({ jobId });

    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to start re-transcription" });
    }
  });

  app.post("/api/jobs/:id/archive", (req, res) => {
    const jobId = req.params.id;
    const job = storage.get(jobId);
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
    storage.set(jobId, job);
    storage.saveToDisk();
    res.json(job);
  });

  // Update/Edit transcript inline
  app.patch("/api/jobs/:id/transcript", (req, res) => {
    const jobId = req.params.id;
    const job = storage.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    const { transcript } = req.body;
    if (typeof transcript !== "string" || !transcript.trim()) {
      return res.status(400).json({ error: "Transcript content is required." });
    }
    job.transcript = transcript;
    job.summary = undefined;
    job.key_takeaways = undefined;
    job.chapters = undefined;
    job.social_media = undefined;
    storage.set(jobId, job);
    storage.saveToDisk();
    res.json({ success: true, job });
  });

  // Rename speaker across transcript
  app.post("/api/jobs/:id/rename-speaker", (req, res) => {
    const jobId = req.params.id;
    const job = storage.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!job.transcript) {
      return res.status(400).json({ error: "Job does not have an active transcript." });
    }
    const { oldName, newName } = req.body;
    if (!oldName || !newName || typeof oldName !== "string" || typeof newName !== "string") {
      return res.status(400).json({ error: "Both oldName and newName are required." });
    }
    const updated = renameSpeakerInTranscript(job.transcript, oldName, newName);
    job.transcript = updated;
    storage.set(jobId, job);
    storage.saveToDisk();
    res.json({ success: true, job, updatedTranscript: updated });
  });

  app.post("/api/jobs/:id/analyze", async (req, res) => {
    try {
      const job = storage.get(req.params.id);
      if (!job || (job.status !== 'completed' && job.status !== 'archived') || !job.transcript) {
        return res.status(404).json({ error: "Completed job not found" });
      }

      const { mode } = req.body;
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

      const { response, model, text: generatedAnalysis } = await generateContentWithFallback({
        aiClient: getAIClient(),
        modelsToTry: DEFAULT_ANALYSIS_MODELS,
        contents: [
          { text: `Podcast Transcript:\n\n${job.transcript}` },
          { text: prompt }
        ],
        config: {
          systemInstruction: "You are a professional content marketing and podcast assistant. Your goal is to analyze transcripts and generate high-quality, engaging promotional material, clear documentation, and listener sharing drafts."
        },
        onModelSelected: (selectedModel) => {
          updateModelStatus(selectedModel);
        },
        onModelError: (failedModel, rawError, friendlyError, shortBadge) => {
          recordModelError(failedModel, rawError, friendlyError, shortBadge);
        },
        onFallbackTransition: (fromModel, toModel, reason, friendlyReason) => {
          console.warn(`[Failover] Analysis model failover: ${fromModel} -> ${toModel}. Reason: ${friendlyReason || reason}`);
          updateModelStatus(toModel, friendlyReason || `Failover from ${fromModel}: ${reason.slice(0, 80)}`);
        }
      });

      const text = generatedAnalysis || extractResponseText(response);
      
      if (mode === 'summary') job.summary = text;
      else if (mode === 'key_takeaways') job.key_takeaways = text;
      else if (mode === 'chapters') job.chapters = text;
      else if (mode === 'social_media') job.social_media = text;
      
      storage.set(job.id, job);
      storage.saveToDisk();

      res.json({ result: text, modelUsed: model });
    } catch (err: any) {
      console.error("Analysis API error:", err);
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File exceeds maximum allowed upload size of ${maxUploadSizeMB}MB. Configure MAX_UPLOAD_SIZE_MB in your environment to increase this limit.`,
        code: 'LIMIT_FILE_SIZE',
        maxUploadSizeMB
      });
    }
    console.error("[EXPRESS ERROR]", err);
    res.status(err.status || 500).json({
      error: err.message || "An unexpected server error occurred during request processing.",
      code: err.code || null,
      name: err.name || null
    });
  });

  return app;
}
