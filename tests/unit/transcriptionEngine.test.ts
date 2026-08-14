import { describe, it, expect, vi } from 'vitest';
import {
  BASE_TRANSCRIPTION_STANDARDS,
  DEFAULT_TRANSCRIPTION_MODELS,
  getSystemInstruction,
  buildTranscriptionPrompt,
  generateContentWithFallback
} from '../../server/transcriptionEngine';

describe('Transcription Engine & AI Fallback Mechanics', () => {
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
        modelsToTry: ['gemini-3.6-flash', 'gemini-3.5-flash'],
        onModelSelected: (m) => selectedModels.push(m),
        initialDelayMs: 5
      });

      expect(result.model).toBe('gemini-3.6-flash');
      expect(result.response.text).toBe('Generated transcript output');
      expect(selectedModels).toContain('gemini-3.6-flash');
    });

    it('falls back to secondary model when primary returns 503 or transient error', async () => {
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
        modelsToTry: ['gemini-3.6-flash', 'gemini-3.5-flash'],
        maxRetries: 3,
        initialDelayMs: 1
      });

      expect(result.model).toBe('gemini-3.5-flash');
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
        modelsToTry: ['gemini-3.7-flash', 'gemini-3.6-flash'],
        maxRetries: 0,
        initialDelayMs: 1,
        onFallbackTransition: (from, to, reason) => {
          transitions.push({ from, to, reason });
        }
      });

      expect(result.model).toBe('gemini-3.6-flash');
      expect(transitions.length).toBe(1);
      expect(transitions[0].from).toBe('gemini-3.7-flash');
      expect(transitions[0].to).toBe('gemini-3.6-flash');
      expect(transitions[0].reason).toContain('429 Rate Limit Exceeded');
    });

    it('defines prioritized model list starting with gemini-3.7-flash', () => {
      expect(DEFAULT_TRANSCRIPTION_MODELS[0]).toBe('gemini-3.7-flash');
      expect(DEFAULT_TRANSCRIPTION_MODELS).toContain('gemini-3.6-flash');
      expect(DEFAULT_TRANSCRIPTION_MODELS).toContain('gemini-3.5-flash');
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
        modelsToTry: ['gemini-3.6-flash'],
        maxRetries: 1,
        initialDelayMs: 1
      })).rejects.toThrow('Fatal API Quota Error');
    });
  });
});
