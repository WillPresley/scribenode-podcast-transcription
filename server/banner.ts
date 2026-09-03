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

/**
 * Truncates or formats a text value so that `prefix + formattedValue` is strictly <= maxWidth characters.
 * For paths or URIs, preserves the tail (most informative part) with leading `...`.
 * For general text, truncates with trailing `...`.
 */
export function fitLine(prefix: string, value: string, maxWidth: number = BANNER_BORDER_WIDTH): string {
  const allowed = maxWidth - prefix.length;
  if (allowed <= 0) {
    return prefix.slice(0, maxWidth);
  }
  if (value.length <= allowed) {
    return prefix + value;
  }
  if (allowed <= 3) {
    return prefix + "...".slice(0, allowed);
  }

  // If value looks like a filesystem path or URL, truncate head with leading ellipsis
  if (value.includes("/") || value.includes("\\")) {
    return prefix + "..." + value.slice(value.length - (allowed - 3));
  }

  // Otherwise truncate tail with trailing ellipsis
  return prefix + value.slice(0, allowed - 3) + "...";
}

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
    fitLine(" ", "ScribeNode - AI Speech & Transcript Engine"),
    fitLine(" Version      : ", `v${version}`),
    fitLine(" Docker/Tag   : ", dockerTag),
    fitLine(" Environment  : ", nodeEnv),
    fitLine(" Node Runtime : ", `${nodeVer} (${platform} ${arch})`),
    fitLine(" Server URL   : ", serverUrl),
    fitLine(" Uploads Dir  : ", uploadsDir),
    fitLine(" Temp Storage : ", tempDir),
    fitLine(" Gemini API   : ", hasGeminiKey ? "Configured [OK]" : "NOT CONFIGURED [WARNING]"),
    fitLine(" Primary Model: ", `${primaryModel} (${formatModelDisplayName(primaryModel)})`),
    fitLine(" ", `Fallback Chain (${fallbackModels.length} models):`),
  ];

  fallbackModels.forEach((m, idx) => {
    const isPrimary = idx === 0;
    const tag = isPrimary ? " (Primary)" : "";
    const prefix = `   [${idx + 1}] `;
    const content = `${m.padEnd(25)} -> ${formatModelDisplayName(m)}${tag}`;
    lines.push(fitLine(prefix, content));
  });

  lines.push(fitLine(" Preseed Items: ", preseedDisabled ? "Disabled (DISABLE_DEFAULT_ITEMS=true)" : "Enabled (Default)"));
  lines.push(fitLine(" Max Upload   : ", `${maxUploadMB}MB (Configurable via MAX_UPLOAD_SIZE_MB)`));
  lines.push(divider);

  // Universal hard boundary safety guarantee
  return lines.map(line => {
    if (line.length > BANNER_BORDER_WIDTH) {
      return line.slice(0, BANNER_BORDER_WIDTH - 3) + "...";
    }
    return line;
  });
}

export function printStartupBanner(options: StartupBannerOptions = {}): void {
  console.log(ASCII_LOGO);
  const lines = buildStartupBannerLines(options);
  lines.forEach(line => console.log(line));
  console.log("");
}
