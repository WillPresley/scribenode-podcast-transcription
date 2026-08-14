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
      expect(res.body.modelStatus).toBeDefined();
      expect(res.body.modelStatus.primaryModel).toBe('gemini-3.7-flash');
      expect(res.body.modelStatus.activeModel).toBe('gemini-3.7-flash');
    });

    it('returns active model orchestration status on /api/model-status', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app).get('/api/model-status');
      expect(res.status).toBe(200);
      expect(res.body.primaryModel).toBe('gemini-3.7-flash');
      expect(res.body.activeModel).toBe('gemini-3.7-flash');
      expect(res.body.status).toBe('optimal');
      expect(res.body.fallbackModels).toContain('gemini-3.7-flash');
      expect(res.body.fallbackModels).toContain('gemini-3.6-flash');
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
    it('generates summary, key takeaways, chapters, and social media analysis', async () => {
      const mockGenerateContent = vi.fn().mockImplementation(async ({ contents }) => {
        return { text: `Generated analysis for query: ${JSON.stringify(contents)}` };
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
      }

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
      expect(res.body.error).toContain('Please upload a valid audio file');
    });

    it('returns a JSON 404 for unmatched /api routes rather than falling through to HTML', async () => {
      const app = createApp({ storage, skipVite: true });
      const res = await request(app).get('/api/non-existent-route-endpoint');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.error).toContain('API route not found');
    });
  });
});
