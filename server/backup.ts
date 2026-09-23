import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { JobsStorage, TranscribeJob } from "./storage";
import { getAppVersion } from "./config";

export interface BackupManifest {
  formatVersion: number;
  app: string;
  appVersion: string;
  createdAt: string;
  jobCount: number;
  includesAudio: boolean;
  totalAudioSizeBytes: number;
  jobsSummary: Array<{
    id: string;
    filename: string;
    duration?: string;
    hasAudio: boolean;
    status: string;
  }>;
}

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: number;
  formattedDate: string;
  jobCount?: number;
  includesAudio?: boolean;
}

export interface RestoreResult {
  success: boolean;
  restoredJobsCount: number;
  restoredAudioCount: number;
  mode: "merge" | "replace";
  warnings: string[];
}

/**
 * Generates a safe, dated filename for backups:
 * e.g. scribenode-backup-2026-09-23T15-30-00.zip
 */
export function generateBackupFilename(prefix = "scribenode-backup"): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${prefix}-${year}-${month}-${day}T${hours}-${minutes}-${seconds}.zip`;
}

/**
 * Returns the backups storage directory, creating it if needed.
 */
export function getBackupsDirectory(storage: JobsStorage): string {
  const backupsDir = path.join(storage.uploadsDir, "backups");
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  return backupsDir;
}

/**
 * Sanitize a filename to prevent directory traversal or Zip Slip attacks.
 */
export function sanitizeBackupFilename(filename: string): string {
  const base = path.basename(filename);
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(base)) {
    throw new Error("Invalid backup filename characters.");
  }
  return base;
}

/**
 * Creates a complete ZIP backup of ScribeNode data and writes it to disk.
 */
export async function createBackupArchive({
  storage,
  includeAudio = true,
  customFilename
}: {
  storage: JobsStorage;
  includeAudio?: boolean;
  customFilename?: string;
}): Promise<{
  filename: string;
  filePath: string;
  sizeBytes: number;
  manifest: BackupManifest;
  zipBuffer: Buffer;
}> {
  const zip = new JSZip();
  const jobs = storage.values();
  const backupsDir = getBackupsDirectory(storage);

  let totalAudioSizeBytes = 0;
  const audioFolder = zip.folder("audio");

  const jobsSummary = jobs.map((job) => {
    let hasAudio = false;
    if (includeAudio && job.localFilePath && fs.existsSync(job.localFilePath)) {
      try {
        const stats = fs.statSync(job.localFilePath);
        if (stats.isFile()) {
          const audioBuffer = fs.readFileSync(job.localFilePath);
          const safeAudioName = `${job.id}.audio`;
          audioFolder?.file(safeAudioName, audioBuffer);
          totalAudioSizeBytes += stats.size;
          hasAudio = true;
        }
      } catch (err) {
        console.warn(`[Backup] Could not include audio file for job ${job.id}:`, err);
      }
    }

    return {
      id: job.id,
      filename: job.filename,
      duration: job.duration,
      hasAudio,
      status: job.status
    };
  });

  const manifest: BackupManifest = {
    formatVersion: 1,
    app: "ScribeNode",
    appVersion: getAppVersion(),
    createdAt: new Date().toISOString(),
    jobCount: jobs.length,
    includesAudio: includeAudio && totalAudioSizeBytes > 0,
    totalAudioSizeBytes,
    jobsSummary
  };

  // Add manifest and raw jobs data
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("jobs.json", JSON.stringify(jobs, null, 2));

  // Generate ZIP binary buffer with DEFLATE compression
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  const filename = customFilename ? sanitizeBackupFilename(customFilename) : generateBackupFilename();
  const filePath = path.join(backupsDir, filename);

  fs.writeFileSync(filePath, zipBuffer);
  const sizeBytes = zipBuffer.length;

  return {
    filename,
    filePath,
    sizeBytes,
    manifest,
    zipBuffer
  };
}

/**
 * Lists all backup archives present in the persistent backups directory.
 */
export async function listStoredBackups(storage: JobsStorage): Promise<BackupFileInfo[]> {
  const backupsDir = getBackupsDirectory(storage);
  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  const files = fs.readdirSync(backupsDir);
  const results: BackupFileInfo[] = [];

  for (const file of files) {
    if (!file.endsWith(".zip")) continue;

    try {
      const fullPath = path.join(backupsDir, file);
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) continue;

      let jobCount: number | undefined;
      let includesAudio: boolean | undefined;

      // Quick read manifest if small or present
      try {
        const fileBuffer = fs.readFileSync(fullPath);
        const zip = await JSZip.loadAsync(fileBuffer);
        const manifestFile = zip.file("manifest.json");
        if (manifestFile) {
          const raw = await manifestFile.async("string");
          const parsed = JSON.parse(raw);
          jobCount = parsed.jobCount;
          includesAudio = parsed.includesAudio;
        }
      } catch {}

      results.push({
        filename: file,
        sizeBytes: stats.size,
        createdAt: stats.mtimeMs,
        formattedDate: new Date(stats.mtimeMs).toISOString(),
        jobCount,
        includesAudio
      });
    } catch {}
  }

  return results.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Deletes a stored backup archive by filename.
 */
export function deleteStoredBackup(storage: JobsStorage, filename: string): boolean {
  const safeName = sanitizeBackupFilename(filename);
  const backupsDir = getBackupsDirectory(storage);
  const targetPath = path.join(backupsDir, safeName);

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    return true;
  }
  return false;
}

/**
 * Restores jobs, transcripts, assets, and audio files from a ZIP buffer into JobsStorage.
 */
export async function restoreBackupFromBuffer({
  storage,
  zipBuffer,
  mode = "merge"
}: {
  storage: JobsStorage;
  zipBuffer: Buffer;
  mode?: "merge" | "replace";
}): Promise<RestoreResult> {
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(zipBuffer);

  // Validate manifest or jobs.json presence
  const jobsEntry = zip.file("jobs.json");
  if (!jobsEntry) {
    throw new Error("Invalid backup archive: missing 'jobs.json' database.");
  }

  const jobsDataRaw = await jobsEntry.async("string");
  let restoredJobs: TranscribeJob[] = [];
  try {
    restoredJobs = JSON.parse(jobsDataRaw);
    if (!Array.isArray(restoredJobs)) {
      throw new Error("jobs.json does not contain a valid JSON array.");
    }
  } catch (err: any) {
    throw new Error(`Failed to parse backup jobs.json: ${err.message}`);
  }

  // Check optional manifest
  const manifestEntry = zip.file("manifest.json");
  if (manifestEntry) {
    try {
      const manifestStr = await manifestEntry.async("string");
      const manifest = JSON.parse(manifestStr) as BackupManifest;
      console.log(`[Restore] Restoring ScribeNode backup created on ${manifest.createdAt} from v${manifest.appVersion}`);
    } catch {}
  }

  // If replacing, clean existing jobs
  if (mode === "replace") {
    // Delete existing jobs and their files
    for (const job of storage.values()) {
      if (job.localFilePath) {
        try {
          if (fs.existsSync(job.localFilePath)) {
            fs.unlinkSync(job.localFilePath);
          }
        } catch {}
      }
    }
    storage.clear();
  }

  let restoredAudioCount = 0;

  // Process restored jobs
  for (const job of restoredJobs) {
    if (!job.id || typeof job.id !== "string") {
      warnings.push(`Skipped malformed job missing id: ${JSON.stringify(job).slice(0, 50)}`);
      continue;
    }

    // Zip Slip Defense: Ensure no path traversal
    const safeJobId = path.basename(job.id).replace(/[^a-zA-Z0-9_\-]/g, "");
    if (!safeJobId) {
      warnings.push(`Skipped job with unsafe id: ${job.id}`);
      continue;
    }

    // Check if zip contains audio for this job
    // Can be named audio/<id>.audio or audio/<filename>
    const potentialAudioFile = zip.file(`audio/${job.id}.audio`) || zip.file(`audio/${safeJobId}.audio`);
    
    if (potentialAudioFile) {
      try {
        const audioData = await potentialAudioFile.async("nodebuffer");
        const restoredAudioPath = path.join(storage.uploadsDir, `${safeJobId}.audio`);
        fs.writeFileSync(restoredAudioPath, audioData);
        job.localFilePath = restoredAudioPath;
        job.hasAudioFile = true;
        restoredAudioCount++;
      } catch (err: any) {
        warnings.push(`Failed to extract audio for job ${job.id}: ${err.message}`);
      }
    } else if (job.localFilePath && !fs.existsSync(job.localFilePath)) {
      // Local file path from original system does not exist on this system
      job.hasAudioFile = false;
    } else if (job.localFilePath && fs.existsSync(job.localFilePath)) {
      job.hasAudioFile = true;
    }

    storage.set(job.id, job);
  }

  // Persist restored state to disk
  storage.saveToDisk();

  return {
    success: true,
    restoredJobsCount: restoredJobs.length,
    restoredAudioCount,
    mode,
    warnings
  };
}
