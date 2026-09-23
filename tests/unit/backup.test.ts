import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import JSZip from "jszip";
import { JobsStorage, TranscribeJob } from "../../server/storage";
import {
  generateBackupFilename,
  sanitizeBackupFilename,
  createBackupArchive,
  listStoredBackups,
  deleteStoredBackup,
  restoreBackupFromBuffer,
  getBackupsDirectory
} from "../../server/backup";

describe("Backup & Restore Engine (Homelab / Self-Host)", () => {
  let testDir: string;
  let storage: JobsStorage;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "scribenode-backup-test-"));
    storage = new JobsStorage(testDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe("Filename generation and sanitization", () => {
    it("generates a valid, dated backup filename", () => {
      const filename = generateBackupFilename();
      expect(filename).toMatch(/^scribenode-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);
    });

    it("sanitizes safe filenames and prevents path traversal", () => {
      expect(sanitizeBackupFilename("backup-2026.zip")).toBe("backup-2026.zip");
      expect(sanitizeBackupFilename("../../secret/backup.zip")).toBe("backup.zip");
      expect(() => sanitizeBackupFilename("bad/name;rm -rf")).toThrow();
    });
  });

  describe("createBackupArchive", () => {
    it("creates a valid ZIP archive containing manifest.json and jobs.json", async () => {
      const testJob: TranscribeJob = {
        id: "job-1",
        filename: "test-audio.mp3",
        fileSize: 1024,
        status: "completed",
        progress: 100,
        createdAt: 1700000000000,
        transcript: "Hello world transcript",
        summary: "Executive summary here",
        duration: "02:30"
      };
      storage.set(testJob.id, testJob);
      storage.saveToDisk();

      const result = await createBackupArchive({ storage, includeAudio: false });

      expect(result.filename).toMatch(/\.zip$/);
      expect(fs.existsSync(result.filePath)).toBe(true);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.manifest.jobCount).toBe(1);
      expect(result.manifest.includesAudio).toBe(false);

      // Verify ZIP contents
      const zip = await JSZip.loadAsync(result.zipBuffer);
      expect(zip.file("manifest.json")).toBeTruthy();
      expect(zip.file("jobs.json")).toBeTruthy();

      const jobsStr = await zip.file("jobs.json")!.async("string");
      const parsedJobs = JSON.parse(jobsStr);
      expect(parsedJobs).toHaveLength(1);
      expect(parsedJobs[0].id).toBe("job-1");
      expect(parsedJobs[0].transcript).toBe("Hello world transcript");
    });

    it("packages audio files when includeAudio is true", async () => {
      const audioFile = path.join(testDir, "test.audio");
      fs.writeFileSync(audioFile, Buffer.from("FAKE AUDIO DATA 12345678"));

      const testJob: TranscribeJob = {
        id: "job-audio-test",
        filename: "podcast.mp3",
        fileSize: 24,
        status: "completed",
        progress: 100,
        createdAt: Date.now(),
        localFilePath: audioFile,
        transcript: "Transcript with audio"
      };
      storage.set(testJob.id, testJob);

      const result = await createBackupArchive({ storage, includeAudio: true });

      expect(result.manifest.includesAudio).toBe(true);
      expect(result.manifest.totalAudioSizeBytes).toBeGreaterThan(0);

      const zip = await JSZip.loadAsync(result.zipBuffer);
      const audioEntry = zip.file("audio/job-audio-test.audio");
      expect(audioEntry).toBeTruthy();
      const extractedContent = await audioEntry!.async("string");
      expect(extractedContent).toBe("FAKE AUDIO DATA 12345678");
    });
  });

  describe("listStoredBackups and deleteStoredBackup", () => {
    it("lists stored backups with metadata and deletes them", async () => {
      const job: TranscribeJob = {
        id: "job-list-1",
        filename: "item.mp3",
        fileSize: 100,
        status: "completed",
        progress: 100,
        createdAt: Date.now()
      };
      storage.set(job.id, job);

      const backup1 = await createBackupArchive({ storage, customFilename: "test-backup-1.zip" });
      const backup2 = await createBackupArchive({ storage, customFilename: "test-backup-2.zip" });

      const backups = await listStoredBackups(storage);
      expect(backups.length).toBe(2);
      expect(backups.some((b) => b.filename === "test-backup-1.zip")).toBe(true);
      expect(backups.some((b) => b.filename === "test-backup-2.zip")).toBe(true);

      const deleted = deleteStoredBackup(storage, "test-backup-1.zip");
      expect(deleted).toBe(true);

      const backupsAfter = await listStoredBackups(storage);
      expect(backupsAfter.length).toBe(1);
      expect(backupsAfter[0].filename).toBe("test-backup-2.zip");
    });
  });

  describe("restoreBackupFromBuffer", () => {
    it("restores jobs into storage in merge mode without removing existing ones", async () => {
      const existingJob: TranscribeJob = {
        id: "existing-job",
        filename: "existing.mp3",
        fileSize: 50,
        status: "completed",
        progress: 100,
        createdAt: 1000
      };
      storage.set(existingJob.id, existingJob);

      // Create a zip with a new job
      const backupJob: TranscribeJob = {
        id: "imported-job",
        filename: "imported.mp3",
        fileSize: 200,
        status: "completed",
        progress: 100,
        createdAt: 2000,
        transcript: "Imported transcript"
      };

      const zip = new JSZip();
      zip.file("jobs.json", JSON.stringify([backupJob]));
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const res = await restoreBackupFromBuffer({ storage, zipBuffer, mode: "merge" });
      expect(res.success).toBe(true);
      expect(res.restoredJobsCount).toBe(1);

      expect(storage.has("existing-job")).toBe(true);
      expect(storage.has("imported-job")).toBe(true);
      expect(storage.get("imported-job")?.transcript).toBe("Imported transcript");
    });

    it("restores jobs in replace mode by clearing prior jobs", async () => {
      const oldJob: TranscribeJob = {
        id: "old-job",
        filename: "old.mp3",
        fileSize: 10,
        status: "completed",
        progress: 100,
        createdAt: 500
      };
      storage.set(oldJob.id, oldJob);

      const newJob: TranscribeJob = {
        id: "fresh-job",
        filename: "fresh.mp3",
        fileSize: 99,
        status: "completed",
        progress: 100,
        createdAt: 900
      };

      const zip = new JSZip();
      zip.file("jobs.json", JSON.stringify([newJob]));
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const res = await restoreBackupFromBuffer({ storage, zipBuffer, mode: "replace" });
      expect(res.success).toBe(true);

      expect(storage.has("old-job")).toBe(false);
      expect(storage.has("fresh-job")).toBe(true);
    });

    it("restores audio files and updates localFilePath correctly", async () => {
      const job: TranscribeJob = {
        id: "restored-audio-job",
        filename: "episode.mp3",
        fileSize: 100,
        status: "completed",
        progress: 100,
        createdAt: 1000
      };

      const zip = new JSZip();
      zip.file("jobs.json", JSON.stringify([job]));
      zip.file("audio/restored-audio-job.audio", Buffer.from("RESTORED AUDIO STREAM"));
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      const res = await restoreBackupFromBuffer({ storage, zipBuffer, mode: "merge" });
      expect(res.restoredAudioCount).toBe(1);

      const restoredJob = storage.get("restored-audio-job");
      expect(restoredJob).toBeTruthy();
      expect(restoredJob?.hasAudioFile).toBe(true);
      expect(restoredJob?.localFilePath).toBeTruthy();
      expect(fs.existsSync(restoredJob!.localFilePath!)).toBe(true);
      expect(fs.readFileSync(restoredJob!.localFilePath!, "utf-8")).toBe("RESTORED AUDIO STREAM");
    });

    it("throws an error when jobs.json is missing in archive", async () => {
      const zip = new JSZip();
      zip.file("manifest.json", "{}");
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

      await expect(
        restoreBackupFromBuffer({ storage, zipBuffer, mode: "merge" })
      ).rejects.toThrow(/missing 'jobs.json'/);
    });
  });
});
