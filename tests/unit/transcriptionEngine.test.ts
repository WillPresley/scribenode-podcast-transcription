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
  extractResponseText,
  categorizeModelError,
  formatFallbackReason,
  formatAllModelsFailedMessage,
  AudioTranscriptionConfigMode,
  mapPromptStyleToTranscriptionMode,
  buildAudioTranscriptionConfig,
  formatSecondsToTimestamp,
  parseOffsetToSeconds,
  splitIntoParagraphs,
  inferSpeakerNamesFromTranscript,
  formatTurnsToMarkdown,
  buildStructuringPrompt,
  cleanFallbackTranscript,
  refineTranscriptWithLLM
} from '../../server/transcriptionEngine';

describe('Transcription Engine & AI Fallback Mechanics', () => {
  describe('Model Definitions & Duration Thresholds', () => {
    it('defines primary transcription model as gemini-3.8-flash', () => {
      expect(PRIMARY_TRANSCRIPTION_MODEL).toBe('gemini-3.8-flash');
      expect(DEFAULT_TRANSCRIPTION_MODELS[0]).toBe('gemini-3.8-flash');
      expect(DEFAULT_TRANSCRIPTION_MODELS[1]).toBe('gemini-3.7-flash');
      expect(DEFAULT_TRANSCRIPTION_MODELS).toContain('gemini-2.5-flash');
      expect(DEFAULT_TRANSCRIPTION_MODELS).toContain('gemini-flash-lite-latest');
    });

    it('defines primary downstream analysis model as gemini-3.8-flash', () => {
      expect(PRIMARY_DOWNSTREAM_MODEL).toBe('gemini-3.8-flash');
      expect(DEFAULT_ANALYSIS_MODELS[0]).toBe('gemini-3.8-flash');
      expect(DEFAULT_ANALYSIS_MODELS[1]).toBe('gemini-3.7-flash');
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
    it('returns gemini-3.8-flash as primary across transcription workloads', () => {
      const models59m = getTranscriptionModelsForJob('59:00');
      expect(models59m[0]).toBe('gemini-3.8-flash');
      expect(models59m[1]).toBe('gemini-3.7-flash');
      expect(models59m[2]).toBe('gemini-3.6-flash');

      const models30m = getTranscriptionModelsForJob('30:00');
      expect(models30m[0]).toBe('gemini-3.8-flash');
    });

    it('returns gemini-3.8-flash as primary when audio duration is unknown or undefined', () => {
      const modelsUndefined = getTranscriptionModelsForJob(undefined);
      expect(modelsUndefined[0]).toBe('gemini-3.8-flash');

      const modelsPlaceholder = getTranscriptionModelsForJob('--:--');
      expect(modelsPlaceholder[0]).toBe('gemini-3.8-flash');
    });

    it('maintains robust cascade across all audio durations', () => {
      const models59m1s = getTranscriptionModelsForJob('59:01');
      expect(models59m1s[0]).toBe('gemini-3.8-flash');

      const models1h = getTranscriptionModelsForJob('01:00:00');
      expect(models1h[0]).toBe('gemini-3.8-flash');

      const modelsNumeric = getTranscriptionModelsForJob(3600);
      expect(modelsNumeric[0]).toBe('gemini-3.8-flash');
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
      expect(prompt).toContain('timestamped speaker turns');
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
      expect(secondCallArgs.contents[1].text).toContain('timestamped speaker turns');
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

    it('strictly isolates transcribe parameters on fileUri audio transcription with fallback', async () => {
      const mockGenerateContent = vi.fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockImplementationOnce(async ({ model, contents, config }) => {
          return { text: `OK from ${model}`, configReceived: config, contentsReceived: contents };
        });

      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/test-audio',
        mimeType: 'audio/mp3',
        promptStyle: 'clean',
        config: {
          audioTranscriptionConfig: { mode: AudioTranscriptionConfigMode.SMART },
          audioTimestamp: true,
          temperature: 0.2
        },
        modelsToTry: ['gemini-3.5-transcribe', 'gemini-3.7-flash'],
        maxRetries: 0,
        initialDelayMs: 1
      });

      expect(result.model).toBe('gemini-3.7-flash');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      // Call 1: gemini-3.5-transcribe (primary)
      const call1Args = mockGenerateContent.mock.calls[0][0];
      expect(call1Args.model).toBe('gemini-3.5-transcribe');
      expect(call1Args.config?.systemInstruction).toBeUndefined();

      // Call 2: gemini-3.7-flash (fallback)
      const call2Args = mockGenerateContent.mock.calls[1][0];
      expect(call2Args.model).toBe('gemini-3.7-flash');
      // Transcribe-only configurations must be strictly stripped for non-transcribe models
      expect(call2Args.config?.audioTranscriptionConfig).toBeUndefined();
      expect(call2Args.config?.audioTimestamp).toBeUndefined();
      // Developer systemInstruction must be present
      expect(call2Args.config?.systemInstruction).toBeDefined();
      expect(call2Args.config?.temperature).toBe(0.2);
    });

    it('automatically fails over to next model when primary model returns an empty or whitespace response', async () => {
      const transitions: any[] = [];
      const mockGenerateContent = vi.fn()
        .mockResolvedValueOnce({ text: "   " }) // empty/whitespace response from 3.5-transcribe
        .mockResolvedValueOnce({ text: "# The Complete Podcast Transcript\n\n**Hosts:** *Mark*\n\n---" }); // fallback succeeds

      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'User audio prompt' }],
        modelsToTry: ['gemini-3.5-transcribe', 'gemini-3.7-flash'],
        maxRetries: 0,
        initialDelayMs: 1,
        onFallbackTransition: (from, to, reason, friendlyReason) => {
          transitions.push({ from, to, reason, friendlyReason });
        }
      });

      expect(result.model).toBe('gemini-3.7-flash');
      expect(result.text).toContain('# The Complete Podcast Transcript');
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(transitions.length).toBe(1);
      expect(transitions[0].from).toBe('gemini-3.5-transcribe');
      expect(transitions[0].to).toBe('gemini-3.7-flash');
      expect(transitions[0].reason).toContain('returned empty or blank text response');
      expect(transitions[0].friendlyReason).toContain('Empty response from Gemini 3.5 Transcribe');
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

    it('aborts stalled model requests and fails over when timeoutMs is exceeded', async () => {
      const mockGenerateContent = vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ text: 'slow' }), 200)))
        .mockResolvedValueOnce({ text: 'Fast fallback output' });

      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'test' }],
        modelsToTry: ['gemini-3.7-flash', 'gemini-3.6-flash'],
        maxRetries: 0,
        timeoutMs: 50,
        initialDelayMs: 1
      });

      expect(result.model).toBe('gemini-3.6-flash');
      expect(result.response.text).toBe('Fast fallback output');
    });

    it('performs fast failover to subsequent models when high demand 503 error occurs without explicit retries', async () => {
      const mockGenerateContent = vi.fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable: This model is currently experiencing high demand.'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable: This model is currently experiencing high demand.'))
        .mockResolvedValueOnce({ text: 'Secondary model success' });

      const mockAiClient: any = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await generateContentWithFallback({
        aiClient: mockAiClient,
        contents: [{ text: 'test' }],
        modelsToTry: ['gemini-3.7-flash', 'gemini-3.6-flash'],
        initialDelayMs: 5
      });

      expect(result.model).toBe('gemini-3.6-flash');
      expect(result.response.text).toBe('Secondary model success');
      // gemini-3.7-flash failed twice (attempt 0, attempt 1 fast retry), then immediately failed over to gemini-3.6-flash
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
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

    it('categorizes empty or blank response errors', () => {
      const result = categorizeModelError('Model gemini-3.5-transcribe returned empty or blank text response');
      expect(result.category).toBe('empty_response');
      expect(result.friendlyMessage).toBe('Model returned empty response, automated failover active');
      expect(result.shortBadge).toBe('Empty response');
    });

    it('formats clean fallback reasons based on model error category', () => {
      const highDemandReason = formatFallbackReason('gemini-3.5-transcribe', 'gemini-3.7-flash', '503 Service Unavailable');
      expect(highDemandReason).toContain('Model demand too high on Gemini 3.5 Transcribe');
      expect(highDemandReason).toContain('automated failover to Gemini 3.7 Flash active');

      const configReason = formatFallbackReason('gemini-3.5-transcribe', 'gemini-3.7-flash', '400 Developer instruction is not enabled');
      expect(configReason).toContain('Configuration issue on Gemini 3.5 Transcribe');

      const emptyReason = formatFallbackReason('gemini-3.5-transcribe', 'gemini-3.7-flash', 'Model returned empty response');
      expect(emptyReason).toBe('Empty response from Gemini 3.5 Transcribe – automated failover to Gemini 3.7 Flash active.');
    });

    it('formats clean summary when all models fail', () => {
      const failureMsg = formatAllModelsFailedMessage(new Error('503 High Demand'));
      expect(failureMsg).toContain('All AI transcription models are currently experiencing high demand');
      expect(failureMsg).toContain('try your transcription again later');
    });
  });

  describe('AudioTranscriptionConfigMode & Configuration Helpers (GenAI 2.19.0)', () => {
    it('exports AudioTranscriptionConfigMode enum values correctly', () => {
      expect(AudioTranscriptionConfigMode.VERBATIM).toBe('VERBATIM');
      expect(AudioTranscriptionConfigMode.SMART).toBe('SMART');
      expect(AudioTranscriptionConfigMode.MODE_UNSPECIFIED).toBe('MODE_UNSPECIFIED');
    });

    it('maps prompt styles to correct AudioTranscriptionConfigMode', () => {
      expect(mapPromptStyleToTranscriptionMode('verbatim')).toBe(AudioTranscriptionConfigMode.VERBATIM);
      expect(mapPromptStyleToTranscriptionMode('clean')).toBe(AudioTranscriptionConfigMode.SMART);
      expect(mapPromptStyleToTranscriptionMode('combined')).toBe(AudioTranscriptionConfigMode.SMART);
      expect(mapPromptStyleToTranscriptionMode('timestamped')).toBe(AudioTranscriptionConfigMode.SMART);
      expect(mapPromptStyleToTranscriptionMode('custom')).toBe(AudioTranscriptionConfigMode.SMART);
      expect(mapPromptStyleToTranscriptionMode(undefined)).toBe(AudioTranscriptionConfigMode.SMART);
    });

    it('builds structured AudioTranscriptionConfig with mode and options', () => {
      const config = buildAudioTranscriptionConfig({
        promptStyle: 'verbatim',
        languageCodes: ['en-US', 'es-ES'],
        customVocabulary: ['ScribeNode', 'Kubernetes'],
        diarization: true,
        wordTimestamp: true
      });

      expect(config.mode).toBe(AudioTranscriptionConfigMode.VERBATIM);
      expect(config.languageCodes).toEqual(['en-US', 'es-ES']);
      expect(config.customVocabulary).toEqual(['ScribeNode', 'Kubernetes']);
      expect(config.diarization).toBe(true);
      expect(config.wordTimestamp).toBe(true);
    });

    it('builds minimal AudioTranscriptionConfig when options omitted', () => {
      const emptyConfig = buildAudioTranscriptionConfig();
      expect(emptyConfig).toEqual({});

      const smartConfig = buildAudioTranscriptionConfig({ promptStyle: 'clean' });
      expect(smartConfig.mode).toBe(AudioTranscriptionConfigMode.SMART);
      expect(smartConfig.languageCodes).toBeUndefined();
    });
  });

  describe('Audio Transcription Formatting & Helper Utilities', () => {
    it('formats seconds to timestamp strings accurately', () => {
      expect(formatSecondsToTimestamp(0)).toBe('[00:00]');
      expect(formatSecondsToTimestamp(5)).toBe('[00:05]');
      expect(formatSecondsToTimestamp(65)).toBe('[01:05]');
      expect(formatSecondsToTimestamp(3665)).toBe('[01:01:05]');
    });

    it('parses offset strings or numbers to seconds accurately', () => {
      expect(parseOffsetToSeconds('0s')).toBe(0);
      expect(parseOffsetToSeconds('5.2s')).toBe(5.2);
      expect(parseOffsetToSeconds('125.400s')).toBe(125.4);
      expect(parseOffsetToSeconds(45)).toBe(45);
      expect(parseOffsetToSeconds(undefined)).toBe(0);
    });

    it('splits monolithic text into clean paragraphs at sentence boundaries', () => {
      const wallOfText = "First sentence here. Second sentence follows. Third sentence wraps up. Fourth sentence begins new thought. Fifth sentence continues. Sixth sentence finishes.";
      const paras = splitIntoParagraphs(wallOfText, 3);
      expect(paras.length).toBe(2);
      expect(paras[0]).toContain("First sentence here.");
      expect(paras[1]).toContain("Fourth sentence begins");
    });

    it('infers human speaker names from conversational introductions', () => {
      const turns = [
        {
          speakerId: 'spk_0',
          text: "Hello, I'm Johna Till Johnson, CEO of Nemertes, and I'm here with my co-host John Burke."
        },
        {
          speakerId: 'spk_1',
          text: "John Burke, CTO of Nemertes. Thanks Johna."
        }
      ];
      const names = inferSpeakerNamesFromTranscript(turns);
      expect(names.get('spk_0')).toBe('Johna Till Johnson');
      expect(names.get('spk_1')).toBe('John Burke');
    });

    it('formats turns to combined Markdown structure with timestamps and speaker tags', () => {
      const turns = [
        {
          speakerId: 'spk_0',
          speakerName: 'Johna Till Johnson',
          startTimeSeconds: 0,
          text: "Welcome to Heavy Strategy."
        },
        {
          speakerId: 'spk_1',
          speakerName: 'John Burke',
          startTimeSeconds: 6,
          text: "Great to be here."
        }
      ];
      const markdown = formatTurnsToMarkdown(turns, 'combined', 'Heavy Strategy Ep 240');
      expect(markdown).toContain('# Heavy Strategy Ep 240');
      expect(markdown).toContain('**Hosts:** *Johna Till Johnson, John Burke*');
      expect(markdown).toContain('[00:00] **Johna Till Johnson**: Welcome to Heavy Strategy.');
      expect(markdown).toContain('[00:06] **John Burke**: Great to be here.');
    });
  });

  describe('extractResponseText utility', () => {
    it('extracts direct text property', () => {
      expect(extractResponseText({ text: 'Valid transcript text' })).toBe('Valid transcript text');
    });

    it('extracts from candidates and content parts', () => {
      const resp = {
        candidates: [
          {
            content: {
              parts: [
                { text: '# Episode Title\n\n' },
                { text: '**Hosts:** *Mark*\n\n---' }
              ]
            }
          }
        ]
      };
      expect(extractResponseText(resp)).toBe('# Episode Title\n\n**Hosts:** *Mark*\n\n---');
    });

    it('handles string primitives', () => {
      expect(extractResponseText('Plain transcript string')).toBe('Plain transcript string');
    });

    it('extracts text from audioTranscription parts returned by gemini-3.5-transcribe', () => {
      const respWithAudioTranscription = {
        candidates: [
          {
            content: {
              parts: [
                {
                  audioTranscription: {
                    text: '# Podcast Title\n\n**Hosts:** *Sarah, John*\n\n---\n\n[00:00] **Sarah**: Welcome back everyone.',
                    speakerLabel: 'Sarah'
                  }
                }
              ]
            }
          }
        ]
      };
      expect(extractResponseText(respWithAudioTranscription)).toBe('# Podcast Title\n\n**Hosts:** *Sarah, John*\n\n---\n\n[00:00] **Sarah**: Welcome back everyone.');
    });

    it('extracts and joins multiple audioTranscription segments', () => {
      const respWithMultipleParts = {
        candidates: [
          {
            content: {
              parts: [
                {
                  audioTranscription: {
                    text: '[00:00] **Host**: Welcome to today\'s episode.'
                  }
                },
                {
                  audioTranscription: {
                    text: '[01:15] **Guest**: Thanks for having me here today.'
                  }
                }
              ]
            }
          }
        ]
      };
      const result = extractResponseText(respWithMultipleParts);
      expect(result).toContain('[00:00] **Host**: Welcome to today\'s episode.');
      expect(result).toContain('[01:15] **Guest**: Thanks for having me here today.');
    });

    it('extracts text from word-level audioTranscription parts if text field is missing', () => {
      const respWithWords = {
        candidates: [
          {
            content: {
              parts: [
                {
                  audioTranscription: {
                    words: [
                      { word: 'Hello', startOffset: '0s', endOffset: '0.5s' },
                      { word: 'world', startOffset: '0.6s', endOffset: '1.0s' }
                    ]
                  }
                }
              ]
            }
          }
        ]
      };
      expect(extractResponseText(respWithWords)).toBe('Hello world');
    });

    it('ignores thought parts during transcription text extraction', () => {
      const respWithThought = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Internal chain of thought reasoning...', thought: true },
                { text: '# Episode Transcript\n\nFinal spoken content.' }
              ]
            }
          }
        ]
      };
      expect(extractResponseText(respWithThought)).toBe('# Episode Transcript\n\nFinal spoken content.');
    });

    it('returns empty string for null, undefined, empty candidates or empty text', () => {
      expect(extractResponseText(null)).toBe('');
      expect(extractResponseText(undefined)).toBe('');
      expect(extractResponseText({ text: '   ' })).toBe('');
      expect(extractResponseText({ candidates: [] })).toBe('');
      expect(extractResponseText({ candidates: [{ content: { parts: [{ text: '' }] } }] })).toBe('');
    });
  });

  describe('Post-Processing Structuring & Refinement Utilities', () => {
    it('builds comprehensive structuring prompt for downstream LLM pass', () => {
      const prompt = buildStructuringPrompt(
        "Hello I'm Johna Till Johnson and here with John Burke.",
        'combined',
        'Heavy Strategy Ep 134',
        'Preserve all tech acronyms.'
      );
      expect(prompt).toContain('TASK: STRUCTURE, DIARIZE, AND REFINE AUDIO TRANSCRIPTION');
      expect(prompt).toContain('Heavy Strategy Ep 134');
      expect(prompt).toContain('Preserve all tech acronyms.');
      expect(prompt).toContain('RAW TRANSCRIPT:');
      expect(prompt).toContain("Hello I'm Johna Till Johnson");
    });

    it('cleans fallback transcript and infers host names without fabricating fake speaker lists', () => {
      const rawText = "Hello, I'm Johna Till Johnson, CEO of Nemertes, and with my co-host John Burke. Today we're talking about AI strategy. Uh, it's very important to consider.";
      const cleaned = cleanFallbackTranscript(rawText, 'combined', 'AI Strategy Episode');
      expect(cleaned).toContain('# AI Strategy Episode');
      expect(cleaned).toContain('**Hosts:** *Johna Till Johnson, John Burke*');
      expect(cleaned).toContain('---');
      expect(cleaned).toContain("Today we're talking about AI strategy.");
      expect(cleaned).not.toContain('Speaker 62');
    });

    it('returns already-structured markdown immediately without re-calling LLM', async () => {
      const structured = '# Strategy Mid-Course Corrections\n**Hosts:** *Johna Till Johnson, John Burke*\n\n---\n\n[00:00] **Johna Till Johnson**: Hello.';
      const mockClient: any = {
        models: {
          generateContent: vi.fn()
        }
      };
      const result = await refineTranscriptWithLLM({
        aiClient: mockClient,
        rawTranscript: structured,
        promptStyle: 'combined'
      });
      expect(result).toBe(structured);
      expect(mockClient.models.generateContent).not.toHaveBeenCalled();
    });

    it('refines raw transcript via downstream LLM model', async () => {
      const raw = "Hello I'm Johna and John is here.";
      const formattedOutput = "# Episode 1\n**Hosts:** *Johna, John*\n\n---\n\n[00:00] **Johna**: Hello.\n\n[00:05] **John**: Hi.";
      const mockClient: any = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: formattedOutput
          })
        }
      };
      const result = await refineTranscriptWithLLM({
        aiClient: mockClient,
        rawTranscript: raw,
        promptStyle: 'combined',
        modelsToTry: ['gemini-3.7-flash']
      });
      expect(result).toBe(formattedOutput);
      expect(mockClient.models.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.7-flash'
        })
      );
    });
  });
});
