import { describe, it, expect, vi } from 'vitest';
import {
  BASE_TRANSCRIPTION_STANDARDS,
  PRIMARY_TRANSCRIPTION_MODEL,
  PRIMARY_DOWNSTREAM_MODEL,
  DEFAULT_TRANSCRIPTION_MODELS,
  DEFAULT_ANALYSIS_MODELS,
  DEFAULT_DOWNSTREAM_MODELS,
  MAX_TRANSCRIBE_MODEL_DURATION_SECONDS,
  parseDurationToSeconds,
  getTranscriptionModelsForJob,
  getSystemInstruction,
  buildTranscriptionPrompt,
  buildTranscribeModelPrompt,
  generateContentWithFallback,
  categorizeModelError,
  formatFallbackReason,
  formatAllModelsFailedMessage
} from '../../server/transcriptionEngine';

describe('Transcription Engine & AI Fallback Mechanics', () => {
  describe('Model Definitions & Duration Thresholds', () => {
    it('defines primary transcription model as gemini-3.5-transcribe', () => {
      expect(PRIMARY_TRANSCRIPTION_MODEL).toBe('gemini-3.5-transcribe');
      expect(DEFAULT_TRANSCRIPTION_MODELS[0]).toBe('gemini-3.5-transcribe');
    });

    it('defines primary downstream analysis model as gemini-3.7-flash', () => {
      expect(PRIMARY_DOWNSTREAM_MODEL).toBe('gemini-3.7-flash');
      expect(DEFAULT_ANALYSIS_MODELS[0]).toBe('gemini-3.7-flash');
      expect(DEFAULT_ANALYSIS_MODELS).not.toContain('gemini-3.5-transcribe');
    });

    it('sets MAX_TRANSCRIBE_MODEL_DURATION_SECONDS to 59 minutes (3540 seconds)', () => {
      expect(MAX_TRANSCRIBE_MODEL_DURATION_SECONDS).toBe(3540);
    });
  });

  describe('parseDurationToSeconds', () => {
    it('parses MM:SS formats correctly', () => {
      expect(parseDurationToSeconds('05:30')).toBe(330);
      expect(parseDurationToSeconds('59:00')).toBe(3540);
      expect(parseDurationToSeconds('59:01')).toBe(3541);
    });

    it('parses HH:MM:SS formats correctly', () => {
      expect(parseDurationToSeconds('01:00:00')).toBe(3600);
      expect(parseDurationToSeconds('01:15:30')).toBe(4530);
      expect(parseDurationToSeconds('[01:15:30]')).toBe(4530);
    });

    it('parses numbers or numeric strings as seconds', () => {
      expect(parseDurationToSeconds(3540)).toBe(3540);
      expect(parseDurationToSeconds('120')).toBe(120);
    });

    it('returns null for empty, undefined, null, or placeholder values', () => {
      expect(parseDurationToSeconds(undefined)).toBeNull();
      expect(parseDurationToSeconds(null)).toBeNull();
      expect(parseDurationToSeconds('--:--')).toBeNull();
      expect(parseDurationToSeconds('')).toBeNull();
      expect(parseDurationToSeconds('unknown')).toBeNull();
    });
  });

  describe('getTranscriptionModelsForJob', () => {
    it('returns gemini-3.5-transcribe as primary when audio duration is <= 59 minutes', () => {
      const models59m = getTranscriptionModelsForJob('59:00');
      expect(models59m[0]).toBe('gemini-3.5-transcribe');
      expect(models59m[1]).toBe('gemini-3.7-flash');

      const models30m = getTranscriptionModelsForJob('30:00');
      expect(models30m[0]).toBe('gemini-3.5-transcribe');
    });

    it('returns gemini-3.5-transcribe as primary when audio duration is unknown or undefined', () => {
      const modelsUndefined = getTranscriptionModelsForJob(undefined);
      expect(modelsUndefined[0]).toBe('gemini-3.5-transcribe');

      const modelsPlaceholder = getTranscriptionModelsForJob('--:--');
      expect(modelsPlaceholder[0]).toBe('gemini-3.5-transcribe');
    });

    it('falls back to gemini-3.7-flash and bypasses gemini-3.5-transcribe when audio > 59 minutes', () => {
      const models59m1s = getTranscriptionModelsForJob('59:01');
      expect(models59m1s[0]).toBe('gemini-3.7-flash');
      expect(models59m1s).not.toContain('gemini-3.5-transcribe');

      const models1h = getTranscriptionModelsForJob('01:00:00');
      expect(models1h[0]).toBe('gemini-3.7-flash');
      expect(models1h).not.toContain('gemini-3.5-transcribe');

      const modelsNumeric = getTranscriptionModelsForJob(3600);
      expect(modelsNumeric[0]).toBe('gemini-3.7-flash');
      expect(modelsNumeric).not.toContain('gemini-3.5-transcribe');
    });
  });

  describe('getSystemInstruction', () => {
    it('returns combined style instructions containing title and speaker rules', () => {
      const instruction = getSystemInstruction('combined');
      expect(instruction).toContain(BASE_TRANSCRIPTION_STANDARDS);
      expect(instruction).toContain('Speaker Identification & Layout (Combined Mode)');
      expect(instruction).toContain('# Title of Recording');
      expect(instruction).toContain('Hosts:');
    });

    it('returns timestamped style instructions', () => {
      const instruction = getSystemInstruction('timestamped');
      expect(instruction).toContain('Timestamps Layout');
      expect(instruction).toContain('[MM:SS]');
    });

    it('returns verbatim style instructions', () => {
      const instruction = getSystemInstruction('verbatim');
      expect(instruction).toContain('Speaker Identification Layout');
    });

    it('defaults to clean style instructions', () => {
      const instruction = getSystemInstruction('clean');
      expect(instruction).toContain('Natural, clean paragraphs following the header.');
    });
  });

  describe('buildTranscribeModelPrompt', () => {
    it('creates structured prompt for combined mode', () => {
      const prompt = buildTranscribeModelPrompt('combined');
      expect(prompt).toContain('# [Title of Recording]');
      expect(prompt).toContain('**Hosts:**');
      expect(prompt).toContain('[00:00] **[Speaker Name]**:');
      expect(prompt).toContain('macro timestamp and bold speaker tag');
    });

    it('creates structured prompt for timestamped mode', () => {
      const prompt = buildTranscribeModelPrompt('timestamped');
      expect(prompt).toContain('# [Title of Recording]');
      expect(prompt).toContain('[00:00] [Spoken paragraph text]');
      expect(prompt).toContain('paragraph timestamps');
    });

    it('creates structured prompt for verbatim mode', () => {
      const prompt = buildTranscribeModelPrompt('verbatim');
      expect(prompt).toContain('# [Title of Recording]');
      expect(prompt).toContain('**[Speaker Name]**: [Spoken paragraph text]');
      expect(prompt).toContain('speaker identification');
    });

    it('creates structured prompt for clean mode', () => {
      const prompt = buildTranscribeModelPrompt('clean');
      expect(prompt).toContain('# [Title of Recording]');
      expect(prompt).toContain('natural, readable paragraphs');
    });

    it('incorporates custom prompt with output format requirements', () => {
      const prompt = buildTranscribeModelPrompt('combined', 'Focus on technical terms');
      expect(prompt).toContain('Focus on technical terms');
      expect(prompt).toContain('Output Format Requirements:');
      expect(prompt).toContain('# Title');
    });
  });

  describe('buildTranscriptionPrompt', () => {
    it('uses custom prompt when provided', () => {
      const prompt = buildTranscriptionPrompt('combined', 'Please transcribe only the QA section.');
      expect(prompt).toBe('Please transcribe only the QA section.');
    });

    it('builds combined mode default prompt', () => {
      const prompt = buildTranscriptionPrompt('combined');
      expect(prompt).toContain('ONE H1 title line');
      expect(prompt).toContain('speaker turns and macro timestamps');
    });

    it('builds timestamped mode default prompt', () => {
      const prompt = buildTranscriptionPrompt('timestamped');
      expect(prompt).toContain('macro timestamps');
    });

    it('builds verbatim mode default prompt', () => {
      const prompt = buildTranscriptionPrompt('verbatim');
      expect(prompt).toContain('clearly identified speaker turns');
    });

    it('builds clean mode default prompt', () => {
      const prompt = buildTranscriptionPrompt('clean');
      expect(prompt).toContain('polished clean verbatim standards');
    });
  });

  describe('generateContentWithFallback', () => {
    it('dynamically adapts prompt and config for transcribe vs general models with fileUri', async () => {
      const mockGenerateContent = vi.fn()
        .mockRejectedValueOnce(new Error('429 Rate Limit'))
        .mockResolvedValueOnce({ text: 'Flash transcript result' });

      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        fileUri: 'https://files.gemini/sample.mp3',
        mimeType: 'audio/mp3',
        promptStyle: 'combined',
        modelsToTry: ['gemini-3.5-transcribe', 'gemini-3.7-flash'],
        maxRetries: 0,
        initialDelayMs: 1
      });

      expect(result.model).toBe('gemini-3.7-flash');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      // Call 1: gemini-3.5-transcribe
      const firstCallArgs = mockGenerateContent.mock.calls[0][0];
      expect(firstCallArgs.model).toBe('gemini-3.5-transcribe');
      expect(firstCallArgs.config?.systemInstruction).toBeUndefined();
      expect(firstCallArgs.contents[1].text).toContain('# [Title of Recording]');

      // Call 2: fallback to gemini-3.7-flash
      const secondCallArgs = mockGenerateContent.mock.calls[1][0];
      expect(secondCallArgs.model).toBe('gemini-3.7-flash');
      expect(secondCallArgs.config?.systemInstruction).toContain(BASE_TRANSCRIPTION_STANDARDS);
      expect(secondCallArgs.contents[1].text).toContain('speaker turns and macro timestamps');
    });

    it('successfully calls first model when available', async () => {
      const mockGenerateContent = vi.fn().mockResolvedValue({
        text: 'Generated transcript output'
      });
      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const selectedModels: string[] = [];
      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'test' }],
        modelsToTry: ['gemini-3.5-transcribe', 'gemini-3.7-flash'],
        onModelSelected: (m) => selectedModels.push(m),
        initialDelayMs: 5
      });

      expect(result.model).toBe('gemini-3.5-transcribe');
      expect(result.response.text).toBe('Generated transcript output');
      expect(selectedModels).toContain('gemini-3.5-transcribe');
    });

    it('falls back from gemini-3.5-transcribe to gemini-3.7-flash when primary errors', async () => {
      const mockGenerateContent = vi.fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce({ text: 'Secondary model transcript' });

      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'test' }],
        modelsToTry: ['gemini-3.5-transcribe', 'gemini-3.7-flash'],
        maxRetries: 3,
        initialDelayMs: 1
      });

      expect(result.model).toBe('gemini-3.7-flash');
      expect(result.response.text).toBe('Secondary model transcript');
    });

    it('triggers onFallbackTransition callback when moving to fallback model', async () => {
      const mockGenerateContent = vi.fn()
        .mockRejectedValueOnce(new Error('429 Rate Limit Exceeded'))
        .mockResolvedValueOnce({ text: 'Fallback output' });

      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const transitions: Array<{ from: string; to: string; reason: string }> = [];
      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'test' }],
        modelsToTry: ['gemini-3.5-transcribe', 'gemini-3.7-flash'],
        maxRetries: 0,
        initialDelayMs: 1,
        onFallbackTransition: (from, to, reason) => {
          transitions.push({ from, to, reason });
        }
      });

      expect(result.model).toBe('gemini-3.7-flash');
      expect(transitions.length).toBe(1);
      expect(transitions[0].from).toBe('gemini-3.5-transcribe');
      expect(transitions[0].to).toBe('gemini-3.7-flash');
      expect(transitions[0].reason).toContain('429 Rate Limit Exceeded');
    });

    it('automatically sanitizes developer systemInstruction for transcribe models', async () => {
      const mockGenerateContent = vi.fn().mockImplementation(async ({ model, contents, config }) => {
        return { text: `OK from ${model}`, configReceived: config, contentsReceived: contents };
      });
      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'User audio prompt' }],
        config: {
          systemInstruction: 'Custom instruction for transcription',
          temperature: 0.2
        },
        modelsToTry: ['gemini-3.5-transcribe']
      });

      expect(result.model).toBe('gemini-3.5-transcribe');
      const callArgs = mockGenerateContent.mock.calls[0][0];
      // systemInstruction must NOT be passed in config to transcribe models
      expect(callArgs.config?.systemInstruction).toBeUndefined();
      expect(callArgs.config?.temperature).toBe(0.2);
      // instruction should be cleanly integrated into contents
      expect(callArgs.contents[0].text).toContain('Custom instruction for transcription');
      expect(callArgs.contents[0].text).toContain('User audio prompt');
    });

    it('retains systemInstruction for non-transcribe models like gemini-3.7-flash', async () => {
      const mockGenerateContent = vi.fn().mockImplementation(async ({ model, contents, config }) => {
        return { text: `OK from ${model}`, configReceived: config, contentsReceived: contents };
      });
      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'User prompt' }],
        config: {
          systemInstruction: 'Developer instruction',
          temperature: 0.2
        },
        modelsToTry: ['gemini-3.7-flash']
      });

      expect(result.model).toBe('gemini-3.7-flash');
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.config?.systemInstruction).toBe('Developer instruction');
    });

    it('throws error when all fallback models fail', async () => {
      const mockGenerateContent = vi.fn().mockRejectedValue(new Error('Fatal API Quota Error'));
      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      await expect(generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'test' }],
        modelsToTry: ['gemini-3.5-transcribe'],
        maxRetries: 1,
        initialDelayMs: 1
      })).rejects.toThrow('Fatal API Quota Error');
    });

    it('triggers onModelError callback with categorized error details', async () => {
      const mockGenerateContent = vi.fn().mockRejectedValue(new Error('503 Service Unavailable: Overloaded'));
      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const recordedErrors: Array<{ model: string; friendlyError: string; badge: string }> = [];
      await expect(generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'test' }],
        modelsToTry: ['gemini-3.5-transcribe'],
        maxRetries: 0,
        initialDelayMs: 1,
        onModelError: (model, rawErr, friendlyError, shortBadge) => {
          recordedErrors.push({ model, friendlyError, badge: shortBadge });
        }
      })).rejects.toThrow();

      expect(recordedErrors.length).toBe(1);
      expect(recordedErrors[0].model).toBe('gemini-3.5-transcribe');
      expect(recordedErrors[0].friendlyError).toBe('Model demand too high, try again later');
      expect(recordedErrors[0].badge).toBe('Demand too high (503)');
    });
  });

  describe('categorizeModelError & User-Friendly Error Formatting', () => {
    it('categorizes 503 and high demand errors with friendly guidance', () => {
      const result = categorizeModelError('503 Service Unavailable: High demand on endpoint');
      expect(result.category).toBe('high_demand');
      expect(result.friendlyMessage).toBe('Model demand too high, try again later');
      expect(result.shortBadge).toBe('Demand too high (503)');
    });

    it('categorizes 429 and rate limit errors with friendly guidance', () => {
      const result = categorizeModelError('429 RESOURCE_EXHAUSTED: Rate limit exceeded');
      expect(result.category).toBe('rate_limit');
      expect(result.friendlyMessage).toBe('Model rate limit or quota reached, try again later');
      expect(result.shortBadge).toBe('Rate limit (429)');
    });

    it('categorizes 400 and configuration/developer instruction errors', () => {
      const result = categorizeModelError('400 INVALID_ARGUMENT: Developer instruction is not enabled for this model');
      expect(result.category).toBe('config_error');
      expect(result.friendlyMessage).toBe('Model not correctly configured for requested parameters');
      expect(result.shortBadge).toBe('Config error (400)');
    });

    it('categorizes auth, invalid api key, and permission errors', () => {
      const result = categorizeModelError('403 PERMISSION_DENIED: generativelanguage.googleapis.com is disabled');
      expect(result.category).toBe('auth_error');
      expect(result.friendlyMessage).toBe('API key invalid or Generative Language API disabled in Google Cloud');
      expect(result.shortBadge).toBe('API key / 403 issue');
    });

    it('formats clean fallback reasons based on model error category', () => {
      const highDemandReason = formatFallbackReason('gemini-3.5-transcribe', 'gemini-3.7-flash', '503 Service Unavailable');
      expect(highDemandReason).toContain('Model demand too high on Gemini 3.5 Transcribe');
      expect(highDemandReason).toContain('automated failover to Gemini 3.7 Flash active');

      const configReason = formatFallbackReason('gemini-3.5-transcribe', 'gemini-3.7-flash', '400 Developer instruction is not enabled');
      expect(configReason).toContain('Configuration issue on Gemini 3.5 Transcribe');
    });

    it('formats clean summary when all models fail', () => {
      const failureMsg = formatAllModelsFailedMessage(new Error('503 High Demand'));
      expect(failureMsg).toContain('All AI transcription models are currently experiencing high demand');
      expect(failureMsg).toContain('try your transcription again later');
    });
  });
});
