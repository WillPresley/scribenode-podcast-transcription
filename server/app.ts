import express, { Express } from "express";
import path from "path";
import fs from "fs";
import os from "os";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { cleanEnvString, isDisableDefaultItems, getBasicAuthCredentials, getMaxUploadSizeMB, getMaxUploadSizeBytes } from "./config";
import { JobsStorage, TranscribeJob, sampleJobsList } from "./storage";
import { getSystemInstruction, buildTranscriptionPrompt, generateContentWithFallback, DEFAULT_TRANSCRIPTION_MODELS } from "./transcriptionEngine";

export interface ModelStatusInfo {
  primaryModel: string;
  activeModel: string;
  fallbackModels: string[];
  status: 'optimal' | 'fallback_active' | 'degraded';
  lastUsedModel?: string;
  lastFallbackReason?: string;
  lastTestedTimestamp?: number;
}

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
    lastTestedTimestamp: Date.now()
  };

  const updateModelStatus = (selectedModel: string, reason?: string) => {
    modelStatus.activeModel = selectedModel;
    modelStatus.lastUsedModel = selectedModel;
    modelStatus.lastTestedTimestamp = Date.now();
    if (selectedModel !== modelStatus.primaryModel) {
      modelStatus.status = 'fallback_active';
      modelStatus.lastFallbackReason = reason || `Automated failover active from ${modelStatus.primaryModel} to ${selectedModel}`;
    } else {
      modelStatus.status = 'optimal';
      modelStatus.lastFallbackReason = undefined;
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
    customPrompt?: string
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

      const instruction = getSystemInstruction(promptStyle);
      const promptText = buildTranscriptionPrompt(promptStyle, customPrompt);

      const { response, model } = await generateContentWithFallback({
        aiClient: getAIClient(),
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
          storage.set(jobId, job);
          updateModelStatus(selectedModel);
        },
        onFallbackTransition: (fromModel, toModel, reason) => {
          console.warn(`[Failover] Transcription model failover: ${fromModel} -> ${toModel}. Reason: ${reason}`);
          updateModelStatus(toModel, `Failover from ${fromModel} (${reason.slice(0, 80)})`);
        }
      });

      const transcript = response.text;
      if (!transcript) {
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
      job.error = err.message || "Failed to process the audio file.";
      storage.set(jobId, job);
      storage.saveToDisk();

      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch {}
    }
  }

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

      const { promptStyle, customPrompt, duration } = req.body;
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
      };
      
      storage.set(jobId, job);
      storage.saveToDisk();
      
      processTranscriptionJob(jobId, req.file.path, req.file.mimetype, promptStyle, customPrompt);
      
      res.json({ jobId });
    } catch (err: any) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      res.status(500).json({ error: err.message || "Failed to start transcription job" });
    }
  });

  app.get("/api/jobs", (req, res) => {
    const allJobs = storage.values().sort((a, b) => b.createdAt - a.createdAt);
    res.json(allJobs);
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = storage.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
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

      const { response, model } = await generateContentWithFallback({
        aiClient: getAIClient(),
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
        onFallbackTransition: (fromModel, toModel, reason) => {
          console.warn(`[Failover] Analysis model failover: ${fromModel} -> ${toModel}. Reason: ${reason}`);
          updateModelStatus(toModel, `Failover from ${fromModel} (${reason.slice(0, 80)})`);
        }
      });

      const text = response.text;
      
      if (mode === 'summary') job.summary = text;
      else if (mode === 'key_takeaways') job.key_takeaways = text;
      else if (mode === 'chapters') job.chapters = text;
      else if (mode === 'social_media') job.social_media = text;
      
      storage.set(job.id, job);
      storage.saveToDisk();

      res.json({ result: text, modelUsed: model });
    } catch (err: any) {
      console.error("Analysis API error:", err);
      res.status(500).json({ error: err.message || "Failed to analyze transcript" });
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
