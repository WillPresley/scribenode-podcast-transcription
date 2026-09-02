import React, { useState } from "react";
import { Rss, Search, Sparkles, Clock, Calendar, AlertCircle, Loader2, ExternalLink, Play } from "lucide-react";
import { RssFeedInfo, RssEpisode } from "../types";

interface RssFeedPickerProps {
  onSelectEpisode: (episode: RssEpisode, feedTitle: string) => void;
  isPending: boolean;
}

const SAMPLE_FEEDS = [
  {
    name: "Changelog Podcast",
    url: "https://changelog.com/podcast/feed",
    genre: "Software & Open Source"
  },
  {
    name: "Acquired Podcast",
    url: "https://acquired.libsyn.com/rss",
    genre: "Tech & Business History"
  },
  {
    name: "Syntax - Tasty Web Dev",
    url: "https://feed.syntax.fm/rss",
    genre: "Web Development"
  }
];

export function RssFeedPicker({ onSelectEpisode, isPending }: RssFeedPickerProps) {
  const [feedUrl, setFeedUrl] = useState<string>("");
  const [feedData, setFeedData] = useState<RssFeedInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");

  const handleFetchFeed = async (urlToFetch?: string) => {
    const targetUrl = (urlToFetch || feedUrl).trim();
    if (!targetUrl) {
      setErrorMessage("Please enter a podcast RSS feed URL.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/rss/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: targetUrl })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load podcast RSS feed.");
      }

      setFeedData(data.feed);
      if (urlToFetch) {
        setFeedUrl(urlToFetch);
      }
    } catch (err: any) {
      console.error("[RSS Fetch Error]:", err);
      setErrorMessage(err.message || "Failed to parse RSS feed. Make sure the feed allows cross-origin requests.");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEpisodes = feedData?.episodes.filter(ep => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    return (
      ep.title.toLowerCase().includes(query) ||
      (ep.description && ep.description.toLowerCase().includes(query))
    );
  }) || [];

  return (
    <div className="space-y-4">
      {/* URL Input & Actions */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Rss className="w-3.5 h-3.5 text-orange-500" />
          Podcast RSS Feed URL
        </label>
        
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="url"
              value={feedUrl}
              onChange={(e) => {
                setFeedUrl(e.target.value);
                if (errorMessage) setErrorMessage("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleFetchFeed();
                }
              }}
              placeholder="https://example.com/podcast/feed.xml"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 focus:ring-1 focus:ring-blue-500 focus:bg-white outline-none transition-all text-slate-800 font-mono"
            />
          </div>
          <button
            type="button"
            onClick={() => handleFetchFeed()}
            disabled={isLoading || !feedUrl.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 shadow-xs"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Parsing...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Load Feed</span>
              </>
            )}
          </button>
        </div>

        {/* Sample Feed Chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mr-1">Quick Sample:</span>
          {SAMPLE_FEEDS.map((sample) => (
            <button
              key={sample.name}
              type="button"
              onClick={() => handleFetchFeed(sample.url)}
              disabled={isLoading}
              className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-md border border-slate-200 transition-colors cursor-pointer"
            >
              {sample.name}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Parsed Feed Overview & Episodes List */}
      {feedData && (
        <div className="space-y-3 bg-slate-50/70 border border-slate-200/90 rounded-xl p-3.5">
          {/* Channel Info Header */}
          <div className="flex items-start gap-3 pb-3 border-b border-slate-200">
            {feedData.artworkUrl ? (
              <img
                src={feedData.artworkUrl}
                alt={feedData.title}
                className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 border border-orange-200">
                <Rss className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-slate-900 text-xs truncate">{feedData.title}</h3>
                {feedData.link && (
                  <a
                    href={feedData.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 shrink-0"
                  >
                    <span>Website</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
              {feedData.description && (
                <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                  {feedData.description}
                </p>
              )}
              <div className="text-[9px] font-mono text-slate-400 mt-1">
                {feedData.episodes.length} episodes found
              </div>
            </div>
          </div>

          {/* Episode Filter Bar */}
          {feedData.episodes.length > 3 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter episodes by title or topic..."
                className="w-full text-[11px] bg-white border border-slate-200 rounded-md py-1.5 pl-8 pr-3 text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Episodes Scrollable List */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {filteredEpisodes.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400">
                No episodes matched your search filter.
              </div>
            ) : (
              filteredEpisodes.map((ep) => (
                <div
                  key={ep.id || ep.audioUrl}
                  className="p-2.5 bg-white border border-slate-200/80 hover:border-blue-300 rounded-lg transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs group"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-slate-800 text-xs leading-snug group-hover:text-blue-700 transition-colors">
                      {ep.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-1 flex-wrap">
                      {ep.pubDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {ep.pubDate}
                        </span>
                      )}
                      {ep.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {ep.duration}
                        </span>
                      )}
                      {ep.fileSize && (
                        <span>• {(ep.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectEpisode(ep, feedData.title)}
                    disabled={isPending}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-bold text-xs rounded-md border border-blue-200 hover:border-blue-600 transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 self-end sm:self-center shadow-2xs"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Transcribe</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
