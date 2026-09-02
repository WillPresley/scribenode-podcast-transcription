/**
 * ScribeNode Podcast RSS & Feed Parser
 * Lightweight, zero-dependency XML & enclosure parser for podcast RSS & Atom feeds.
 */

export interface RssEpisode {
  id: string;
  title: string;
  description?: string;
  pubDate?: string;
  duration?: string;
  audioUrl: string;
  fileSize?: number;
  artworkUrl?: string;
}

export interface RssFeedInfo {
  title: string;
  description?: string;
  link?: string;
  artworkUrl?: string;
  episodes: RssEpisode[];
}

/**
 * Strips XML/HTML tags, CDATA wrappers, and decodes common HTML entities.
 */
export function cleanXmlText(text?: string | null): string {
  if (!text) return "";
  let clean = text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean;
}

/**
 * Normalizes duration string from seconds, "MM:SS", or "HH:MM:SS" into standard format.
 */
export function normalizeDuration(rawDuration?: string | null): string {
  if (!rawDuration) return "--:--";
  const trimmed = rawDuration.trim();
  if (/^\d+$/.test(trimmed)) {
    const totalSecs = parseInt(trimmed, 10);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }
  return trimmed;
}

/**
 * Parses raw RSS 2.0 or Atom XML content into a structured RssFeedInfo object.
 */
export function parseRssFeed(xml: string): RssFeedInfo {
  if (!xml || typeof xml !== "string") {
    throw new Error("Invalid RSS feed: empty XML content.");
  }

  // Extract channel / feed title
  const channelMatch = xml.match(/<channel[\s\S]*?>([\s\S]*?)<\/channel>/i);
  const channelScope = channelMatch ? channelMatch[1] : xml;

  // Channel Title
  const titleMatch = channelScope.match(/<title[\s\S]*?>([\s\S]*?)<\/title>/i);
  const feedTitle = cleanXmlText(titleMatch ? titleMatch[1] : "Podcast Feed");

  // Channel Description
  const descMatch = channelScope.match(/<description[\s\S]*?>([\s\S]*?)<\/description>/i) ||
                    channelScope.match(/<itunes:summary[\s\S]*?>([\s\S]*?)<\/itunes:summary>/i);
  const feedDescription = descMatch ? cleanXmlText(descMatch[1]) : "";

  // Channel Link
  const linkMatch = channelScope.match(/<link[\s\S]*?>([\s\S]*?)<\/link>/i);
  const feedLink = linkMatch ? cleanXmlText(linkMatch[1]) : "";

  // Channel Artwork
  let feedArtwork: string | undefined = undefined;
  const itunesImageMatch = channelScope.match(/<itunes:image[^>]*href=["']([^"']+)["']/i);
  if (itunesImageMatch) {
    feedArtwork = itunesImageMatch[1].trim();
  } else {
    const imageBlockMatch = channelScope.match(/<image[\s\S]*?<url>([\s\S]*?)<\/url>[\s\S]*?<\/image>/i);
    if (imageBlockMatch) {
      feedArtwork = cleanXmlText(imageBlockMatch[1]);
    }
  }

  // Extract Episodes (<item> or <entry>)
  const items: RssEpisode[] = [];
  const itemRegex = /<(?:item|entry)[\s\S]*?>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  let episodeCounter = 1;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];

    // Audio Enclosure URL
    let audioUrl = "";
    let fileSize: number | undefined = undefined;

    const enclosureMatch = itemContent.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
    if (enclosureMatch) {
      audioUrl = enclosureMatch[1].trim();
      const lengthMatch = enclosureMatch[0].match(/length=["'](\d+)["']/i);
      if (lengthMatch) {
        fileSize = parseInt(lengthMatch[1], 10);
      }
    } else {
      const mediaMatch = itemContent.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
      if (mediaMatch) {
        audioUrl = mediaMatch[1].trim();
      }
    }

    if (!audioUrl) {
      // Skip items without an audio enclosure
      continue;
    }

    // Episode Title
    const epTitleMatch = itemContent.match(/<title[\s\S]*?>([\s\S]*?)<\/title>/i);
    const epTitle = cleanXmlText(epTitleMatch ? epTitleMatch[1] : `Episode ${episodeCounter}`);

    // Episode Description
    const epDescMatch = itemContent.match(/<description[\s\S]*?>([\s\S]*?)<\/description>/i) ||
                        itemContent.match(/<itunes:summary[\s\S]*?>([\s\S]*?)<\/itunes:summary>/i);
    const epDescription = epDescMatch ? cleanXmlText(epDescMatch[1]).slice(0, 300) : "";

    // Publication Date
    const pubDateMatch = itemContent.match(/<pubDate[\s\S]*?>([\s\S]*?)<\/pubDate>/i) ||
                         itemContent.match(/<published[\s\S]*?>([\s\S]*?)<\/published>/i);
    const pubDate = pubDateMatch ? cleanXmlText(pubDateMatch[1]) : "";

    // Duration
    const durMatch = itemContent.match(/<itunes:duration[\s\S]*?>([\s\S]*?)<\/itunes:duration>/i);
    const duration = normalizeDuration(durMatch ? cleanXmlText(durMatch[1]) : undefined);

    // Episode Artwork
    const epArtMatch = itemContent.match(/<itunes:image[^>]*href=["']([^"']+)["']/i);
    const epArtwork = epArtMatch ? epArtMatch[1].trim() : feedArtwork;

    // GUID / ID
    const guidMatch = itemContent.match(/<guid[\s\S]*?>([\s\S]*?)<\/guid>/i) ||
                      itemContent.match(/<id[\s\S]*?>([\s\S]*?)<\/id>/i);
    const epId = guidMatch ? cleanXmlText(guidMatch[1]) : audioUrl;

    items.push({
      id: epId || `ep-${episodeCounter}`,
      title: epTitle,
      description: epDescription,
      pubDate,
      duration,
      audioUrl,
      fileSize,
      artworkUrl: epArtwork
    });

    episodeCounter++;
  }

  return {
    title: feedTitle || "Podcast Feed",
    description: feedDescription,
    link: feedLink,
    artworkUrl: feedArtwork,
    episodes: items
  };
}

/**
 * Fetches and parses a remote podcast RSS feed.
 */
export async function fetchRssFeed(feedUrl: string, timeoutMs: number = 10000): Promise<RssFeedInfo> {
  const parsedUrl = new URL(feedUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Invalid protocol: only http and https URLs are supported.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ScribeNode/1.5.0 (+https://github.com/WillPresley/scribenode-podcast-transcription; podcast transcriber)",
        "Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml, */*"
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch RSS feed (${res.status} ${res.statusText})`);
    }

    const xml = await res.text();
    if (!xml.includes("<rss") && !xml.includes("<channel") && !xml.includes("<feed")) {
      throw new Error("The requested URL does not appear to return a valid RSS or Podcast XML feed.");
    }

    return parseRssFeed(xml);
  } finally {
    clearTimeout(timeoutId);
  }
}
