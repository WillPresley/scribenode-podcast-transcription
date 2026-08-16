import { describe, it, expect } from 'vitest';
import {
  inferPodcastTitle,
  inferSpeakers,
  stripExistingHeader,
  cleanMarkdownHeaders,
  stripMarkdown,
  boldSpeakerNamesInMarkdown,
  formatExportContent,
  getPreviewLines,
  parseTranscriptToCues,
  formatSecondsToTimecode,
  convertTranscriptToVtt,
  convertTranscriptToSrt,
  formatModelDisplayName,
  parseTimestampSeconds,
  formatPlaybackTime,
  parseTranscriptSegments,
  findActiveSegmentIndex
} from '../../src/utils/transcript';
import {
  SAMPLE_INTERVIEW_TRANSCRIPT,
  SAMPLE_SOLO_TRANSCRIPT,
  SAMPLE_MESSY_TRANSCRIPT
} from '../fixtures/sampleTranscripts';

describe('Transcript Formatting & Parsing Engine', () => {
  describe('inferPodcastTitle', () => {
    it('extracts clean title from Markdown H1 header', () => {
      const title = inferPodcastTitle('random_file.mp3', SAMPLE_INTERVIEW_TRANSCRIPT);
      expect(title).toBe('The Future of Generative Audio Architecture');
    });

    it('cleans filename when no Markdown H1 is present', () => {
      const title = inferPodcastTitle('Engineering_Leadership_Sync_v2_final.mp3', 'Some raw transcript content without header');
      expect(title).toBe('Engineering Leadership');
    });

    it('falls back to default title for empty inputs', () => {
      const title = inferPodcastTitle('', '');
      expect(title).toBe('Podcast Transcript');
    });
  });

  describe('inferSpeakers', () => {
    it('extracts speakers from explicit Hosts line', () => {
      const speakers = inferSpeakers(SAMPLE_INTERVIEW_TRANSCRIPT);
      expect(speakers).toEqual(['Sarah Drabner', 'Alex Rivera']);
    });

    it('extracts speakers from solo episode hosts line', () => {
      const speakers = inferSpeakers(SAMPLE_SOLO_TRANSCRIPT);
      expect(speakers).toEqual(['David Calaway']);
    });

    it('extracts speakers from dialogue turn lines when no Hosts line exists', () => {
      const speakers = inferSpeakers(SAMPLE_MESSY_TRANSCRIPT);
      expect(speakers).toContain('SPEAKER A');
      expect(speakers).toContain('SPEAKER B');
    });

    it('filters out non-speaker keywords like "Summary", "Chapter", "Intro"', () => {
      const fakeDialogue = `
[00:00] Summary: This is not a speaker.
[00:10] Speaker One: Hello everyone.
[00:20] Intro: Some intro music.
      `;
      const speakers = inferSpeakers(fakeDialogue);
      expect(speakers).not.toContain('Summary');
      expect(speakers).not.toContain('Intro');
      expect(speakers).toContain('Speaker One');
    });

    it('handles empty input gracefully', () => {
      expect(inferSpeakers('')).toEqual([]);
    });
  });

  describe('stripExistingHeader', () => {
    it('strips H1, Hosts line, and divider rule from transcript', () => {
      const body = stripExistingHeader(SAMPLE_INTERVIEW_TRANSCRIPT);
      expect(body).not.toContain('# The Future of Generative Audio Architecture');
      expect(body).not.toContain('**Hosts:**');
      expect(body).not.toContain('---');
      expect(body).toContain('[00:00] **Alex Rivera**: Welcome to the Architecture Daily podcast.');
    });

    it('returns empty string on empty input', () => {
      expect(stripExistingHeader('')).toBe('');
    });
  });

  describe('cleanMarkdownHeaders', () => {
    it('removes stray bold or italic markers in header lines', () => {
      const dirty = '# **Main Episode Title**\n\nSome paragraph text with **bold** preserved.';
      const cleaned = cleanMarkdownHeaders(dirty);
      expect(cleaned).toBe('# Main Episode Title\n\nSome paragraph text with **bold** preserved.');
    });
  });

  describe('stripMarkdown', () => {
    it('strips headers, bold, italics, code, and horizontal rules into plain text', () => {
      const md = '## Key Takeaways\n\n**Point 1**: Great *discussion* regarding `code`.\n\n---\n\n> Quote here';
      const plain = stripMarkdown(md);
      expect(plain).not.toContain('##');
      expect(plain).not.toContain('**');
      expect(plain).not.toContain('*');
      expect(plain).not.toContain('`');
      expect(plain).not.toContain('---');
      expect(plain).not.toContain('>');
      expect(plain).toContain('Point 1: Great discussion regarding code.');
    });
  });

  describe('boldSpeakerNamesInMarkdown', () => {
    it('formats unbolded speaker names into strict bold markdown syntax', () => {
      const input = '[00:12] John Doe: Here is my opinion.';
      const output = boldSpeakerNamesInMarkdown(input);
      expect(output).toBe('[00:12] **John Doe**: Here is my opinion.');
    });

    it('does not double bold already bolded names', () => {
      const input = '[00:12] **John Doe**: Here is my opinion.';
      const output = boldSpeakerNamesInMarkdown(input);
      expect(output).toBe('[00:12] **John Doe**: Here is my opinion.');
    });
  });

  describe('formatExportContent', () => {
    it('formats full markdown export with single H1, Hosts, divider, and bold speaker turns', () => {
      const formatted = formatExportContent(SAMPLE_INTERVIEW_TRANSCRIPT, 'md', 'audio.mp3', 'transcript');
      expect(formatted.startsWith('# The Future of Generative Audio Architecture')).toBe(true);
      expect(formatted).toContain('**Hosts:** *Sarah Drabner, Alex Rivera*');
      expect(formatted).toContain('---');
      expect(formatted).toContain('[00:00] **Alex Rivera**:');
    });

    it('formats plain text export with clear text header and ASCII divider', () => {
      const formatted = formatExportContent(SAMPLE_INTERVIEW_TRANSCRIPT, 'txt', 'audio.mp3', 'transcript');
      expect(formatted).toContain('The Future of Generative Audio Architecture');
      expect(formatted).toContain('Hosts: Sarah Drabner, Alex Rivera');
      expect(formatted).toContain('========================================');
      expect(formatted).not.toContain('**');
      expect(formatted).not.toContain('#');
    });

    it('formats secondary analysis content (summary, notes) without transcript headers', () => {
      const summaryMd = '### Summary\n- Topic A\n- Topic B';
      const formattedMd = formatExportContent(summaryMd, 'md', 'audio.mp3', 'summary');
      expect(formattedMd).toBe('### Summary\n- Topic A\n- Topic B');

      const formattedTxt = formatExportContent(summaryMd, 'txt', 'audio.mp3', 'summary');
      expect(formattedTxt).toContain('Summary\n- Topic A\n- Topic B');
      expect(formattedTxt).not.toContain('###');
    });
  });

  describe('getPreviewLines', () => {
    it('extracts structured preview paragraphs with speaker labels and color classes', () => {
      const preview = getPreviewLines(SAMPLE_INTERVIEW_TRANSCRIPT);
      expect(preview.length).toBeGreaterThan(0);
      expect(preview[0].isSpeaker).toBe(true);
      expect(preview[0].header).toContain('Alex Rivera');
      expect(preview[0].text).toContain('Welcome to the Architecture Daily podcast.');
    });
  });

  describe('parseTranscriptToCues & Timecode formatting', () => {
    it('parses timestamps into sequential subtitle cues with non-overlapping bounds', () => {
      const cues = parseTranscriptToCues(SAMPLE_INTERVIEW_TRANSCRIPT);
      expect(cues.length).toBe(4);
      expect(cues[0].startSeconds).toBe(0);
      expect(cues[1].startSeconds).toBe(15);
      expect(cues[2].startSeconds).toBe(45);
      expect(cues[3].startSeconds).toBe(70); // 01:10 = 70s
    });

    it('formats timecodes accurately for SRT (comma) and WebVTT (dot)', () => {
      const srtTime = formatSecondsToTimecode(75.5, 'srt');
      expect(srtTime).toBe('00:01:15,500');

      const vttTime = formatSecondsToTimecode(75.5, 'vtt');
      expect(vttTime).toBe('00:01:15.500');
    });

    it('generates standard compliant WebVTT subtitle stream', () => {
      const vtt = convertTranscriptToVtt(SAMPLE_INTERVIEW_TRANSCRIPT, 'Generative Audio');
      expect(vtt.startsWith('WEBVTT - Generative Audio')).toBe(true);
      expect(vtt).toContain('00:00:00.000 -->');
      expect(vtt).toContain('Alex Rivera: Welcome to the Architecture Daily podcast.');
    });

    it('generates standard compliant SubRip (.srt) subtitle stream', () => {
      const srt = convertTranscriptToSrt(SAMPLE_INTERVIEW_TRANSCRIPT);
      expect(srt).toContain('1\n00:00:00,000 -->');
      expect(srt).toContain('2\n00:00:15,000 -->');
    });
  });

  describe('formatModelDisplayName', () => {
    it('formats recognized model IDs into clean human-readable titles', () => {
      expect(formatModelDisplayName('gemini-3.7-flash')).toBe('Gemini 3.7 Flash');
      expect(formatModelDisplayName('gemini-3.6-flash')).toBe('Gemini 3.6 Flash');
      expect(formatModelDisplayName('gemini-3.5-flash')).toBe('Gemini 3.5 Flash');
      expect(formatModelDisplayName('gemini-3.5-flash-lite')).toBe('Gemini 3.5 Flash Lite');
      expect(formatModelDisplayName('gemini-3.1-flash-lite')).toBe('Gemini 3.1 Flash Lite');
      expect(formatModelDisplayName('gemini-flash-latest')).toBe('Gemini Flash Latest');
    });

    it('handles empty or undefined inputs gracefully with fallback', () => {
      expect(formatModelDisplayName(undefined)).toBe('Gemini 3.7 Flash');
      expect(formatModelDisplayName('')).toBe('Gemini 3.7 Flash');
    });

    it('formats custom or unexpected model strings cleanly', () => {
      expect(formatModelDisplayName('custom-audio-model-v1')).toBe('Custom Audio Model V1');
    });
  });

  describe('Audio Playback Synchronization & Segment Utilities', () => {
    describe('parseTimestampSeconds', () => {
      it('parses [MM:SS] format into seconds', () => {
        expect(parseTimestampSeconds('[01:30]')).toBe(90);
        expect(parseTimestampSeconds('02:15')).toBe(135);
        expect(parseTimestampSeconds('[00:00]')).toBe(0);
      });

      it('parses [HH:MM:SS] format into seconds', () => {
        expect(parseTimestampSeconds('[01:02:03]')).toBe(3723);
        expect(parseTimestampSeconds('00:05:30')).toBe(330);
      });

      it('handles empty or malformed timestamp strings gracefully', () => {
        expect(parseTimestampSeconds('')).toBe(0);
        expect(parseTimestampSeconds('invalid')).toBe(0);
      });
    });

    describe('formatPlaybackTime', () => {
      it('formats seconds into MM:SS format', () => {
        expect(formatPlaybackTime(0)).toBe('00:00');
        expect(formatPlaybackTime(75)).toBe('01:15');
        expect(formatPlaybackTime(599)).toBe('09:59');
      });

      it('formats durations over an hour into HH:MM:SS format', () => {
        expect(formatPlaybackTime(3665)).toBe('01:01:05');
      });

      it('handles negative or invalid seconds gracefully', () => {
        expect(formatPlaybackTime(-10)).toBe('00:00');
        expect(formatPlaybackTime(NaN)).toBe('00:00');
      });
    });

    describe('parseTranscriptSegments', () => {
      it('extracts structured segments with start and end timestamps', () => {
        const sample = `
# Sample Header
**Hosts:** *Sarah, Alex*
---

[00:00] **Alex Rivera**: Welcome to the show.
[00:15] **Sarah Drabner**: Thanks for having me Alex.
[00:40] Today we talk about AI architecture.
        `;
        const segments = parseTranscriptSegments(sample);
        expect(segments.length).toBe(3);
        expect(segments[0].timestamp).toBe('[00:00]');
        expect(segments[0].startSeconds).toBe(0);
        expect(segments[0].endSeconds).toBe(15);
        expect(segments[0].speaker).toBe('Alex Rivera');

        expect(segments[1].timestamp).toBe('[00:15]');
        expect(segments[1].startSeconds).toBe(15);
        expect(segments[1].speaker).toBe('Sarah Drabner');

        expect(segments[2].startSeconds).toBe(40);
      });

      it('handles empty input gracefully', () => {
        expect(parseTranscriptSegments('')).toEqual([]);
      });
    });

    describe('findActiveSegmentIndex', () => {
      const segments = [
        { id: '1', index: 0, rawText: '', timestamp: '[00:00]', startSeconds: 0, endSeconds: 15, speaker: '', speechText: '' },
        { id: '2', index: 1, rawText: '', timestamp: '[00:15]', startSeconds: 15, endSeconds: 45, speaker: '', speechText: '' },
        { id: '3', index: 2, rawText: '', timestamp: '[00:45]', startSeconds: 45, endSeconds: 90, speaker: '', speechText: '' },
      ];

      it('returns correct segment index for given current time', () => {
        expect(findActiveSegmentIndex(segments, 5)).toBe(0);
        expect(findActiveSegmentIndex(segments, 20)).toBe(1);
        expect(findActiveSegmentIndex(segments, 45)).toBe(2);
        expect(findActiveSegmentIndex(segments, 80)).toBe(2);
      });

      it('falls back to last segment index if time exceeds total', () => {
        expect(findActiveSegmentIndex(segments, 120)).toBe(2);
      });

      it('returns -1 for empty segment list', () => {
        expect(findActiveSegmentIndex([], 10)).toBe(-1);
      });
    });
  });
});
