import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileAudio,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Search,
  Copy,
  Download,
  Sparkles,
  Clock,
  User,
  FileText,
  RotateCcw,
  BookOpen,
  Share2,
  ListRestart,
  Mic,
  ArrowRight,
  Menu,
  ChevronRight,
  Filter,
  Plus,
  Trash2,
  Archive,
  Layers,
  ChevronUp,
  ChevronDown,
  X,
  Cpu,
  ShieldCheck,
  Zap,
  Info
} from "lucide-react";
import { JobStatus, PromptStyle, AnalysisMode, TranscribeJob, AnalysisResults, ModelStatusInfo } from "./types";
import {
  inferPodcastTitle,
  inferSpeakers,
  stripExistingHeader,
  cleanMarkdownHeaders,
  stripMarkdown,
  boldSpeakerNamesInMarkdown,
  formatExportContent,
  getPreviewLines,
  convertTranscriptToVtt,
  convertTranscriptToSrt,
  formatModelDisplayName,
  EXCLUDED_SPEAKER_KEYWORDS
} from "./utils/transcript";
import { formatDuration } from "./utils/audio";

const ScribeNodeLogo = ({ className = "w-9 h-9" }: { className?: string }) => (
  <div className={`flex items-center justify-center rounded-xl bg-blue-600 p-2 shrink-0 shadow-sm ${className}`}>
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path
        d="M4 11V13M8 7V17M12 3V21M16 6V18M20 10V14"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="3" r="2" fill="white" />
      <circle cx="16" cy="18" r="2" fill="white" />
    </svg>
  </div>
);

const SAMPLE_JOBS: Record<string, TranscribeJob> = {
  "sample-sarah": {
    id: "sample-sarah",
    filename: "Interview_Sarah_Drabner_Final.mp3",
    fileSize: 43200000,
    status: "completed",
    progress: 100,
    createdAt: Date.now() - 7200000,
    modelUsed: "gemini-3.7-flash",
    transcript: `[00:12] SPEAKER A: Welcome to the Product Mindset podcast. Today we're diving deep into the architecture of modern SaaS applications and how engineering teams can leverage AI models to automate workflows. I'm joined today by Sarah Drabner, VP of Product Engineering. Welcome, Sarah.

[00:34] SPEAKER B: Thanks for having me! It's fascinating because the barrier to entry has never been lower, but the barrier to excellence has never been higher. When we talk about building with APIs, specifically Gemini 3.7 Flash, it completely changes how we approach multimodal processing of large audio, video, and text streams.

[01:15] SPEAKER A: Absolutely. We've seen teams struggle with latency and cost. How do you balance transcription quality with rapid content generation?

[01:45] SPEAKER B: The key is multi-stage workflows. First, use a highly capable reasoning model like Gemini 3.7 Flash for direct audio-to-text alignment, which maintains speaker identity and captures verbal nuances. Once you have that high-fidelity transcript, you feed it into downstream summarization and chaptering pipelines. That keeps things highly cost-efficient and incredibly fast.`
  },
  "sample-brief": {
    id: "sample-brief",
    filename: "Marketing_Brief_Sync.mp3",
    fileSize: 12687770,
    status: "archived",
    progress: 100,
    createdAt: Date.now() - 86400000,
    modelUsed: "gemini-3.7-flash",
    transcript: `[00:01] SPEAKER A: Let's quickly sync on the Q3 marketing campaigns. The podcast adoption rates are looking fantastic. Our automated workflow has processed over one thousand hours.

[00:45] SPEAKER B: Yes, we need to focus on streamlining social asset creation. Creating snippets for LinkedIn and Twitter makes a huge difference in driving engagement back to the core episodes.`
  }
};

async function getAudioDuration(file: File): Promise<number> {
  // Fast track: try using lightweight HTML5 Audio metadata extraction
  try {
    const dur = await new Promise<number>((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      
      const cleanUp = () => {
        try {
          audio.pause();
          URL.revokeObjectURL(url);
        } catch (e) {}
      };

      audio.addEventListener("loadedmetadata", () => {
        const d = audio.duration;
        cleanUp();
        if (d && !isNaN(d) && d > 0) {
          resolve(d);
        } else {
          resolve(0);
        }
      });

      audio.addEventListener("error", () => {
        cleanUp();
        resolve(0);
      });

      // Timeout safety: 3 seconds max for loading metadata
      setTimeout(() => {
        cleanUp();
        resolve(0);
      }, 3000);
    });
    if (dur > 0) return dur;
  } catch (err) {
    console.warn("Fast audio duration check failed:", err);
  }

  // Fallback: try decoding with Web Audio API (more heavy, but fully reliable in all browsers)
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);
      const dur = buffer.duration;
      audioCtx.close();
      return dur;
    }
  } catch (err) {
    console.warn("Fallback Web Audio API duration check failed:", err);
  }

  return 0;
}

async function transcodeAudioToWav(
  file: File,
  profile: 'high' | 'standard' | 'compact' | 'auto' = 'auto',
  onProgress?: (msg: string) => void
): Promise<File> {
  if (onProgress) onProgress("Reading original file...");
  const arrayBuffer = await file.arrayBuffer();

  if (onProgress) onProgress("Decoding audio frames...");
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this browser.");
  }
  const audioCtx = new AudioContextClass();

  let originalBuffer: AudioBuffer;
  try {
    originalBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.error("Audio decoding failed:", err);
    throw new Error("Failed to decode audio. Format might not be supported client-side.");
  } finally {
    audioCtx.close();
  }

  // Determine target sample rate and bit depth based on profile
  let targetSampleRate = 16000;
  let targetBitDepth: 8 | 16 = 16;
  const duration = originalBuffer.duration;

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
    if (duration * 16000 * 2 <= targetMaxSizeBytes) {
      targetSampleRate = 16000;
      targetBitDepth = 16;
    } else if (duration * 16000 * 1 <= targetMaxSizeBytes) {
      targetSampleRate = 16000;
      targetBitDepth = 8;
    } else if (duration * 12000 * 1 <= targetMaxSizeBytes) {
      targetSampleRate = 12000;
      targetBitDepth = 8;
    } else {
      targetSampleRate = 8000;
      targetBitDepth = 8;
    }
  }

  const depthStr = `${targetBitDepth}-bit`;
  const rateStr = `${(targetSampleRate / 1000).toFixed(1)}kHz`;
  if (onProgress) onProgress(`Resampling to ${rateStr} Mono...`);

  const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!OfflineContextClass) {
    throw new Error("Offline Audio Context is not supported in this browser.");
  }

  const offlineCtx = new OfflineContextClass(
    1,
    Math.ceil(targetSampleRate * duration),
    targetSampleRate
  );

  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = originalBuffer;
  sourceNode.connect(offlineCtx.destination);
  sourceNode.start(0);

  const renderedBuffer = await offlineCtx.startRendering();

  if (onProgress) onProgress(`Encoding to voice-optimized ${depthStr} WAV...`);
  const wavBlob = bufferToWav(renderedBuffer, targetBitDepth);

  const originalBaseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
  return new File([wavBlob], `${originalBaseName}_optimized.wav`, {
    type: "audio/wav"
  });
}

