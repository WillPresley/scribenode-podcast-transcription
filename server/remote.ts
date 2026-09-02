/**
 * ScribeNode Remote Audio Downloader
 * Safely fetches remote audio URLs directly into temporary or persistent disk storage.
 */

import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export interface DownloadAudioResult {
  filePath: string;
  fileSize: number;
  mimeType: string;
  filename: string;
}

/**
 * Downloads a remote audio URL to a local destination file.
 */
export async function downloadRemoteAudio(params: {
  url: string;
  destPath: string;
  customFilename?: string;
  maxSizeBytes?: number;
  timeoutMs?: number;
}): Promise<DownloadAudioResult> {
  const { url, destPath, customFilename, maxSizeBytes = 250 * 1024 * 1024, timeoutMs = 60000 } = params;

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Invalid protocol: only http and https URLs are allowed.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "ScribeNode/1.5.0 (+https://github.com/WillPresley/scribenode-podcast-transcription)",
        "Accept": "audio/*, */*"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download audio file: HTTP ${response.status} ${response.statusText}`);
    }

    // Check Content-Length header if available
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const sizeNum = parseInt(contentLength, 10);
      if (sizeNum > maxSizeBytes) {
        throw new Error(`Remote audio file size (${(sizeNum / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB.`);
      }
    }

    // Infer filename
    let inferredFilename = customFilename;
    if (!inferredFilename) {
      const disposition = response.headers.get("content-disposition");
      if (disposition) {
        const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
        if (match && match[1]) {
          inferredFilename = decodeURIComponent(match[1]);
        }
      }
    }
    if (!inferredFilename) {
      const cleanPath = parsedUrl.pathname.split("/").filter(Boolean).pop();
      if (cleanPath && cleanPath.includes(".")) {
        inferredFilename = decodeURIComponent(cleanPath);
      } else {
        inferredFilename = "remote-audio.mp3";
      }
    }

    // Infer MIME Type
    let mimeType = response.headers.get("content-type") || "audio/mpeg";
    if (mimeType.includes(";")) {
      mimeType = mimeType.split(";")[0].trim();
    }
    if (!mimeType.startsWith("audio/") && !mimeType.startsWith("video/")) {
      const ext = path.extname(inferredFilename).toLowerCase();
      if (ext === ".wav") mimeType = "audio/wav";
      else if (ext === ".m4a" || ext === ".mp4") mimeType = "audio/mp4";
      else if (ext === ".ogg") mimeType = "audio/ogg";
      else if (ext === ".flac") mimeType = "audio/flac";
      else if (ext === ".aac") mimeType = "audio/aac";
      else mimeType = "audio/mpeg";
    }

    if (!response.body) {
      throw new Error("Response body is empty.");
    }

    // Stream download to destination path
    const fileWriteStream = fs.createWriteStream(destPath);
    let downloadedBytes = 0;

    // Node 18+ Web ReadableStream to Node Stream
    const nodeReadable = Readable.fromWeb(response.body as any);

    nodeReadable.on("data", (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (downloadedBytes > maxSizeBytes) {
        controller.abort();
        fileWriteStream.destroy();
        try { fs.unlinkSync(destPath); } catch {}
        throw new Error(`Downloaded audio exceeded maximum size limit of ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB.`);
      }
    });

    await pipeline(nodeReadable, fileWriteStream);

    const stat = fs.statSync(destPath);

    return {
      filePath: destPath,
      fileSize: stat.size,
      mimeType,
      filename: inferredFilename
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
