import { describe, it, expect } from 'vitest';
import {
  cleanXmlText,
  normalizeDuration,
  estimateDurationFromFileSize,
  resolveEpisodeDuration,
  parseRssFeed
} from '../../server/rss';

describe('RSS Feed Parser and Duration Utilities', () => {
  describe('cleanXmlText', () => {
    it('strips CDATA wrappers and trims whitespace', () => {
      expect(cleanXmlText('<![CDATA[Episode Title]]>')).toBe('Episode Title');
      expect(cleanXmlText('  <![CDATA[  Spaced Out Content  ]]>  ')).toBe('Spaced Out Content');
    });

    it('decodes standard XML/HTML entities', () => {
      expect(cleanXmlText('&amp; &lt; &gt; &quot; &#39; &apos;')).toBe('& < > " \' \'');
      expect(cleanXmlText('Tom &amp; Jerry&#39;s Show')).toBe("Tom & Jerry's Show");
    });

    it('handles empty or blank inputs', () => {
      expect(cleanXmlText('')).toBe('');
      expect(cleanXmlText('   ')).toBe('');
    });
  });

  describe('normalizeDuration', () => {
    it('returns --:-- for null, undefined, empty, or zero strings', () => {
      expect(normalizeDuration(null)).toBe('--:--');
      expect(normalizeDuration(undefined)).toBe('--:--');
      expect(normalizeDuration('')).toBe('--:--');
      expect(normalizeDuration('   ')).toBe('--:--');
      expect(normalizeDuration('0')).toBe('--:--');
      expect(normalizeDuration('00:00')).toBe('--:--');
      expect(normalizeDuration('00:00:00')).toBe('--:--');
      expect(normalizeDuration('--:--')).toBe('--:--');
    });

    it('formats raw integer seconds into MM:SS or H:MM:SS', () => {
      expect(normalizeDuration('45')).toBe('0:45');
      expect(normalizeDuration('90')).toBe('1:30');
      expect(normalizeDuration('599')).toBe('9:59');
      expect(normalizeDuration('2739')).toBe('45:39');
      expect(normalizeDuration('3600')).toBe('1:00:00');
      expect(normalizeDuration('3665')).toBe('1:01:05');
      expect(normalizeDuration('7325')).toBe('2:02:05');
    });

    it('handles decimal seconds gracefully', () => {
      expect(normalizeDuration('2739.4')).toBe('45:39');
      expect(normalizeDuration('90.8')).toBe('1:31');
    });

    it('normalizes standard MM:SS and HH:MM:SS strings', () => {
      expect(normalizeDuration('45:39')).toBe('45:39');
      expect(normalizeDuration('00:45:39')).toBe('45:39');
      expect(normalizeDuration('01:15:20')).toBe('1:15:20');
      expect(normalizeDuration('2:05:12')).toBe('2:05:12');
    });
  });

  describe('estimateDurationFromFileSize', () => {
    it('returns --:-- for missing, zero, or negative byte lengths', () => {
      expect(estimateDurationFromFileSize(undefined)).toBe('--:--');
      expect(estimateDurationFromFileSize(0)).toBe('--:--');
      expect(estimateDurationFromFileSize(-500)).toBe('--:--');
      expect(estimateDurationFromFileSize(NaN)).toBe('--:--');
    });

    it('estimates duration assuming 128 kbps (~16,000 bytes/sec)', () => {
      // 43,827,579 bytes / 16,000 = ~2,739.22 secs = 45m 39s
      expect(estimateDurationFromFileSize(43827579)).toBe('~45:39 (est.)');

      // 16,000 * 60 = 960,000 bytes = 1 minute
      expect(estimateDurationFromFileSize(960000)).toBe('~1:00 (est.)');

      // 16,000 * 3600 = 57,600,000 bytes = 1 hour
      expect(estimateDurationFromFileSize(57600000)).toBe('~1:00:00 (est.)');

      // 120,000,000 bytes = ~7500 secs = 2h 5m 0s
      expect(estimateDurationFromFileSize(120000000)).toBe('~2:05:00 (est.)');
    });
  });

  describe('resolveEpisodeDuration', () => {
    it('prefers explicit valid duration tag over file size estimate', () => {
      expect(resolveEpisodeDuration('2739', 43827579)).toBe('45:39');
      expect(resolveEpisodeDuration('00:45:39', 43827579)).toBe('45:39');
      expect(resolveEpisodeDuration('1:12:00', 43827579)).toBe('1:12:00');
    });

    it('falls back to file size estimate when duration is missing or blank', () => {
      expect(resolveEpisodeDuration(undefined, 43827579)).toBe('~45:39 (est.)');
      expect(resolveEpisodeDuration('', 43827579)).toBe('~45:39 (est.)');
      expect(resolveEpisodeDuration('--:--', 43827579)).toBe('~45:39 (est.)');
      expect(resolveEpisodeDuration('00:00', 43827579)).toBe('~45:39 (est.)');
    });

    it('returns --:-- when both explicit duration and file size are unavailable', () => {
      expect(resolveEpisodeDuration(undefined, undefined)).toBe('--:--');
      expect(resolveEpisodeDuration('', 0)).toBe('--:--');
    });
  });

  describe('parseRssFeed', () => {
    it('throws when xml is empty', () => {
      expect(() => parseRssFeed('')).toThrow('Invalid RSS feed');
    });

    it('parses feed channel info and episodes with itunes:duration', () => {
      const xml = `
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>The Engineering Digest</title>
            <description>Deep dives into distributed systems.</description>
            <link>https://digest.example.com</link>
            <itunes:image href="https://digest.example.com/art.jpg" />
            <item>
              <title>Episode 101: Raft Consensus</title>
              <description>Understanding distributed state machines.</description>
              <pubDate>Mon, 01 Jan 2026 12:00:00 GMT</pubDate>
              <enclosure url="https://digest.example.com/ep101.mp3" length="43827579" type="audio/mpeg" />
              <itunes:duration>00:45:39</itunes:duration>
              <guid>ep-101</guid>
            </item>
          </channel>
        </rss>
      `;

      const parsed = parseRssFeed(xml);
      expect(parsed.title).toBe('The Engineering Digest');
      expect(parsed.description).toBe('Deep dives into distributed systems.');
      expect(parsed.link).toBe('https://digest.example.com');
      expect(parsed.artworkUrl).toBe('https://digest.example.com/art.jpg');
      expect(parsed.episodes).toHaveLength(1);

      const ep = parsed.episodes[0];
      expect(ep.title).toBe('Episode 101: Raft Consensus');
      expect(ep.duration).toBe('45:39');
      expect(ep.fileSize).toBe(43827579);
      expect(ep.audioUrl).toBe('https://digest.example.com/ep101.mp3');
      expect(ep.id).toBe('ep-101');
    });

    it('estimates duration from enclosure length when itunes:duration is missing (user feed scenario)', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <title>High Volume Podcast</title>
            <item>
              <title>Episode 989: Milestone Reflection</title>
              <description>Looking back at our 10-year podcast history.</description>
              <pubDate>Fri, 13 Mar 2026 09:00:00 GMT</pubDate>
              <enclosure url="https://storage.example.com/podcasts/ep989.mp3" length="43827579" type="audio/mpeg" />
              <guid>https://storage.example.com/podcasts/ep989.mp3</guid>
            </item>
          </channel>
        </rss>
      `;

      const parsed = parseRssFeed(xml);
      expect(parsed.episodes).toHaveLength(1);
      const ep = parsed.episodes[0];
      expect(ep.title).toBe('Episode 989: Milestone Reflection');
      expect(ep.fileSize).toBe(43827579);
      expect(ep.duration).toBe('~45:39 (est.)');
    });

    it('parses generic <duration> and media:content duration attributes', () => {
      const xml = `
        <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
          <channel>
            <title>Media Podcast</title>
            <item>
              <title>Episode A</title>
              <duration>1800</duration>
              <enclosure url="https://media.example.com/a.mp3" length="28800000" type="audio/mpeg" />
            </item>
            <item>
              <title>Episode B</title>
              <media:content url="https://media.example.com/b.mp3" duration="3600" />
            </item>
          </channel>
        </rss>
      `;

      const parsed = parseRssFeed(xml);
      expect(parsed.episodes).toHaveLength(2);
      expect(parsed.episodes[0].duration).toBe('30:00');
      expect(parsed.episodes[1].duration).toBe('1:00:00');
    });
  });
});