function bufferToWav(buffer: AudioBuffer, bitDepth: 8 | 16 = 16): Blob {
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const bytesPerSample = bitDepth / 8;
  const dataSize = samples.length * bytesPerSample;
  const resultBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(resultBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM = 1
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  } else {
    // 8-bit PCM is unsigned: values are 0-255 with 128 as silence/midpoint
    for (let i = 0; i < samples.length; i++, offset++) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      let val = Math.floor((s + 1.0) * 127.5);
      view.setUint8(offset, Math.max(0, Math.min(255, val)));
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [promptStyle, setPromptStyle] = useState<PromptStyle>("clean");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [isPending, setIsPending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  
  // Job and polling states
  const [job, setJob] = useState<TranscribeJob | null>(null);
  const [jobsList, setJobsList] = useState<TranscribeJob[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);
  const [optimizeAudio, setOptimizeAudio] = useState<boolean>(true);
  const [audioOptimizationProfile, setAudioOptimizationProfile] = useState<'high' | 'standard' | 'compact' | 'auto'>('auto');
  const [optimizationStatus, setOptimizationStatus] = useState<string>("");

  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);

  const latestCompletedJob = jobsList.find(j => (j.status === 'completed' || j.status === 'archived') && j.transcript);
  const activeCount = jobsList.filter(j => j.status === "uploading" || j.status === "processing_audio" || j.status === "transcribing").length;
  const completedCount = jobsList.filter(j => j.status === "completed" || j.status === "archived").length;
  const previewJob = (selectedPreviewId ? jobsList.find(j => j.id === selectedPreviewId) : null) || latestCompletedJob;
  const parsedLines = previewJob ? getPreviewLines(previewJob.transcript || "") : [];
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  
  // Model Orchestration & Failover status
  const [modelStatus, setModelStatus] = useState<ModelStatusInfo>({
    primaryModel: "gemini-3.7-flash",
    activeModel: "gemini-3.7-flash",
    fallbackModels: [
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ],
    status: "optimal"
  });
  const [showModelPopover, setShowModelPopover] = useState<boolean>(false);
  const modelPopoverRef = useRef<HTMLDivElement>(null);

  // Marketing / Analysis states
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults>({});
  const [loadingAnalysis, setLoadingAnalysis] = useState<Record<AnalysisMode, boolean>>({
    summary: false,
    key_takeaways: false,
    chapters: false,
    social_media: false,
  });
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisMode>("summary");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchJobsList = async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobsList(data);
      }
    } catch (err) {
      console.error("Failed to fetch jobs list:", err);
    }
  };

  const fetchModelStatus = async () => {
    try {
      const res = await fetch("/api/model-status");
      if (res.ok) {
        const data: ModelStatusInfo = await res.json();
        setModelStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch model status:", err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        if (data && data.appTitle) {
          document.title = data.appTitle;
        }
        if (data && data.modelStatus) {
          setModelStatus(data.modelStatus);
        }
      }
    } catch (err) {
      document.title = "ScribeNode – Transcription Engine";
    }
  };

  // Close model popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPopoverRef.current && !modelPopoverRef.current.contains(e.target as Node)) {
        setShowModelPopover(false);
      }
    };
    if (showModelPopover) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showModelPopover]);

  // Clear polling and fetch jobs/config on mount
  useEffect(() => {
    fetchJobsList();
    fetchConfig();
    fetchModelStatus();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Poll job status
  const startPolling = (jobId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    let consecutiveErrors = 0;

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const contentType = res.headers.get("content-type") || "";
        
        if (!res.ok || !contentType.includes("application/json")) {
          consecutiveErrors++;
          if (consecutiveErrors >= 5) {
            throw new Error("Lost connection to transcription worker.");
          }
          return;
        }

        consecutiveErrors = 0;
        const data: TranscribeJob = await res.json();
        setJob(data);
        
        // Refresh the jobs list to reflect the current job status on the home page
        fetchJobsList();

        if (data.status === "completed" || data.status === "failed") {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setIsPending(false);
          if (data.status === "failed") {
            setErrorMessage(data.error || "Transcription job failed.");
          }
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        if (consecutiveErrors >= 5) {
          setErrorMessage("Network error while polling job status. Please refresh or check connection.");
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setIsPending(false);
        }
      }
    }, 2500);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const validExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac", ".opus", ".webm"];
      const hasValidExt = validExtensions.some(ext => droppedFile.name.toLowerCase().endsWith(ext));
      if (droppedFile.type.startsWith("audio/") || hasValidExt) {
        setFile(droppedFile);
        setErrorMessage("");
      } else {
        setErrorMessage("Please drop a valid audio file (e.g. MP3, WAV, M4A, OGG, FLAC).");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMessage("");
    }
  };

  const handleStartTranscription = async () => {
    if (!file) {
      setErrorMessage("Please select or drop an audio file first.");
      return;
    }

    setIsPending(true);
    setErrorMessage("");
    setJob(null);
    setAnalysisResults({});
    setOptimizationStatus("Initializing audio capture...");

    try {
      let fileToSend = file;
      
      // Determine audio duration
      let durationStr = "--:--";
      try {
        const durationSec = await getAudioDuration(file);
        if (durationSec > 0) {
          durationStr = formatDuration(durationSec);
        }
      } catch (durErr) {
        console.warn("Could not determine audio duration:", durErr);
      }

      if (optimizeAudio) {
        try {
          fileToSend = await transcodeAudioToWav(file, audioOptimizationProfile, (status) => {
            setOptimizationStatus(status);
          });
        } catch (transcodeErr: any) {
          console.warn("Client-side audio optimization failed, falling back to original upload:", transcodeErr);
          // If transcode fails (e.g. Safari block or memory), gracefully fall back to original file upload
        }
      }
      setOptimizationStatus("");

      const formData = new FormData();
      formData.append("file", fileToSend);
      formData.append("promptStyle", promptStyle);
      formData.append("duration", durationStr);
      if (promptStyle === "custom") {
        formData.append("customPrompt", customPrompt);
      }

      let response: Response;
      try {
        response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "TypeError" || fetchErr.message?.includes("Failed to fetch")) {
          throw new Error("Could not connect to transcription server. Please check your connection and try again.");
        }
        throw fetchErr;
      }

      const contentType = response.headers.get("content-type") || "";
      let responseData: any = null;

      if (contentType.includes("application/json")) {
        try {
          responseData = await response.json();
        } catch {
          responseData = null;
        }
      } else {
        const textMsg = await response.text();
        try {
          responseData = JSON.parse(textMsg);
        } catch {
          const titleMatch = textMsg.match(/<title>(.*?)<\/title>/i);
          const errorSummary = titleMatch ? titleMatch[1] : textMsg.slice(0, 120);
          throw new Error(
            response.ok
              ? "Received unexpected response format from server. Please retry the upload."
              : (errorSummary || `Server returned error (${response.status})`)
          );
        }
      }

      if (!response.ok) {
        const errMsg = responseData?.error || `Upload failed (status ${response.status}).`;
        throw new Error(errMsg);
      }

      if (!responseData || !responseData.jobId) {
        throw new Error("Transcription server did not return a valid Job ID.");
      }

      const data = responseData;
      
      // Initialize local job state as uploading
      setJob({
        id: data.jobId,
        filename: file.name,
        fileSize: fileToSend.size, // Show optimized file size
        status: "uploading",
        progress: 10,
        createdAt: Date.now(),
        modelUsed: modelStatus.activeModel || "gemini-3.7-flash",
        duration: durationStr,
      });

      startPolling(data.jobId);
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMessage(err.message || "An unexpected error occurred during upload.");
      setOptimizationStatus("");
      setIsPending(false);
    }
  };

  const generateAnalysis = async (mode: AnalysisMode) => {
    if (!job || (job.status !== "completed" && job.status !== "archived")) return;
    
    setLoadingAnalysis(prev => ({ ...prev, [mode]: true }));
    try {
      let response: Response;
      try {
        response = await fetch(`/api/jobs/${job.id}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "TypeError" || fetchErr.message?.includes("Failed to fetch")) {
          throw new Error("Could not connect to analysis worker. Please check your network and try again.");
        }
        throw fetchErr;
      }

      const contentType = response.headers.get("content-type") || "";
      let data: any = null;

      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        const textMsg = await response.text();
        try {
          data = JSON.parse(textMsg);
        } catch {
          throw new Error(response.ok ? "Unexpected response format from analysis service." : `Server returned error (${response.status})`);
        }
      }

      if (!response.ok || !data) {
        throw new Error(data?.error || `Failed to generate ${mode.replace('_', ' ')}.`);
      }

      setAnalysisResults(prev => ({ ...prev, [mode]: data.result }));
      setJob(prev => prev ? { ...prev, [mode]: data.result } : null);
      fetchJobsList();
    } catch (err: any) {
      console.error("Analysis generation failed:", err);
    } finally {
      setLoadingAnalysis(prev => ({ ...prev, [mode]: false }));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadFile = (text: string, ext: "txt" | "md", suffix: string) => {
    const processedText = formatExportContent(text, ext, job?.filename || "", suffix);
    const blob = new Blob([processedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${job?.filename?.replace(/\.[^/.]+$/, "") || "transcript"}_${suffix}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setFile(null);
    setJob(null);
    setAnalysisResults({});
    setErrorMessage("");
    setCustomPrompt("");
    setPromptStyle("clean");
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    fetchJobsList();
  };

  const handleDeleteJob = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingJobId(jobId);
  };

  const confirmDeleteJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        setDeletingJobId(null);
        if (job?.id === jobId) {
          handleReset();
        } else {
          fetchJobsList();
        }
      }
    } catch (err) {
      console.error("Failed to delete job:", err);
    }
  };

  const handleRetranscribe = async (jobId: string, style: PromptStyle) => {
    setIsPending(true);
    setErrorMessage("");
    try {
      let res: Response;
      try {
        res = await fetch(`/api/jobs/${jobId}/retranscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ promptStyle: style }),
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "TypeError" || fetchErr.message?.includes("Failed to fetch")) {
          throw new Error("Could not connect to transcription server. Please check your connection and try again.");
        }
        throw fetchErr;
      }

      const contentType = res.headers.get("content-type") || "";
      let responseData: any = null;

      if (contentType.includes("application/json")) {
        try {
          responseData = await res.json();
        } catch {
          responseData = null;
        }
      } else {
        const textMsg = await res.text();
        try {
          responseData = JSON.parse(textMsg);
        } catch {
          const titleMatch = textMsg.match(/<title>(.*?)<\/title>/i);
          const errorSummary = titleMatch ? titleMatch[1] : textMsg.slice(0, 120);
          throw new Error(
            res.ok
              ? "Received unexpected response format from server."
              : (errorSummary || `Server returned error (${res.status})`)
          );
        }
      }

      if (!res.ok) {
        throw new Error(responseData?.error || `Re-transcription failed (status ${res.status}).`);
      }

      if (!responseData || !responseData.jobId) {
        throw new Error("Server did not return a valid job ID for re-transcription.");
      }

      handleReset();
      startPolling(responseData.jobId);
    } catch (err: any) {
      console.error("Re-transcribe error:", err);
      setErrorMessage(err.message || "An unexpected error occurred during re-transcription.");
    } finally {
      setIsPending(false);
    }
  };

  const handleToggleArchive = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/jobs/${jobId}/archive`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        if (job?.id === jobId) {
          setJob(updated);
        }
        fetchJobsList();
      }
    } catch (err) {
      console.error("Failed to toggle archive:", err);
    }
  };

  const handleSelectJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const selectedJob = await res.json();
        setJob(selectedJob);
        setAnalysisResults({
          summary: selectedJob.summary,
          key_takeaways: selectedJob.key_takeaways,
          chapters: selectedJob.chapters,
          social_media: selectedJob.social_media,
        });
        setErrorMessage("");
      } else {
        setErrorMessage("Failed to load transcript details.");
      }
    } catch (err) {
      console.error("Failed to fetch job:", err);
    }
  };

  const handleReviewSample = (sampleKey: string) => {
    handleSelectJob(sampleKey);
  };

  // Reset active search match index when query changes
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  const paragraphs = job?.transcript 
    ? job.transcript.split("\n").map(p => p.trim()).filter(Boolean) 
    : [];

  const searchMatches = searchQuery.trim() 
    ? paragraphs.reduce<number[]>((acc, p, idx) => {
        if (p.toLowerCase().includes(searchQuery.toLowerCase())) {
          acc.push(idx);
        }
        return acc;
      }, [])
    : [];

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (activeMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setActiveMatchIndex(nextIdx);
    scrollToParagraph(searchMatches[nextIdx]);
  };

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % searchMatches.length;
    setActiveMatchIndex(nextIdx);
    scrollToParagraph(searchMatches[nextIdx]);
  };

  const scrollToParagraph = (pIdx: number) => {
    setTimeout(() => {
      const el = document.getElementById(`transcript-paragraph-${pIdx}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  // Safe regex escaping
  const escapeRegExp = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  // Search highlighter component
  const HighlightedParagraph = ({ text }: { text: string }) => {
    // Skip rendering if line is an existing header or horizontal rule
    if (/^#\s+/.test(text) || /^\*\*Hosts:\*\*/i.test(text) || /^\s*Hosts:/i.test(text) || /^\s*[-*_]{3,}\s*$/.test(text)) {
      return null;
    }

    // Dynamic speaker colors helper
    const getSpeakerColors = (name: string) => {
      const clean = name.trim().toUpperCase();
      if (clean.includes("A") || clean.includes("1") || clean.includes("SARAH") || clean.includes("HOST")) {
        return { border: "border-blue-300", text: "text-blue-700 bg-blue-50/80" };
      }
      if (clean.includes("B") || clean.includes("2") || clean.includes("GUEST") || clean.includes("DRABNER")) {
        return { border: "border-emerald-300", text: "text-emerald-700 bg-emerald-50/80" };
      }
      // Simple deterministic mapping for other names
      let sum = 0;
      for (let i = 0; i < clean.length; i++) sum += clean.charCodeAt(i);
      if (sum % 3 === 0) {
        return { border: "border-violet-300", text: "text-violet-700 bg-violet-50/80" };
      } else if (sum % 3 === 1) {
        return { border: "border-amber-300", text: "text-amber-700 bg-amber-50/80" };
      } else {
        return { border: "border-rose-300", text: "text-rose-700 bg-rose-50/80" };
      }
    };

    // Parse options:
    const doubleMatch = text.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.*)/s);
    const tsOnlyMatch = text.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)/s);
    const speakerOnlyMatch = text.match(/^([^:]+):\s*(.*)/s);

    let timestamp = "";
    let speaker = "";
    let speechText = text;

    if (doubleMatch) {
      timestamp = `[${doubleMatch[1]}]`;
      speaker = doubleMatch[2].trim();
      speechText = doubleMatch[3];
    } else if (tsOnlyMatch) {
      timestamp = `[${tsOnlyMatch[1]}]`;
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

    const speakerColors = speaker ? getSpeakerColors(speaker) : { border: "border-slate-100", text: "" };

    const highlightText = (rawText: string) => {
      if (!searchQuery.trim()) return rawText;
      const regex = new RegExp(`(${escapeRegExp(searchQuery)})`, "gi");
      const parts = rawText.split(regex);
      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === searchQuery.toLowerCase() ? (
              <mark key={i} className="bg-amber-100 text-amber-950 px-0.5 rounded font-medium">
                {part}
              </mark>
            ) : (
              part
            )
          )}
        </>
      );
    };

    return (
      <p className={`leading-relaxed text-slate-700 py-2 border-l-2 pl-4 transition-all hover:border-slate-300 ${speaker ? speakerColors.border : "border-slate-100"}`}>
        {timestamp && (
          <span className="font-mono text-[10px] text-blue-600 bg-blue-50 border border-blue-100/50 px-2 py-0.5 rounded mr-2 font-medium select-all">
            {timestamp}
          </span>
        )}
        {speaker && (
          <span className={`font-sans text-[10px] font-bold px-2 py-0.5 rounded mr-2 uppercase tracking-wider select-none ${speakerColors.text}`}>
            {speaker}
          </span>
        )}
        <span className="text-xs text-slate-800 leading-relaxed font-sans">
          {highlightText(speechText)}
        </span>
      </p>
    );
  };

  return (
    <div className="flex h-screen w-screen bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden" id="app-root">
      {/* Left Sidebar: Navigation & Controls */}
      <aside className="w-64 bg-[#0F172A] text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
        <div className="p-4 border-b border-slate-800/80 flex flex-col">
          <div className="flex items-center gap-3 mb-1 cursor-pointer group" onClick={handleReset}>
            <ScribeNodeLogo className="w-9 h-9" />
            <div>
              <h1 className="text-white font-bold text-lg tracking-tight leading-none group-hover:text-blue-200 transition-colors">
                Scribe<span className="text-blue-300">Node</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium tracking-wide mt-1">
                AI Speech & Transcript Engine
              </p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2">Workflows</div>
          <button 
            onClick={handleReset} 
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              !job ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
            }`}
          >
            <span className="opacity-70">▤</span> Active Queue
          </button>
          
          <div className="space-y-1 pt-1 border-t border-slate-800/30 mt-1">
            {jobsList.filter(j => j.status !== 'archived').slice(0, 5).map(item => {
              const isSelected = job?.id === item.id;
              return (
                <button 
                  key={item.id}
                  onClick={() => handleSelectJob(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer group ${
                    isSelected ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate min-w-0 pr-1 text-left">
                    <span className="opacity-70 shrink-0">▦</span>
                    <span className="truncate" title={item.filename}>{item.filename}</span>
                  </span>
                  {item.status !== 'completed' && item.status !== 'failed' && (
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0 ml-1"></span>
                  )}
                </button>
              );
            })}
          </div>

          {job && (
            <button
              onClick={handleReset}
              className="w-full mt-2 text-left px-3 py-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border-t border-slate-800/30 pt-2"
            >
              <span>➔</span> Go to List
            </button>
          )}

        </nav>

        {/* Sidebar Storage Status - Backlog / Mocked
        <div className="p-4 bg-slate-900/50 border-t border-slate-800">
          <div className="flex justify-between items-center mb-1.5 text-slate-400">
            <span className="text-[9px] uppercase font-bold tracking-wider">Storage Usage</span>
            <span className="text-[10px] font-mono">84%</span>
          </div>
          <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
            <div className="bg-blue-500 w-[84%] h-full"></div>
          </div>
        </div>
        */}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 select-none relative z-20">
          <div className="flex items-center gap-3.5 min-w-0">
            <h2 className="font-semibold text-slate-800 truncate text-sm sm:text-base">
              {job?.status === "completed" ? `Review: ${job.filename}` : "Transcript Queue"}
            </h2>
          </div>
          
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Active Model Indicator & Failover Pipeline Dropdown */}
            <div className="relative" ref={modelPopoverRef}>
              <button
                type="button"
                onClick={() => setShowModelPopover(!showModelPopover)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200/90 bg-slate-50/90 hover:bg-slate-100/90 text-slate-700 transition-all cursor-pointer shadow-xs hover:border-slate-300"
                title="Click to view Gemini Model fallback chain & health status"
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      modelStatus.status === "optimal" ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      modelStatus.status === "optimal" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                </span>
                <div className="flex items-center gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span className="hidden sm:inline text-slate-500 font-medium text-[11px]">Model:</span>
                  <span className="font-bold text-slate-800 text-[11px]">
                    {formatModelDisplayName(modelStatus.activeModel)}
                  </span>
                  {modelStatus.status === "fallback_active" ? (
                    <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide bg-amber-100 text-amber-800 rounded border border-amber-200">
                      Fallback
                    </span>
                  ) : (
                    <span className="hidden xl:inline px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 rounded border border-blue-200/60">
                      Next Task
                    </span>
                  )}
                </div>
                <ChevronDown className="h-3 w-3 text-slate-400 ml-0.5" />
              </button>

              {/* Popover / Tooltip */}
              <AnimatePresence>
                {showModelPopover && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 text-slate-800"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                          <Cpu className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Gemini Model Orchestration</h4>
                          <p className="text-[10px] text-slate-500">Real-time model loaded for next transcription</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowModelPopover(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Current Loaded Model Banner */}
                    <div className="mt-3 p-3 bg-gradient-to-r from-blue-50/70 to-indigo-50/40 rounded-lg border border-blue-100 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Active Loaded Model</div>
                        <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {formatModelDisplayName(modelStatus.activeModel)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{modelStatus.activeModel}</div>
                      </div>
                      <span
                        className={`px-2 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider border ${
                          modelStatus.status === "optimal"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {modelStatus.status === "optimal" ? "Ready" : "Failover Active"}
                      </span>
                    </div>

                    {modelStatus.lastFallbackReason && (
                      <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200/80 rounded-md text-[11px] text-amber-800 flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="leading-tight">
                          <span className="font-bold">Failover note: </span>
                          {modelStatus.lastFallbackReason}
                        </div>
                      </div>
                    )}

                    {/* Fallback Priority Queue */}
                    <div className="mt-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                        <span>Fallback Execution Sequence</span>
                        <span className="text-[9px] font-normal text-slate-400 lowercase">automatic failover</span>
                      </div>
                      <div className="space-y-1.5 text-xs font-medium">
                        {modelStatus.fallbackModels.map((m, idx) => {
                          const isActive = modelStatus.activeModel === m;
                          const isPrimary = modelStatus.primaryModel === m;
                          return (
                            <div
                              key={m}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-[11px] transition-colors ${
                                isActive
                                  ? "bg-blue-50/80 border-blue-200 text-blue-900 font-bold"
                                  : "bg-slate-50/50 border-slate-100 text-slate-600"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-slate-400 w-3">{idx + 1}.</span>
                                <span>{formatModelDisplayName(m)}</span>
                                {isPrimary && (
                                  <span className="text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                    Flagship
                                  </span>
                                )}
                              </div>
                              {isActive && (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Active
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Helper Footer */}
                    <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Dynamic failover on 429/503 errors</span>
                      <button
                        type="button"
                        onClick={() => fetchModelStatus()}
                        className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Refresh
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {job?.status === "completed" && (
              <button 
                onClick={handleReset}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-md text-xs font-bold hover:bg-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" /> Back to List
              </button>
            )}
            <button 
              onClick={handleReset}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3 w-3" /> New Transcription
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-hidden">
          <AnimatePresence mode="wait">
            
            {/* VIEW COMPLETED TRANSCRIPT WORKSPACE */}
            {job && job.status === "completed" && job.transcript ? (
              <motion.div
                key="workspace-completed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-12 gap-6 h-full overflow-hidden"
              >
                {/* Left side: Scrollable text + controls */}
                <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-full">
                  
                  {/* File Metadata Row */}
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-3.5 shrink-0">
                    {/* Row 1: Document Details */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                          ACTIVE TRANSCRIPT
                          {job.modelUsed && (
                            <span className="px-1.5 py-0.5 bg-slate-200/80 text-slate-700 rounded text-[9px] font-mono border border-slate-300/40 select-all font-semibold uppercase">
                              {job.modelUsed}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-800 truncate" title={job.filename}>{job.filename}</div>
                      </div>
                    </div>

                    {/* Row 2: Actions Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-200/60">
                      {/* Re-run preset option */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[8px] font-extrabold text-slate-500 uppercase px-1.5 py-0.5 bg-slate-200/60 rounded-md tracking-wider">Re-run Audio:</span>
                        <button
                          onClick={() => handleRetranscribe(job.id, "clean")}
                          className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 text-[9px] font-bold rounded shadow-sm border border-slate-200/60 cursor-pointer transition-colors"
                          title="Re-run as Clean (No timestamps/speakers)"
                        >
                          Clean
                        </button>
                        <button
                          onClick={() => handleRetranscribe(job.id, "timestamped")}
                          className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 text-[9px] font-bold rounded shadow-sm border border-slate-200/60 cursor-pointer transition-colors"
                          title="Re-run with Timestamps"
                        >
                          Timestamps
                        </button>
                        <button
                          onClick={() => handleRetranscribe(job.id, "verbatim")}
                          className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 text-[9px] font-bold rounded shadow-sm border border-slate-200/60 cursor-pointer transition-colors"
                          title="Re-run with Speakers"
                        >
                          Speakers
                        </button>
                        <button
                          onClick={() => handleRetranscribe(job.id, "combined")}
                          className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-bold rounded shadow-sm cursor-pointer transition-colors flex items-center gap-0.5"
                          title="Re-run with Combined format"
                        >
                          <Sparkles className="h-2.5 w-2.5" /> Combined
                        </button>
                      </div>

                      {/* Export Options */}
                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        <button
                          onClick={() => copyToClipboard(job.transcript || "")}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors border border-slate-200/40 bg-white cursor-pointer"
                          title="Copy Transcript"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => downloadFile(job.transcript || "", "txt", "transcript")}
                          className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-[10px] font-bold rounded shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="h-3 w-3" /> TXT
                        </button>
                        <button
                          onClick={() => downloadFile(job.transcript || "", "md", "transcript")}
                          className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-[10px] font-bold rounded shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="h-3 w-3" /> Markdown
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Search bar wrapper */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search words within transcription..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-9 pr-24 text-xs focus:ring-1 focus:ring-blue-500 outline-none placeholder-slate-400 transition-all text-slate-800"
                      />
                      {searchQuery && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/50 shadow-sm">
                          <span className="text-[9px] font-mono font-bold text-slate-500 select-none mr-1.5 shrink-0">
                            {searchMatches.length > 0 ? `${activeMatchIndex + 1}/${searchMatches.length}` : '0/0'}
                          </span>
                          <button
                            onClick={handlePrevMatch}
                            disabled={searchMatches.length === 0}
                            className="p-0.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed flex items-center justify-center"
                            title="Previous Match"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={handleNextMatch}
                            disabled={searchMatches.length === 0}
                            className="p-0.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed flex items-center justify-center"
                            title="Next Match"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <div className="h-2.5 w-[1px] bg-slate-300 mx-0.5" />
                          <button
                            onClick={() => setSearchQuery("")}
                            className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 cursor-pointer flex items-center justify-center"
                            title="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Real Transcript text lines */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4" id="transcript-scroll-area">
                    {(() => {
                      const title = inferPodcastTitle(job.filename, job.transcript);
                      const speakers = inferSpeakers(job.transcript);
                      return (
                        <div className="pb-3 border-b border-slate-200/80 mb-3">
                          <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
                          {speakers.length > 0 && (
                            <p className="text-xs text-slate-600 mt-1">
                              <span className="font-bold text-slate-800">Hosts: </span>
                              <span className="italic text-slate-700">{speakers.join(", ")}</span>
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    <div className="space-y-4">
                      {stripExistingHeader(job.transcript).split("\n").map(p => p.trim()).filter(Boolean).map((p, idx) => {
                        const isCurrentMatch = searchQuery.trim() && searchMatches[activeMatchIndex] === idx;
                        return (
                          <div 
                            key={idx} 
                            id={`transcript-paragraph-${idx}`}
                            className={`transition-all duration-300 px-2 py-1 rounded-lg ${
                              isCurrentMatch 
                                ? "bg-amber-50 border border-amber-200 shadow-sm ring-1 ring-amber-300/30 scale-[1.01]" 
                                : "border border-transparent hover:bg-slate-50/50"
                            }`}
                          >
                            <HighlightedParagraph text={p} />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Right side: Insights tabs */}
                <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-full">
                  
                  {/* Insights hub header */}
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Post-Production Insights Hub</h3>
                  </div>

                  {/* Tab list */}
                  <div className="flex border-b border-slate-200 bg-white shrink-0">
                    {(["summary", "key_takeaways", "chapters", "social_media"] as AnalysisMode[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveAnalysisTab(tab)}
                        className={`flex-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 relative cursor-pointer border-b-2 ${
                          activeAnalysisTab === tab 
                            ? "text-blue-700 font-extrabold border-blue-600 bg-blue-50/20" 
                            : "text-slate-500 hover:text-blue-700 hover:bg-slate-50/50 border-transparent"
                        }`}
                      >
                        {tab === "summary" && <FileText className="h-3 w-3" />}
                        {tab === "key_takeaways" && <CheckCircle2 className="h-3 w-3" />}
                        {tab === "chapters" && <Clock className="h-3 w-3" />}
                        {tab === "social_media" && <Share2 className="h-3 w-3" />}
                        <span>
                          {tab === "summary" && "Summary"}
                          {tab === "key_takeaways" && "Takeaways"}
                          {tab === "chapters" && "Chapters"}
                          {tab === "social_media" && "Social Share"}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Sticky Assets Actions Row */}
                  {analysisResults[activeAnalysisTab] && !loadingAnalysis[activeAnalysisTab] && (
                    <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-2 flex flex-wrap items-center justify-between gap-1.5 shrink-0 select-none">
                      <span className="text-[9px] font-extrabold uppercase text-slate-500 tracking-wider">Asset Actions:</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyToClipboard(analysisResults[activeAnalysisTab] || "")}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 text-[9px] font-bold rounded shadow-sm border border-slate-200/60 cursor-pointer transition-colors flex items-center gap-1"
                          title="Copy to Clipboard"
                        >
                          <Copy className="h-2.5 w-2.5 text-slate-500" /> Copy
                        </button>
                        <button
                          onClick={() => downloadFile(analysisResults[activeAnalysisTab] || "", "txt", activeAnalysisTab)}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 text-[9px] font-bold rounded shadow-sm border border-slate-200/60 cursor-pointer transition-colors flex items-center gap-1"
                          title="Download as TXT"
                        >
                          <Download className="h-2.5 w-2.5 text-slate-500" /> TXT
                        </button>
                        <button
                          onClick={() => downloadFile(analysisResults[activeAnalysisTab] || "", "md", activeAnalysisTab)}
                          className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 text-[9px] font-bold rounded shadow-sm border border-slate-200/60 cursor-pointer transition-colors flex items-center gap-1"
                          title="Download as Markdown"
                        >
                          <Download className="h-2.5 w-2.5 text-slate-500" /> Markdown
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Insights scrolling output */}
                  <div className="flex-1 overflow-y-auto p-5 bg-white relative">
                    <AnimatePresence mode="wait">
                      
                      {analysisResults[activeAnalysisTab] ? (
                        <motion.div
                          key={activeAnalysisTab}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="space-y-4 h-full flex flex-col"
                        >
                          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap select-text font-sans flex-1">
                            {analysisResults[activeAnalysisTab]}
                          </div>
                        </motion.div>
                      ) : loadingAnalysis[activeAnalysisTab] ? (
                        <motion.div
                          key="insight-loader"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="h-full flex flex-col items-center justify-center py-12"
                        >
                          <Sparkles className="h-6 w-6 text-blue-500 animate-spin mb-3" />
                          <div className="text-center">
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Generating Assets</p>
                            <p className="text-[10px] text-slate-400 mt-1">Gemini is processing speech semantics...</p>
                          </div>
                          
                          <div className="w-full space-y-2 mt-6">
                            <div className="h-2 bg-slate-100 rounded w-full animate-pulse" />
                            <div className="h-2 bg-slate-100 rounded w-5/6 animate-pulse" />
                            <div className="h-2 bg-slate-100 rounded w-4/5 animate-pulse" />
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="insight-empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="h-full flex flex-col items-center justify-center text-center py-12 space-y-4"
                        >
                          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                            <Sparkles className="h-5 w-5 animate-pulse" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-bold text-slate-700 text-xs uppercase tracking-wider">
                              {activeAnalysisTab === "summary" && "Executive Summary"}
                              {activeAnalysisTab === "key_takeaways" && "Actionable Takeaways"}
                              {activeAnalysisTab === "chapters" && "Episode Chapters"}
                              {activeAnalysisTab === "social_media" && "Social Share Snippets"}
                            </p>
                            <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                              {activeAnalysisTab === "summary" && "Extract a polished overview of the core discussion and themes discussed in this file."}
                              {activeAnalysisTab === "key_takeaways" && "Extract top lessons, valuable definitions, and ideas from the episode."}
                              {activeAnalysisTab === "chapters" && "Logically structure the episode into time-coded outlines."}
                              {activeAnalysisTab === "social_media" && "Generate short, concise listener sharing drafts for Facebook, Threads, Mastodon, or Bluesky."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => generateAnalysis(activeAnalysisTab)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider py-2 px-4 rounded shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Generate with Gemini
                          </button>
                        </motion.div>
                      )}

                    </AnimatePresence>
                  </div>

                </div>
              </motion.div>
            ) : (
              
              /* HIGH DENSITY QUEUE DASHBOARD GRID */
              <motion.div
                key="workspace-dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-12 gap-6 h-full overflow-y-auto"
              >
                {/* Left Panel: Active Queue List OR Uploading Stream (col-span-8) */}
                <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
                  
                  {/* Conditionally show ACTIVE RUNNING PROGRESS or UPLOAD CARD */}
                  {job && job.status !== "completed" && job.status !== "failed" ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-6">
                      
                      {/* Circle indicator */}
                      <div className="relative h-20 w-20 flex items-center justify-center shrink-0">
                        <div className="absolute inset-0 bg-blue-50 rounded-full animate-ping opacity-60" />
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="40"
                            cy="40"
                            r="34"
                            stroke="#f1f5f9"
                            strokeWidth="5"
                            fill="transparent"
                          />
                          <circle
                            cx="40"
                            cy="40"
                            r="34"
                            stroke="#2563eb"
                            strokeWidth="5"
                            fill="transparent"
                            strokeDasharray="213"
                            strokeDashoffset={213 - (213 * job.progress) / 100}
                            className="transition-all duration-700 ease-out"
                          />
                        </svg>
                        <span className="absolute text-sm font-bold text-slate-800 font-mono">
                          {job.progress}%
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Processing Transcription Pipeline</h3>
                        <p className="text-xs text-slate-500 font-mono">File: {job.filename}</p>
                      </div>

                      {/* Line steps */}
                      <div className="w-full max-w-md bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">1. Local file buffered</span>
                          {job.progress >= 20 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-medium ${job.progress >= 20 ? "text-slate-800" : "text-slate-400"}`}>
                            2. {job.modelUsed ? (
                              job.modelUsed === "gemini-3.6-flash" ? "Gemini 3.6 Flash Encoding" :
                              job.modelUsed === "gemini-3.5-flash" ? "Gemini 3.5 Flash Encoding" :
                              job.modelUsed === "gemini-3.5-flash-lite" ? "Gemini 3.5 Flash Lite Encoding" :
                              job.modelUsed === "gemini-3.1-flash-lite" ? "Gemini 3.1 Flash Lite Encoding (Fallback)" :
                              job.modelUsed === "gemini-flash-latest" ? "Gemini Flash Latest Encoding (Fallback)" :
                              `${job.modelUsed.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Encoding`
                            ) : "Gemini 3.6 Flash Encoding"}
                          </span>
                          {job.progress >= 70 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : job.progress >= 20 ? (
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                          ) : (
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-medium ${job.progress >= 70 ? "text-slate-800" : "text-slate-400"}`}>
                            3. Formatting Transcript Paragraphs
                          </span>
                          {job.progress >= 100 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : job.progress >= 70 ? (
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                          ) : (
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 italic max-w-xs leading-relaxed">
                        {job.status === "processing_audio" && "Encoding audio wavelengths and segmenting speakers... (~10-30 seconds)"}
                        {job.status === "transcribing" && "Formatting high-fidelity textual transcript..."}
                        {job.status === "uploading" && "Securely passing stream payload..."}
                      </p>
                    </div>
                  ) : isPending && !job ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-6 min-h-[350px]">
                      <div className="relative h-16 w-16 flex items-center justify-center">
                        <div className="absolute inset-0 bg-blue-50 rounded-full animate-ping opacity-60" />
                        <div className="h-10 w-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin relative" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                          {optimizationStatus ? "Optimizing & Compressing Audio" : "Uploading Audio Payload"}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono">
                          {optimizationStatus || "Sending audio to transcription pipeline..."}
                        </p>
                      </div>
                      <div className="w-full max-w-xs bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{ width: "100%" }} />
                      </div>
                      <p className="text-[10px] text-slate-400 max-w-xs italic leading-normal">
                        This processes your file locally using the Web Audio API to resample, downmix, and compress the voice stream.
                      </p>
                    </div>
                  ) : (
                    /* UPLOAD & CONFIGURATION CARD */
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
                      
                      {errorMessage && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex gap-2.5 text-red-700 text-xs items-start">
                          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Workflow Error:</span> {errorMessage}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        
                        {/* Step 1: File selection */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Step 1: Choose Audio File</label>
                          <div
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] ${
                              dragActive 
                                ? "border-blue-500 bg-blue-50/40" 
                                : file 
                                  ? "border-emerald-500 bg-emerald-50/10 hover:border-emerald-600" 
                                  : "border-slate-200 hover:border-blue-400 hover:bg-slate-50/50"
                            }`}
                          >
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="audio/*"
                              onChange={handleFileSelect}
                              className="hidden"
                            />

                            {file ? (
                              <div className="space-y-1.5 flex flex-col items-center">
                                <FileAudio className="h-8 w-8 text-emerald-600 animate-pulse" />
                                <div className="max-w-[200px]">
                                  <p className="font-semibold text-slate-800 text-xs truncate">{file.name}</p>
                                  <p className="text-[9px] text-slate-400 font-mono">
                                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                                  </p>
                                </div>
                                <span className="inline-block text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                  Selected
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-2 flex flex-col items-center">
                                <UploadCloud className="h-6 w-6 text-blue-500" />
                                <div>
                                  <p className="font-bold text-slate-700 text-xs">Drag & drop podcast audio</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">MP3, WAV, M4A, OGG, FLAC (max 100MB)</p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Client-side Audio Optimization Box */}
                          <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 mt-2.5 space-y-3">
                            <div className="flex items-start gap-2.5">
                              <input
                                type="checkbox"
                                id="optimize-audio-checkbox"
                                checked={optimizeAudio}
                                onChange={(e) => setOptimizeAudio(e.target.checked)}
                                className="mt-0.5 h-3.5 w-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                              />
                              <div className="space-y-0.5">
                                <label htmlFor="optimize-audio-checkbox" className="text-[10px] font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                                  Optimize & Compress Audio <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[8px] font-mono rounded font-extrabold uppercase tracking-wider">Recommended</span>
                                </label>
                                <p className="text-[9px] text-slate-500 leading-normal">
                                  Resamples and downmixes audio locally before upload to stay under network limits and ensure lightning-fast transfers.
                                </p>
                              </div>
                            </div>

                            {optimizeAudio && (
                              <div className="pl-6 pt-1.5 space-y-2 border-t border-slate-200/60 mt-2">
                                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Compression Profile</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setAudioOptimizationProfile('auto')}
                                    className={`py-1 px-2 text-[9px] font-medium rounded-md border text-center transition-all cursor-pointer ${
                                      audioOptimizationProfile === 'auto'
                                        ? "border-blue-500 bg-blue-50/30 text-blue-700 font-bold"
                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100/50"
                                    }`}
                                  >
                                    Auto Smart Limit (Safe)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAudioOptimizationProfile('high')}
                                    className={`py-1 px-2 text-[9px] font-medium rounded-md border text-center transition-all cursor-pointer ${
                                      audioOptimizationProfile === 'high'
                                        ? "border-blue-500 bg-blue-50/30 text-blue-700 font-bold"
                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100/50"
                                    }`}
                                  >
                                    High Quality (16kHz, 16-bit)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAudioOptimizationProfile('standard')}
                                    className={`py-1 px-2 text-[9px] font-medium rounded-md border text-center transition-all cursor-pointer ${
                                      audioOptimizationProfile === 'standard'
                                        ? "border-blue-500 bg-blue-50/30 text-blue-700 font-bold"
                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100/50"
                                    }`}
                                  >
                                    Balanced (12kHz, 16-bit)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAudioOptimizationProfile('compact')}
                                    className={`py-1 px-2 text-[9px] font-medium rounded-md border text-center transition-all cursor-pointer ${
                                      audioOptimizationProfile === 'compact'
                                        ? "border-blue-500 bg-blue-50/30 text-blue-700 font-bold"
                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100/50"
                                    }`}
                                  >
                                    Voice Compact (8kHz, 8-bit)
                                  </button>
                                </div>
                                <p className="text-[8px] text-slate-400 italic">
                                  {audioOptimizationProfile === 'auto' && "Automatically shrinks large/long files to stay safely under the 25MB container network limit."}
                                  {audioOptimizationProfile === 'high' && "Uses high-fidelity 16kHz sample rate with 16-bit resolution. Great for short podcasts."}
                                  {audioOptimizationProfile === 'standard' && "Optimized 12kHz, 16-bit mono profile. Cuts file size in half with great speech legibility."}
                                  {audioOptimizationProfile === 'compact' && "8kHz, 8-bit ultra-light mono profile. Shrinks even massive 2-hour podcasts down to ~15-20MB!"}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Step 2: Formats Selector */}
                        <div className="space-y-2 flex flex-col justify-between">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Step 2: Formatting Workflow</label>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <button
                                type="button"
                                onClick={() => setPromptStyle("clean")}
                                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  promptStyle === "clean" 
                                    ? "border-blue-500 bg-blue-50/10 ring-1 ring-blue-500" 
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <FileText className={`h-4.5 w-4.5 mb-1 ${promptStyle === "clean" ? "text-blue-600" : "text-slate-400"}`} />
                                <div className="text-[10px] font-bold text-slate-800">Clean</div>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPromptStyle("timestamped")}
                                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  promptStyle === "timestamped" 
                                    ? "border-blue-500 bg-blue-50/10 ring-1 ring-blue-500" 
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <Clock className={`h-4.5 w-4.5 mb-1 ${promptStyle === "timestamped" ? "text-blue-600" : "text-slate-400"}`} />
                                <div className="text-[10px] font-bold text-slate-800">Timestamps</div>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPromptStyle("verbatim")}
                                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  promptStyle === "verbatim" 
                                    ? "border-blue-500 bg-blue-50/10 ring-1 ring-blue-500" 
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <User className={`h-4.5 w-4.5 mb-1 ${promptStyle === "verbatim" ? "text-blue-600" : "text-slate-400"}`} />
                                <div className="text-[10px] font-bold text-slate-800">Speakers</div>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPromptStyle("combined")}
                                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  promptStyle === "combined" 
                                    ? "border-blue-500 bg-blue-50/10 ring-1 ring-blue-500" 
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                                title="Combines Speaker tags, precise Timestamps, and fully cleaned text"
                              >
                                <Layers className={`h-4.5 w-4.5 mb-1 ${promptStyle === "combined" ? "text-blue-600" : "text-slate-400"}`} />
                                <div className="text-[10px] font-bold text-slate-800">Combined</div>
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setPromptStyle(promptStyle === "custom" ? "clean" : "custom")}
                            className={`text-[10px] font-bold inline-flex items-center gap-1 hover:underline text-left mt-2 ${
                              promptStyle === "custom" ? "text-blue-600" : "text-slate-400"
                            }`}
                          >
                            <Sparkles className="h-3 w-3" />
                            {promptStyle === "custom" ? "Disable Custom Prompt" : "Use Custom Transcription Prompt"}
                          </button>
                        </div>

                      </div>

                      {/* Custom Prompt Expanded */}
                      {promptStyle === "custom" && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Enter Custom Transcription Prompt</label>
                          <textarea
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="Example: Transcribe only the first 5 minutes, correct names, and output paragraphs in English."
                            className="w-full text-xs bg-white border border-slate-200 rounded-md p-2 h-14 focus:ring-1 focus:ring-blue-500 outline-none leading-normal text-slate-800"
                          />
                        </div>
                      )}

                      {/* Submit Trigger */}
                      <button
                        type="button"
                        onClick={handleStartTranscription}
                        disabled={!file || isPending}
                        className={`w-full py-2.5 px-4 rounded-lg text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all ${
                          !file 
                            ? "bg-slate-300 cursor-not-allowed" 
                            : "bg-blue-600 hover:bg-blue-700 active:scale-[0.99] cursor-pointer"
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Initialize Transcription Workflow
                      </button>

                    </div>
                  )}

                  {/* ACTIVE/SAMPLE QUEUE LIST */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                    <div className="grid grid-cols-12 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider p-3 border-b border-slate-200">
                      <div className="col-span-6 pl-2">Filename & Metadata</div>
                      <div className="col-span-1">Duration</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-3 pl-2">Actions</div>
                    </div>
                    
                    <div className="divide-y divide-slate-100">
                      
                      {jobsList.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                          No transcription jobs found. Start by uploading an audio file above.
                        </div>
                      ) : (
                        jobsList.map((item) => {
                          const isSelected = job?.id === item.id;
                          const isPreviewed = selectedPreviewId ? (selectedPreviewId === item.id) : (latestCompletedJob?.id === item.id);
                          const isSelectableForPreview = item.status === "completed" || item.status === "archived" || item.status === "failed";
                          return (
                            <div 
                              key={item.id} 
                              onClick={() => {
                                if (isSelectableForPreview) {
                                  setSelectedPreviewId(item.id);
                                }
                              }}
                              className={`grid grid-cols-12 items-center p-3 transition-all border-l-2 ${
                                isSelected 
                                  ? "bg-blue-50/50 border-blue-500 shadow-sm" 
                                  : isPreviewed 
                                    ? "bg-slate-100/80 border-slate-400 shadow-sm" 
                                    : "border-transparent hover:bg-slate-50/80"
                              } ${isSelectableForPreview ? "cursor-pointer" : ""}`}
                            >
                              <div className="col-span-6 flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${
                                  item.status === "completed" 
                                    ? "bg-emerald-100 text-emerald-600" 
                                    : item.status === "failed" 
                                      ? "bg-red-100 text-red-600"
                                      : item.status === "archived"
                                        ? "bg-slate-100 text-slate-400"
                                        : "bg-blue-100 text-blue-600"
                                }`}>
                                  {item.filename.split(".").pop()?.toUpperCase().slice(0, 4) || "AUD"}
                                </div>
                                <div className="truncate pr-2">
                                  <div className="text-xs font-bold text-slate-800 truncate" title={item.filename}>
                                    {item.filename}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                                    <span>{new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    <span>•</span>
                                    <span>{(item.fileSize / (1024 * 1024)).toFixed(1)}MB</span>
                                    {item.modelUsed && (
                                      <>
                                        <span>•</span>
                                        <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 text-slate-500 rounded text-[8px] uppercase tracking-wide font-semibold">{item.modelUsed}</span>
                                      </>
                                    )}
                                  </div>
                                  
                                  {/* Available hub assets status indicators */}
                                  {(item.summary || item.key_takeaways || item.chapters || item.social_media) && (
                                    <div className="flex items-center gap-1.5 mt-1.5 select-none">
                                      <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider">Available Assets:</span>
                                      <div className="flex items-center gap-1">
                                        {item.summary && (
                                          <span className="p-0.5 bg-blue-50 border border-blue-100 text-blue-600 rounded flex items-center" title="Summary Available">
                                            <FileText className="h-2.5 w-2.5" />
                                          </span>
                                        )}
                                        {item.key_takeaways && (
                                          <span className="p-0.5 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded flex items-center" title="Takeaways Available">
                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                          </span>
                                        )}
                                        {item.chapters && (
                                          <span className="p-0.5 bg-amber-50 border border-amber-100 text-amber-600 rounded flex items-center" title="Chapters Available">
                                            <Clock className="h-2.5 w-2.5" />
                                          </span>
                                        )}
                                        {item.social_media && (
                                          <span className="p-0.5 bg-purple-50 border border-purple-100 text-purple-600 rounded flex items-center" title="Social Share Available">
                                            <Share2 className="h-2.5 w-2.5" />
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="col-span-1 text-xs text-slate-600 font-mono">
                                {item.duration || "--:--"}
                              </div>
                              <div className="col-span-2">
                                {item.status === "completed" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold border border-emerald-200 uppercase tracking-wide">
                                    Ready
                                  </span>
                                )}
                                {item.status === "archived" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold border border-slate-200 uppercase tracking-wide">
                                    Archived
                                  </span>
                                )}
                                {item.status === "failed" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[9px] font-bold border border-red-200 uppercase tracking-wide">
                                    Failed
                                  </span>
                                )}
                                {(item.status === "uploading" || item.status === "processing_audio" || item.status === "transcribing") && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-bold border border-amber-200 uppercase tracking-wide">
                                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span> {item.status === "processing_audio" ? "encoding" : item.status}
                                  </span>
                                )}
                              </div>
                              <div className="col-span-3 flex items-center gap-2 justify-end pr-1">
                                {deletingJobId === item.id ? (
                                  <div className="flex items-center gap-1.5 ml-auto">
                                    <span className="text-[9px] font-bold text-red-500 uppercase mr-1">Delete?</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmDeleteJob(item.id);
                                      }}
                                      className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold rounded shadow-sm transition-colors cursor-pointer"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeletingJobId(null);
                                      }}
                                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[9px] font-bold rounded border border-slate-200 shadow-sm transition-colors cursor-pointer"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    {(item.status === "completed" || item.status === "archived") && (
                                      <>
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectJob(item.id);
                                          }}
                                          className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold rounded shadow-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer"
                                        >
                                          Review
                                        </button>
                                        <button 
                                          onClick={(e) => handleToggleArchive(item.id, e)}
                                          className="px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 text-[9px] font-bold rounded shadow-sm text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer"
                                          title={item.status === "archived" ? "Unarchive" : "Archive"}
                                        >
                                          <Archive className="h-3 w-3 text-slate-400" />
                                          {item.status === "archived" ? "Restore" : "Archive"}
                                        </button>
                                      </>
                                    )}
                                    
                                    {item.status === "failed" && (
                                      <span className="text-[9px] text-red-500 font-bold uppercase tracking-wide">Error</span>
                                    )}

                                    {(item.status === "uploading" || item.status === "processing_audio" || item.status === "transcribing") && (
                                      <div className="text-[10px] text-blue-600 font-mono font-bold animate-pulse">{item.progress}%</div>
                                    )}

                                    <button 
                                      onClick={(e) => handleDeleteJob(item.id, e)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer ml-auto"
                                      title="Delete Job"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}

                    </div>
                  </div>

                </div>

                {/* Right Panel: Side Panel Stats & Template Info (col-span-4) */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                  
                  {/* Workflow stats - Backlog / Mocked
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">Workflow Summary</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-xl font-extrabold text-slate-800">1,402</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Mins Transcribed</div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-xl font-extrabold text-slate-800">98.4%</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Avg. Confidence</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-500">Automatic Export</span>
                        <span className="text-blue-600 font-bold">Notion API</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-500">Model Engine</span>
                        <span className="text-slate-800 font-bold font-mono">Gemini 3.5 Flash</span>
                      </div>
                    </div>
                  </div>
                  */}

                  {/* Dark Immersive Preview Panel */}
                  <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 shadow-lg text-white flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between items-center">
                        <span>Quick Preview</span>
                        {previewJob && (
                          <span className="text-[8px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 font-mono normal-case shrink-0 truncate max-w-[150px]" title={previewJob.filename}>
                            Active: {previewJob.filename}
                          </span>
                        )}
                      </h3>
                      
                      <div className="space-y-4 mt-4 overflow-y-auto max-h-[450px] lg:max-h-[580px] xl:max-h-[680px] pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                        {!previewJob ? (
                          <div className="p-8 text-center text-slate-400 font-sans">
                            <FileAudio className="h-8 w-8 mx-auto mb-3 text-slate-600" />
                            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">No Active Preview</div>
                            <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                              Upload an audio file or select a completed transcription job to view its live transcript preview.
                            </p>
                          </div>
                        ) : previewJob.status === "failed" ? (
                          <div className="p-4 bg-red-950/30 border border-red-900/40 rounded-lg text-red-400">
                            <div className="flex items-center gap-2 mb-1.5 font-bold text-xs uppercase tracking-wider">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              <span>Pipeline Failed</span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-slate-300">
                              The transcription pipeline failed for this audio track. This can happen due to non-vocal audio, extreme static, or server timeouts. Please try re-encoding or uploading a compact voice profile.
                            </p>
                          </div>
                        ) : (
                          parsedLines.map((line, idx) => (
                            <div key={idx} className={idx === 1 ? "border-l-2 border-slate-700 pl-4" : ""}>
                              <div className={`text-[9px] font-mono font-bold mb-1 ${line.speakerColorClass}`}>
                                {line.header}
                              </div>
                              <p className="text-[11px] leading-relaxed text-slate-300 line-clamp-3" title={line.text}>
                                {line.text}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {previewJob && previewJob.status !== "failed" && (
                      <div className="mt-5 pt-4 border-t border-slate-800/80 shrink-0">
                        <button
                          onClick={() => {
                            if (previewJob.id === "sample-sarah") {
                              handleReviewSample("sample-sarah");
                            } else {
                              handleSelectJob(previewJob.id);
                            }
                          }}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-lg hover:shadow-blue-500/10 active:scale-[0.98]"
                        >
                          Review Full Transcript
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                  </div>

                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer / Status Bar */}
        <footer className="h-10 bg-white border-t border-slate-200 flex items-center justify-between px-6 text-xs text-slate-500 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              ScribeNode Active Engine
            </div>
          </div>
          <button
            onClick={() => setShowAboutModal(true)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-slate-100/80 hover:bg-blue-50/80 px-3 py-1 rounded-md border border-slate-200/80 transition-all cursor-pointer shadow-2xs group"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform" />
            <span className="font-mono text-xs font-bold text-slate-800">v1.1.0</span>
            <span className="text-[10px] text-slate-400 font-normal border-l border-slate-200 pl-2">About & Release Notes</span>
          </button>
        </footer>

        {/* About & Release Notes Modal */}
        <AnimatePresence>
          {showAboutModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]"
              >
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <ScribeNodeLogo className="w-9 h-9" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-lg text-white tracking-tight">Scribe<span className="text-blue-300">Node</span></h2>
                        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                          v1.1.0
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">AI Speech & Transcript Engine</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAboutModal(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="p-6 overflow-y-auto space-y-6 text-slate-700 text-xs leading-relaxed">
                  {/* Section 1: System Overview */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5 mb-2">
                      <Cpu className="w-4 h-4 text-blue-600" />
                      System Overview
                    </h3>
                    <p className="text-slate-600 mb-3">
                      ScribeNode is an AI-powered speech intelligence engine built for processing podcasts, interviews, and recordings into publication-ready transcripts with speaker diarization, timestamps, and multi-format content pipelines.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">CORE AI MODEL</span>
                        <span className="text-slate-800 font-semibold">Gemini 3.6 Flash</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">SERVER FRAMEWORK</span>
                        <span className="text-slate-800 font-semibold">Express 5.2 / Node 26</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">BUILD ENGINE</span>
                        <span className="text-slate-800 font-semibold">Vite 8 / React 19</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">TRANSCRIPTION STYLE</span>
                        <span className="text-slate-800 font-semibold">Polished Clean Verbatim</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Release Notes */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5 mb-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      What's New in v1.1.0
                    </h3>
                    <ul className="space-y-2.5 border-l-2 border-blue-200 pl-3">
                      <li className="relative">
                        <span className="font-bold text-slate-900">Intelligent Host & Speaker Extraction:</span>
                        <p className="text-slate-600 mt-0.5">Automatically identifies show hosts and key guests (e.g. "Mike Auzenne, Mark Horstman"), filtering out conversational filler and isolating official speaker names in transcript headers and turn badges.</p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900">Refined Diarization & Speaker Turn Tags:</span>
                        <p className="text-slate-600 mt-0.5">Improved multi-speaker transcript clarity with precise turn-by-turn attribution, formatted timecode stamps, and clean paragraph breaks for long podcasts and interviews.</p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900">Polished Clean Verbatim Engine:</span>
                        <p className="text-slate-600 mt-0.5">Optimized prompt processing to strip out false starts, stutters, and verbal artifacts while preserving natural tone, technical terms, and critical quotes.</p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900">Transcript Workspace & Multi-Format Exports:</span>
                        <p className="text-slate-600 mt-0.5">Enhanced search and speaker filtering controls, alongside instant exports to Markdown (.md), plain text (.txt), and one-click clipboard copying.</p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900">High-Performance Core Infrastructure:</span>
                        <p className="text-slate-600 mt-0.5">Upgraded backend server architecture to Express 5 & Node 26 with Vite 8 and React 19 for faster audio uploads, streamlined background processing, and peak security compliance.</p>
                      </li>
                    </ul>
                  </div>

                  {/* Section 3: Privacy & Storage */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5 mb-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Privacy & Storage
                    </h3>
                    <p className="text-slate-600">
                      Audio files are processed via secure server-side Gemini API proxy calls and cleaned up after processing. Transcripts and job histories remain saved locally in memory.
                    </p>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                  <span className="text-[10px] text-slate-400 font-mono">ScribeNode • Production Engine</span>
                  <button
                    onClick={() => setShowAboutModal(false)}
                    className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
