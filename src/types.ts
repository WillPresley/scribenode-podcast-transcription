export type JobStatus = 'uploading' | 'processing_audio' | 'transcribing' | 'completed' | 'failed' | 'archived';

export type PromptStyle = 'clean' | 'timestamped' | 'verbatim' | 'custom' | 'combined';

export type AnalysisMode = 'summary' | 'key_takeaways' | 'chapters' | 'social_media';

export interface TranscribeJob {
  id: string;
  filename: string;
  fileSize: number;
  status: JobStatus;
  progress: number;
  error?: string;
  transcript?: string;
  createdAt: number;
  duration?: string;
  modelUsed?: string;
  summary?: string;
  key_takeaways?: string;
  chapters?: string;
  social_media?: string;
  localFilePath?: string;
  mimeType?: string;
}

export interface AnalysisResults {
  summary?: string;
  key_takeaways?: string;
  chapters?: string;
  social_media?: string;
}

export interface ModelStatusInfo {
  primaryModel: string;
  activeModel: string;
  fallbackModels: string[];
  status: 'optimal' | 'fallback_active' | 'degraded';
  lastUsedModel?: string;
  lastFallbackReason?: string;
  lastTestedTimestamp?: number;
}
