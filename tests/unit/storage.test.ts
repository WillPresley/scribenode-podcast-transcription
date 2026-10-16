import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { JobsStorage, sampleJobsList } from '../../server/storage';

describe('Storage & Persistence Engine', () => {
  let tempStorageDir: string;
  let storage: JobsStorage;

  beforeEach(() => {
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scribenode-test-storage-'));
    storage = new JobsStorage(tempStorageDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempStorageDir)) {
        fs.rmSync(tempStorageDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('initializes and preseeds default sample jobs when DISABLE_DEFAULT_ITEMS is false', () => {
    storage.initialize({});
    const jobs = storage.values();
    expect(jobs.length).toBe(sampleJobsList.length);
    expect(storage.get('sample-sarah')).toBeDefined();
    expect(storage.get('sample-brief')).toBeDefined();
  });

  it('cleans preseeded default sample jobs when DISABLE_DEFAULT_ITEMS is true', () => {
    storage.initialize({ DISABLE_DEFAULT_ITEMS: 'true' });
    const jobs = storage.values();
    expect(jobs.length).toBe(0);
    expect(storage.get('sample-sarah')).toBeUndefined();
  });

  it('persists and reloads jobs from disk', () => {
    const testJob = {
      id: 'job-12345',
      filename: 'custom_audio.mp3',
      fileSize: 1024000,
      status: 'completed' as const,
      progress: 100,
      createdAt: Date.now(),
      transcript: '# Title\n[00:00] Text'
    };

    storage.set(testJob.id, testJob);
    storage.saveToDisk();

    // Create fresh instance pointing to same storage directory
    const reloadedStorage = new JobsStorage(tempStorageDir);
    reloadedStorage.loadFromDisk();

    const loadedJob = reloadedStorage.get('job-12345');
    expect(loadedJob).toBeDefined();
    expect(loadedJob?.filename).toBe('custom_audio.mp3');
  });

  it('deletes job and saves update to disk', () => {
    storage.initialize({});
    expect(storage.has('sample-sarah')).toBe(true);

    storage.delete('sample-sarah');
    storage.saveToDisk();

    const freshStorage = new JobsStorage(tempStorageDir);
    freshStorage.loadFromDisk();
    expect(freshStorage.has('sample-sarah')).toBe(false);
  });

  it('cleans orphaned upload files not linked to active jobs', () => {
    const orphanFilePath = path.join(tempStorageDir, 'orphan.audio');
    fs.writeFileSync(orphanFilePath, 'dummy audio data');

    expect(fs.existsSync(orphanFilePath)).toBe(true);

    const gcResult = storage.cleanOrphanedAndTempFiles();
    expect(gcResult.removedCount).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(orphanFilePath)).toBe(false);
  });

  it('debounces multiple rapid disk write requests into a single write', async () => {
    const testJob = {
      id: 'debounced-job',
      filename: 'debounced.mp3',
      fileSize: 500,
      status: 'completed' as const,
      progress: 100,
      createdAt: Date.now(),
      transcript: 'Test'
    };

    storage.set(testJob.id, testJob);
    storage.saveToDiskDebounced(30);

    // Immediately check - should not yet be on disk
    const freshStorage = new JobsStorage(tempStorageDir);
    freshStorage.loadFromDisk();
    expect(freshStorage.has('debounced-job')).toBe(false);

    // Wait for debounce timer to fire
    await new Promise((resolve) => setTimeout(resolve, 60));

    freshStorage.loadFromDisk();
    expect(freshStorage.has('debounced-job')).toBe(true);
  });

  it('validates that paths are strictly contained within uploads directory', () => {
    const validInside = path.join(tempStorageDir, 'valid-audio.mp3');
    const validNested = path.join(tempStorageDir, 'nested', 'audio.mp3');
    const traversalEscape = path.join(tempStorageDir, '..', 'secret.txt');
    const rootEscape = '/etc/passwd';

    expect(storage.isPathWithinUploads(validInside)).toBe(true);
    expect(storage.isPathWithinUploads(validNested)).toBe(true);
    expect(storage.isPathWithinUploads(traversalEscape)).toBe(false);
    expect(storage.isPathWithinUploads(rootEscape)).toBe(false);
    expect(storage.isPathWithinUploads('')).toBe(false);
  });

  it('performs atomic writes without leaving orphaned temporary files', () => {
    const testJob = {
      id: 'atomic-job',
      filename: 'atomic.mp3',
      fileSize: 100,
      status: 'completed' as const,
      progress: 100,
      createdAt: Date.now(),
      transcript: 'Atomic persistence check'
    };

    storage.set(testJob.id, testJob);
    storage.saveToDisk();

    // Verify main DB file exists and contains the job
    expect(fs.existsSync(storage.dbPath)).toBe(true);
    const savedContent = JSON.parse(fs.readFileSync(storage.dbPath, 'utf-8'));
    expect(savedContent.some((j: any) => j.id === 'atomic-job')).toBe(true);

    // Verify no temporary .tmp files remain in uploadsDir
    const files = fs.readdirSync(tempStorageDir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });
});
