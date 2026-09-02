import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createApp } from '../../server/app';
import { JobsStorage } from '../../server/storage';
import { TranscribeJob } from '../../src/types';

describe('API Integration & Route Endpoints', () => {
  let tempDir: string;
  let storage: JobsStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scribenode-api-test-'));
    storage = new JobsStorage(tempDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('Health Probes', () => {
    it('returns status ok on /api/health', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });

    it('returns status ok on /healthz and /health', async () => {
      const app = createApp({ storage, skipVite: true });
      const res1 = await request(app).get('/healthz');
      expect(res1.status).toBe(200);

      const res2 = await request(app).get('/health');
      expect(res2.status).toBe(200);
    });
  });

  describe('Configuration & Security Headers', () => {
    it('returns configuration object on /api/config', async () => {
      const app = createApp({
        storage,
        env: {
          APP_TITLE: 'Custom Transcriber Engine',
          GEMINI_API_KEY: 'test-key-123'
        } as any,
        skipVite: true
      });

      const res = await request(app).get('/api/config');
      expect(res.status).toBe(200);
      expect(res.body.appTitle).toBe('Custom Transcriber Engine');
      expect(res.body.basicAuthEnabled).toBe(false);
      expect(res.body.disableDefaultItems).toBe(false);
      expect(res.body.hasGeminiKey).toBe(true);
      expect(res.body.maxUploadSizeMB).toBe(100);
      expect(res.body.modelStatus).toBeDefined();
      expect(res.body.modelStatus.primaryModel).toBe('gemini-3.8-flash');
      expect(res.body.modelStatus.activeModel).toBe('gemini-3.8-flash');
    });

    it('returns custom MAX_UPLOAD_SIZE_MB in /api/config when configured', async () => {
      const app = createApp({
        storage,
        env: {
          MAX_UPLOAD_SIZE_MB: '250',
          GEMINI_API_KEY: 'test-key-123'
        } as any,
        skipVite: true
      });

      const res = await request(app).get('/api/config');
      expect(res.status).toBe(200);
      expect(res.body.maxUploadSizeMB).toBe(250);
    });

    it('returns active model orchestration status on /api/model-status', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app).get('/api/model-status');
      expect(res.status).toBe(200);
      expect(res.body.primaryModel).toBe('gemini-3.8-flash');
      expect(res.body.activeModel).toBe('gemini-3.8-flash');
      expect(res.body.status).toBe('optimal');
      expect(res.body.fallbackModels).toContain('gemini-3.8-flash');
      expect(res.body.fallbackModels).toContain('gemini-3.7-flash');
      expect(res.body.fallbackModels).toContain('gemini-3.6-flash');
      expect(res.body.fallbackModels).toContain('gemini-3.5-flash');
      expect(res.body.fallbackModels).toContain('gemini-2.5-flash');
      expect(res.body.fallbackModels).toContain('gemini-flash-lite-latest');
    });

    it('enforces Basic Auth when BASIC_AUTH_ENABLED=true and credentials match', async () => {
      const app = createApp({
        storage,
        env: {
          BASIC_AUTH_ENABLED: 'true',
          BASIC_AUTH_USER: 'testuser',
          BASIC_AUTH_PASS: 'testpass123'
        } as any,
        skipVite: true
      });

      // Health endpoint remains unauthenticated
      const healthRes = await request(app).get('/api/health');
      expect(healthRes.status).toBe(200);

      // Protected endpoint without credentials returns 401
      const unauthRes = await request(app).get('/api/jobs');
      expect(unauthRes.status).toBe(401);

      // Protected endpoint with wrong credentials returns 401
      const wrongAuthRes = await request(app)
        .get('/api/jobs')
        .auth('testuser', 'wrongpass');
      expect(wrongAuthRes.status).toBe(401);

      // Protected endpoint with valid credentials returns 200
      const validAuthRes = await request(app)
        .get('/api/jobs')
        .auth('testuser', 'testpass123');
      expect(validAuthRes.status).toBe(200);
    });
  });

  describe('Jobs CRUD Operations', () => {
    it('lists all initialized jobs on GET /api/jobs', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app).get('/api/jobs');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('retrieves specific job on GET /api/jobs/:id', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app).get('/api/jobs/sample-sarah');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('sample-sarah');
      expect(res.body.transcript).toContain('Sarah Drabner');
    });

    it('returns 404 for nonexistent job ID on GET /api/jobs/:id', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app).get('/api/jobs/nonexistent-job-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Job not found');
    });

    it('streams audio file with 200 OK when no range header is passed', async () => {
      const testFilePath = path.join(storage.uploadsDir, 'streamable.mp3');
      fs.writeFileSync(testFilePath, 'fake audio file content for streaming');

      const streamJob: TranscribeJob = {
        id: 'job-audio-stream',
        filename: 'streamable.mp3',
        fileSize: 36,
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        localFilePath: testFilePath,
        mimeType: 'audio/mpeg',
        transcript: 'Some test transcript'
      };
      storage.set(streamJob.id, streamJob);

      const app = createApp({ storage, skipVite: true });
      const res = await request(app)
        .get('/api/jobs/job-audio-stream/audio')
        .buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('audio/mpeg');
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.body.toString()).toBe('fake audio file content for streaming');
    });

    it('handles Range requests with 206 Partial Content for audio seeking', async () => {
      const testFilePath = path.join(storage.uploadsDir, 'range-seek.mp3');
      fs.writeFileSync(testFilePath, '0123456789ABCDEF');

      const rangeJob: TranscribeJob = {
        id: 'job-range-seek',
        filename: 'range-seek.mp3',
        fileSize: 16,
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        localFilePath: testFilePath,
        mimeType: 'audio/mpeg',
        transcript: 'Some test transcript'
      };
      storage.set(rangeJob.id, rangeJob);

      const app = createApp({ storage, skipVite: true });
      const res = await request(app)
        .get('/api/jobs/job-range-seek/audio')
        .set('Range', 'bytes=0-9')
        .buffer(true);

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe('bytes 0-9/16');
      expect(res.headers['content-length']).toBe('10');
      expect(res.body.toString()).toBe('0123456789');
    });

    it('returns 404 when audio file does not exist on disk', async () => {
      const missingJob: TranscribeJob = {
        id: 'job-missing-audio',
        filename: 'ghost.mp3',
        fileSize: 100,
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        localFilePath: '/tmp/nonexistent-file-path-123.mp3',
        transcript: 'Some test transcript'
      };
      storage.set(missingJob.id, missingJob);

      const app = createApp({ storage, skipVite: true });
      const res = await request(app).get('/api/jobs/job-missing-audio/audio');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Audio file not available on disk');
    });

    it('deletes job and cleans associated local file on DELETE /api/jobs/:id', async () => {
      const testFilePath = path.join(storage.uploadsDir, 'custom-job.audio');
      fs.writeFileSync(testFilePath, 'dummy audio data');

      const customJob: TranscribeJob = {
        id: 'job-to-delete',
        filename: 'audio.mp3',
        fileSize: 100,
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        localFilePath: testFilePath,
        transcript: 'text'
      };
      storage.set(customJob.id, customJob);
      storage.saveToDisk();

      const app = createApp({ storage, skipVite: true });
      const res = await request(app).delete('/api/jobs/job-to-delete');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const checkRes = await request(app).get('/api/jobs/job-to-delete');
      expect(checkRes.status).toBe(404);
      expect(fs.existsSync(testFilePath)).toBe(false);
    });
  });

  describe('Job Archiving & Retranscription', () => {
    it('toggles archive status on POST /api/jobs/:id/archive', async () => {
      const app = createApp({ storage, skipVite: true });
      
      // sample-sarah is 'completed' -> should transition to 'archived'
      const res1 = await request(app).post('/api/jobs/sample-sarah/archive');
      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('archived');

      // POST again -> should transition back to 'completed'
      const res2 = await request(app).post('/api/jobs/sample-sarah/archive');
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('completed');
    });

    it('rejects archiving for non-completed jobs with 400', async () => {
      const pendingJob: TranscribeJob = {
        id: 'pending-job',
        filename: 'pending.mp3',
        fileSize: 100,
        status: 'transcribing',
        progress: 50,
        createdAt: Date.now()
      };
      storage.set(pendingJob.id, pendingJob);

      const app = createApp({ storage, skipVite: true });
      const res = await request(app).post('/api/jobs/pending-job/archive');
      expect(res.status).toBe(400);
    });

    it('simulates retranscription for sample job with verbatim and custom prompts', async () => {
      const app = createApp({ storage, skipVite: true });
      
      const resVerbatim = await request(app)
        .post('/api/jobs/sample-sarah/retranscribe')
        .send({ promptStyle: 'verbatim' });
      expect(resVerbatim.status).toBe(200);

      const resCustom = await request(app)
        .post('/api/jobs/sample-sarah/retranscribe')
        .send({ promptStyle: 'custom', customPrompt: 'Focus on technical keywords' });
      expect(resCustom.status).toBe(200);

      const customJob = storage.get(resCustom.body.jobId);
      expect(customJob?.transcript).toContain('Focus on technical keywords');
    });

    it('returns 400 when retranscribing a non-sample job whose audio file is missing', async () => {
      const lostJob: TranscribeJob = {
        id: 'real-lost-job',
        filename: 'lost.mp3',
        fileSize: 100,
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        localFilePath: '/path/does/not/exist.audio',
        transcript: 'some text'
      };
      storage.set(lostJob.id, lostJob);

      const app = createApp({ storage, skipVite: true });
      const res = await request(app)
        .post('/api/jobs/real-lost-job/retranscribe')
        .send({ promptStyle: 'clean' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('audio file for this job is no longer available');
    });
  });

  describe('Downstream Analysis Generation', () => {
    it('generates summary, key takeaways, chapters, and social media analysis using gemini-3.8-flash', async () => {
      const mockGenerateContent = vi.fn().mockImplementation(async ({ model, contents }) => {
        return { text: `Generated analysis from model ${model} for query: ${JSON.stringify(contents)}` };
      });
      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const app = createApp({ storage, aiClient: mockAiClient, skipVite: true });

      for (const mode of ['summary', 'key_takeaways', 'chapters', 'social_media'] as const) {
        const res = await request(app)
          .post('/api/jobs/sample-sarah/analyze')
          .send({ mode });

        expect(res.status).toBe(200);
        expect(res.body.result).toContain('Generated analysis');
        expect(res.body.result).toContain('gemini-3.8-flash');
      }

      // Check that the first call used gemini-3.8-flash
      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.8-flash');

      const updatedJob = storage.get('sample-sarah');
      expect(updatedJob?.summary).toBeDefined();
      expect(updatedJob?.key_takeaways).toBeDefined();
      expect(updatedJob?.chapters).toBeDefined();
      expect(updatedJob?.social_media).toBeDefined();
    });

    it('rejects invalid analysis mode with 400', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app)
        .post('/api/jobs/sample-sarah/analyze')
        .send({ mode: 'invalid_mode_name' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid analysis mode');
    });

    it('successfully falls over to secondary analysis models (gemini-3.5-flash) during 503 high demand', async () => {
      const mockGenerateContent = vi.fn().mockImplementation(async ({ model }) => {
        if (model === 'gemini-3.8-flash' || model === 'gemini-3.7-flash' || model === 'gemini-3.6-flash') {
          throw new Error('503 Service Unavailable: This model is currently experiencing high demand.');
        }
        return { text: `Generated summary from fallback model ${model}` };
      });
      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const app = createApp({ storage, aiClient: mockAiClient, skipVite: true });

      const res = await request(app)
        .post('/api/jobs/sample-sarah/analyze')
        .send({ mode: 'summary' });

      expect(res.status).toBe(200);
      expect(res.body.result).toContain('Generated summary from fallback model gemini-3.5-flash');
      expect(res.body.modelUsed).toBe('gemini-3.5-flash');
      expect(res.body.job).toBeDefined();

      const updatedJob = storage.get('sample-sarah');
      expect(updatedJob?.summary).toContain('gemini-3.5-flash');
    });
  });

  describe('Transcription Upload Input Validation', () => {
    it('returns 500 if GEMINI_API_KEY is not configured', async () => {
      const app = createApp({ storage, env: {} as any, skipVite: true });
      const res = await request(app).post('/api/transcribe');
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('GEMINI_API_KEY is not configured');
    });

    it('returns 400 if no audio file is uploaded when API key is present', async () => {
      const app = createApp({
        storage,
        env: { GEMINI_API_KEY: 'test-api-key' } as any,
        skipVite: true
      });
      const res = await request(app).post('/api/transcribe');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Please upload an audio file');
    });

    it('rejects uploads exceeding MAX_UPLOAD_SIZE_MB with 413 Payload Too Large', async () => {
      // Configure app with 1MB max limit for testing
      const app = createApp({
        storage,
        env: {
          GEMINI_API_KEY: 'test-api-key',
          MAX_UPLOAD_SIZE_MB: '1'
        } as any,
        skipVite: true
      });

      // Create a 1.5MB buffer
      const largeBuffer = Buffer.alloc(1.5 * 1024 * 1024, 'a');

      const res = await request(app)
        .post('/api/transcribe')
        .attach('file', largeBuffer, 'huge_recording.mp3');

      expect(res.status).toBe(413);
      expect(res.body.error).toContain('exceeds maximum allowed upload size of 1MB');
      expect(res.body.code).toBe('LIMIT_FILE_SIZE');
    });
  });

  describe('Transcript Editing & Speaker Renaming (v1.5.0)', () => {
    it('updates transcript via PATCH /api/jobs/:id/transcript and resets dependent insights', async () => {
      const app = createApp({ storage, skipVite: true });

      const res = await request(app)
        .patch('/api/jobs/sample-sarah/transcript')
        .send({ transcript: '# Updated Sarah Drabner Interview\n\n[00:00] **Sarah Drabner**: Hello world edited.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.job.transcript).toContain('Hello world edited.');

      const saved = storage.get('sample-sarah');
      expect(saved?.transcript).toContain('Hello world edited.');
      expect(saved?.summary).toBeUndefined(); // reset
    });

    it('returns 400 when updating transcript with invalid or empty payload', async () => {
      const app = createApp({ storage, skipVite: true });

      const res = await request(app)
        .patch('/api/jobs/sample-sarah/transcript')
        .send({ transcript: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Transcript content is required');
    });

    it('renames speaker across transcript via POST /api/jobs/:id/rename-speaker', async () => {
      const app = createApp({ storage, skipVite: true });

      const res = await request(app)
        .post('/api/jobs/sample-sarah/rename-speaker')
        .send({ oldName: 'Sarah Drabner', newName: 'Dr. Sarah Drabner' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.job.transcript).toContain('Dr. Sarah Drabner');
      expect(res.body.job.transcript).not.toContain('**Sarah Drabner**:');

      const saved = storage.get('sample-sarah');
      expect(saved?.transcript).toContain('Dr. Sarah Drabner');
    });

    it('returns 400 when oldName or newName is missing on rename-speaker', async () => {
      const app = createApp({ storage, skipVite: true });

      const res = await request(app)
        .post('/api/jobs/sample-sarah/rename-speaker')
        .send({ oldName: 'Sarah Drabner' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Both oldName and newName are required');
    });
  });

  describe('RSS Feed Preview & Remote Ingestion (v1.5.0)', () => {
    it('returns 400 when feedUrl is missing on POST /api/rss/preview', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app).post('/api/rss/preview').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Please provide a valid podcast RSS feed URL');
    });

    it('returns 400 when url is missing on /api/transcribe-remote', async () => {
      const app = createApp({
        storage,
        env: { GEMINI_API_KEY: 'test-api-key' } as any,
        skipVite: true
      });
      const res = await request(app).post('/api/transcribe-remote').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Please provide a valid audio or episode URL');
    });

    it('accepts audioUrl or url with custom episodeTitle and glossary', async () => {
      const app = createApp({
        storage,
        env: { GEMINI_API_KEY: 'test-api-key' } as any,
        skipVite: true
      });
      const res = await request(app).post('/api/transcribe-remote').send({
        audioUrl: 'https://example.com/podcast/HS134.mp3',
        episodeTitle: 'HS134: Dodging the AI Iceberg: Midcourse Corrections',
        glossary: 'Johna Till Johnson, John Burke, Nemertes'
      });
      expect(res.status).toBe(200);
      expect(res.body.jobId).toBeDefined();

      const created = storage.get(res.body.jobId);
      expect(created?.filename).toBe('HS134: Dodging the AI Iceberg: Midcourse Corrections');
      expect(created?.glossary).toBe('Johna Till Johnson, John Burke, Nemertes');
      expect(created?.sourceUrl).toBe('https://example.com/podcast/HS134.mp3');
    });

    it('returns 500 on /api/transcribe-remote if GEMINI_API_KEY is missing', async () => {
      const app = createApp({ storage, env: {} as any, skipVite: true });
      const res = await request(app)
        .post('/api/transcribe-remote')
        .send({ url: 'https://example.com/audio.mp3' });
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('GEMINI_API_KEY is not configured');
    });
  });
});
