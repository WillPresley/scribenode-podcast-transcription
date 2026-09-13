import React, { useState, useMemo, useRef, useEffect } from "react";
import { Rss, Search, Sparkles, Clock, Calendar, AlertCircle, Loader2, ExternalLink, X, ChevronLeft, ChevronRight } from "lucide-react";
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

/**
 * Client-side fallback duration estimator from audio byte size (~128 kbps podcast standard).
 */
function getDisplayDuration(ep: RssEpisode): { duration: string; isEstimated: boolean } {
  if (ep.duration && ep.duration !== "--:--") {
    const isEstimated = ep.duration.includes("(est.)") || ep.duration.startsWith("~");
    return { duration: ep.duration, isEstimated };
  }
  if (ep.fileSize && ep.fileSize > 0) {
    const totalSecs = Math.round(ep.fileSize / 16000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return {
        duration: `~${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")} (est.)`,
        isEstimated: true
      };
    }
    return {
      duration: `~${mins}:${String(secs).padStart(2, "0")} (est.)`,
      isEstimated: true
    };
  }
  return { duration: "--:--", isEstimated: false };
}

export function RssFeedPicker({ onSelectEpisode, isPending }: RssFeedPickerProps) {
  const [feedUrl, setFeedUrl] = useState<string>("");
  const [feedData, setFeedData] = useState<RssFeedInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const episodesContainerRef = useRef<HTMLDivElement>(null);

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
      setCurrentPage(1);
      setSearchFilter("");
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

  // Filter episodes across the entire feed dataset
  const filteredEpisodes = useMemo(() => {
    if (!feedData?.episodes) return [];
    const query = searchFilter.trim().toLowerCase();
    if (!query) return feedData.episodes;
    return feedData.episodes.filter(ep => {
      return (
        ep.title.toLowerCase().includes(query) ||
        (ep.description && ep.description.toLowerCase().includes(query)) ||
        (ep.pubDate && ep.pubDate.toLowerCase().includes(query))
      );
    });
  }, [feedData?.episodes, searchFilter]);

  // Reset to page 1 whenever search query or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchFilter, pageSize]);

  // Pagination calculation
  const totalEpisodes = filteredEpisodes.length;
  const totalPages = Math.max(1, Math.ceil(totalEpisodes / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalEpisodes);
  const displayedEpisodes = filteredEpisodes.slice(startIndex, endIndex);

  const handlePageChange = (newPage: number) => {
    const boundedPage = Math.min(Math.max(1, newPage), totalPages);
    setCurrentPage(boundedPage);
    if (episodesContainerRef.current) {
      episodesContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Generate page numbers for pagination controls
  const pageNumbers = useMemo(() => {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(2, validPage - delta); i <= Math.min(totalPages - 1, validPage + delta); i++) {
      range.push(i);
    }
    if (validPage - delta > 2) range.unshift(-1);
    if (validPage + delta < totalPages - 1) range.push(-2);
    range.unshift(1);
    if (totalPages > 1) range.push(totalPages);
    return range;
  }, [validPage, totalPages]);

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

          {/* Search Filter & Page Size Selector Bar */}
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
            {/* Search Input with Clear Button */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={`Search ${feedData.episodes.length} episodes by title or description...`}
                className="w-full text-[11px] bg-white border border-slate-200 rounded-md py-1.5 pl-8 pr-7 text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Page Size Segmented Toggle */}
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto text-[10px] text-slate-500">
              <span className="text-slate-400 font-medium">Per page:</span>
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setPageSize(50)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    pageSize === 50
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  50
                </button>
                <button
                  type="button"
                  onClick={() => setPageSize(100)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    pageSize === 100
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  100
                </button>
              </div>
            </div>
          </div>

          {/* Results Counter & Pagination Status */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 px-0.5">
            <div>
              {totalEpisodes === 0 ? (
                <span>No matching episodes</span>
              ) : (
                <span>
                  Showing <strong className="text-slate-700">{startIndex + 1}</strong>–<strong className="text-slate-700">{endIndex}</strong> of{" "}
                  <strong className="text-slate-700">{totalEpisodes}</strong> {searchFilter ? "matching episodes" : "episodes"}
                  {searchFilter && (
                    <span className="text-slate-400 ml-1">(filtered from {feedData.episodes.length} total)</span>
                  )}
                </span>
              )}
            </div>
            {totalPages > 1 && (
              <span className="font-mono text-[9px] text-slate-400">
                Page {validPage} of {totalPages}
              </span>
            )}
          </div>

          {/* Episodes Scrollable List */}
          <div ref={episodesContainerRef} className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {displayedEpisodes.length === 0 ? (
              <div className="text-center py-8 bg-white border border-dashed border-slate-200 rounded-lg">
                <p className="text-xs text-slate-500 font-medium">No episodes matched your search.</p>
                {searchFilter && (
                  <button
                    type="button"
                    onClick={() => setSearchFilter("")}
                    className="mt-2 text-[11px] text-blue-600 hover:underline cursor-pointer"
                  >
                    Clear search filter
                  </button>
                )}
              </div>
            ) : (
              displayedEpisodes.map((ep) => {
                const { duration, isEstimated } = getDisplayDuration(ep);
                return (
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
                        {duration && duration !== "--:--" && (
                          <span
                            className={`flex items-center gap-1 ${
                              isEstimated ? "text-amber-600 font-medium" : ""
                            }`}
                            title={
                              isEstimated
                                ? "Estimated duration calculated from audio byte length at ~128 kbps"
                                : "Audio duration"
                            }
                          >
                            <Clock className="w-2.5 h-2.5" />
                            {duration}
                          </span>
                        )}
                        {ep.fileSize && (
                          <span title={`Byte length: ${ep.fileSize.toLocaleString()} bytes`}>
                            • {(ep.fileSize / (1024 * 1024)).toFixed(1)} MB
                          </span>
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
                );
              })
            )}
          </div>

          {/* Bottom Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
              <button
                type="button"
                onClick={() => handlePageChange(validPage - 1)}
                disabled={validPage <= 1}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-700 text-xs font-medium rounded-md shadow-2xs cursor-pointer disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              {/* Numbered Page Buttons */}
              <div className="hidden sm:flex items-center gap-1">
                {pageNumbers.map((p, idx) => {
                  if (p < 0) {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 text-xs">
                        …
                      </span>
                    );
                  }
                  const isCurrent = p === validPage;
                  return (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      className={`min-w-[26px] h-[26px] text-xs font-medium rounded-md flex items-center justify-center cursor-pointer transition-colors ${
                        isCurrent
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <div className="sm:hidden text-xs text-slate-500 font-mono">
                {validPage} / {totalPages}
              </div>

              <button
                type="button"
                onClick={() => handlePageChange(validPage + 1)}
                disabled={validPage >= totalPages}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white text-slate-700 text-xs font-medium rounded-md shadow-2xs cursor-pointer disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
