/**
 * ScribeNode Server Startup Banner Generator
 * Renders an aligned, publication-grade startup banner strictly constrained
 * within standard terminal boundaries (<= 70 columns).
 */

import os from "os";
import path from "path";
import fs from "fs";
import { isDisableDefaultItems, formatDockerTag, getAppVersion, getMaxUploadSizeMB } from "./config";
import {
  PRIMARY_TRANSCRIPTION_MODEL,
  DEFAULT_TRANSCRIPTION_MODELS,
  formatModelDisplayName
} from "./transcriptionEngine";

export const BANNER_BORDER_WIDTH = 70;

export const ASCII_LOGO = `
   _____           _ _          _   _           _      
  / ____|         (_) |        | \\ | |         | |     
 | (___   ___ _ __ _| |__   ___|  \\| | ___   __| | ___ 
  \\___ \\ / __| '__| | '_ \\ / _ \\ . \` |/ _ \\ / _\` |/ _ \\
  ____) | (__| |  | | |_) |  __/ |\\  | (_) | (_| |  __/
 |_____/ \\___|_|  |_|_.__/ \\___|_| \\_|\\___/ \\__,_|\\___|
`;

export interface StartupBannerOptions {
  version?: string;
  dockerTag?: string;
  gitSha?: string;
  nodeEnv?: string;
  nodeVersion?: string;
  platform?: string;
  arch?: string;
  serverUrl?: string;
  uploadsDir?: string;
  tempStorageDir?: string;
  hasGeminiApiKey?: boolean;
  primaryModel?: string;
  fallbackModels?: string[];
  disableDefaultItems?: boolean;
  maxUploadMB?: number;
}

export function buildStartupBannerLines(options: StartupBannerOptions = {}): string[] {
  const version = options.version || getAppVersion();
  const rawTag = options.dockerTag || process.env.DOCKER_TAG || process.env.CONTAINER_TAG || process.env.IMAGE_TAG || "latest";
  
  let rawSha = (options.gitSha || process.env.GIT_SHA || process.env.COMMIT_SHA || process.env.GITHUB_SHA || process.env.BUILD_SHA || process.env.IMAGE_SHA || process.env.IMAGE_DIGEST || process.env.SHA || "").trim();
  if (!rawSha) {
    try {
      const buildInfoPath = path.join(process.cwd(), "dist", "build-info.json");
      if (fs.existsSync(buildInfoPath)) {
        const info = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
        if (info.gitSha) rawSha = info.gitSha;
      }
    } catch {}
  }

  const dockerTag = formatDockerTag(rawTag, rawSha);
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || "development";
  const nodeVer = options.nodeVersion || process.version;
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const serverUrl = options.serverUrl || `http://0.0.0.0:${process.env.PORT || 3000}`;
  const uploadsDir = options.uploadsDir || path.join(process.cwd(), "uploads");
  const tempDir = options.tempStorageDir || os.tmpdir();
  const hasGeminiKey = options.hasGeminiApiKey !== undefined ? options.hasGeminiApiKey : Boolean(process.env.GEMINI_API_KEY);
  const primaryModel = options.primaryModel || PRIMARY_TRANSCRIPTION_MODEL;
  const fallbackModels = options.fallbackModels || DEFAULT_TRANSCRIPTION_MODELS;
  const preseedDisabled = options.disableDefaultItems !== undefined ? options.disableDefaultItems : isDisableDefaultItems();
  const maxUploadMB = options.maxUploadMB !== undefined ? options.maxUploadMB : getMaxUploadSizeMB();

  const divider = "=".repeat(BANNER_BORDER_WIDTH);

  const lines: string[] = [
    divider,
    " ScribeNode - AI Speech & Transcript Engine",
    ` Version      : v${version}`,
    ` Docker/Tag   : ${dockerTag}`,
    ` Environment  : ${nodeEnv}`,
    ` Node Runtime : ${nodeVer} (${platform} ${arch})`,
    ` Server URL   : ${serverUrl}`,
    ` Uploads Dir  : ${uploadsDir}`,
    ` Temp Storage : ${tempDir}`,
    ` Gemini API   : ${hasGeminiKey ? "Configured [OK]" : "NOT CONFIGURED [WARNING]"}`,
    ` Primary Model: ${primaryModel} (${formatModelDisplayName(primaryModel)})`,
    ` Fallback Chain (${fallbackModels.length} models):`,
  ];

  fallbackModels.forEach((m, idx) => {
    const isPrimary = idx === 0;
    const tag = isPrimary ? " (Primary)" : "";
    lines.push(`   [${idx + 1}] ${m.padEnd(25)} -> ${formatModelDisplayName(m)}${tag}`);
  });

  lines.push(` Preseed Items: ${preseedDisabled ? "Disabled (DISABLE_DEFAULT_ITEMS=true)" : "Enabled (Default)"}`);
  lines.push(` Max Upload   : ${maxUploadMB}MB (Configurable via MAX_UPLOAD_SIZE_MB)`);
  lines.push(divider);

  return lines;
}

export function printStartupBanner(options: StartupBannerOptions = {}): void {
  console.log(ASCII_LOGO);
  const lines = buildStartupBannerLines(options);
  lines.forEach(line => console.log(line));
  console.log("");
}
