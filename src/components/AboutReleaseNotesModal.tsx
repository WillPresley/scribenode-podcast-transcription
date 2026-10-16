import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Cpu,
  Key,
  Zap,
  ShieldCheck,
  Archive,
  GitBranch,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { ModelStatusInfo } from '../types';
import { formatModelDisplayName } from '../utils/transcript';

export type AboutModalTab = 'overview' | 'api_setup' | 'release_notes';

interface AboutReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: AboutModalTab;
  modelStatus: ModelStatusInfo;
  onOpenBackupRestoreModal: () => void;
}

export const AboutReleaseNotesModal: React.FC<AboutReleaseNotesModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'overview',
  modelStatus,
  onOpenBackupRestoreModal
}) => {
  const [activeTab, setActiveTab] = useState<AboutModalTab>(initialTab);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] transition-colors"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-xl bg-blue-600 p-2 shrink-0 shadow-sm w-9 h-9">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                    <path
                      d="M4 11V13M8 7V17M12 3V21M16 6V18M20 10V14"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="3" r="2" fill="white" />
                    <circle cx="16" cy="18" r="2" fill="white" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-base sm:text-lg text-white tracking-tight">
                      Scribe<span className="text-blue-300">Node</span>
                    </h2>
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      v1.5.5
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">AI Speech & Transcript Engine</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 px-4 pt-2 gap-1.5 shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-t border-x ${
                  activeTab === 'overview'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-slate-200 dark:border-slate-800 -mb-[1px] shadow-2xs'
                    : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Overview</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('api_setup')}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-t border-x ${
                  activeTab === 'api_setup'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-slate-200 dark:border-slate-800 -mb-[1px] shadow-2xs'
                    : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <Key className="w-3.5 h-3.5 text-blue-500" />
                <span>API & Cloud Setup</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('release_notes')}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-t border-x ${
                  activeTab === 'release_notes'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-slate-200 dark:border-slate-800 -mb-[1px] shadow-2xs'
                    : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>What's New v1.5.5</span>
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
              {/* TAB 1: SYSTEM OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
                      <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Speech Intelligence Engine
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-3">
                      ScribeNode is an AI-powered speech intelligence engine built for processing podcasts, interviews, and audio recordings into publication-ready transcripts with speaker diarization, timestamps, and multi-format content pipelines.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[10px]">CORE AI MODEL</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">{formatModelDisplayName(modelStatus.activeModel)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[10px]">SERVER FRAMEWORK</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">Express 5.3 / Node 26</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[10px]">BUILD ENGINE</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">Vite 8 / React 19</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block text-[10px]">THEME SYSTEM</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">Light / Dark / Auto OS</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick API Callout Banner */}
                  <div className="p-3.5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl flex items-start gap-3">
                    <Key className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-bold text-slate-900 dark:text-slate-100">Custom Google Cloud & Gemini API Key:</span>
                      <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                        Using your own Gemini key? Make sure the <strong className="text-slate-900 dark:text-white">Generative Language API</strong> is activated on your Google Cloud project.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('api_setup')}
                        className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold hover:underline mt-1 cursor-pointer"
                      >
                        View Google Cloud Setup Guide ➔
                      </button>
                    </div>
                  </div>

                  {/* Privacy & Storage */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Privacy & Local Storage
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400">
                      Audio files are processed via secure server-side Gemini API proxy calls. Audio files are retained locally in persistent Docker storage for playback and scrubbing, while transcripts remain saved locally in volume persistence.
                    </p>
                  </div>

                  {/* Homelab Backup Banner */}
                  <div className="p-3.5 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-xl flex items-start gap-3">
                    <Archive className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-bold text-slate-900 dark:text-slate-100">Homelab & Docker Backup / Restore:</span>
                      <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                        Easily export your transcripts, notes, and audio into dated ZIP snapshots, or restore a previous installation with one click.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenBackupRestoreModal();
                        }}
                        className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold hover:underline mt-1 cursor-pointer"
                      >
                        Open Backup & Restore Center ➔
                      </button>
                    </div>
                  </div>

                  {/* Open Source Repository */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <a
                      href="https://github.com/WillPresley/scribenode-podcast-transcription"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/40 hover:bg-blue-50/70 dark:hover:bg-slate-800/80 rounded-xl border border-slate-200/90 dark:border-slate-700/80 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center shrink-0 group-hover:bg-blue-600 transition-colors shadow-2xs">
                          <GitBranch className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 text-xs">
                              WillPresley/scribenode-podcast-transcription
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                              GitHub
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Explore source code, self-hosted Docker instructions, and CI/CD pipelines
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0 ml-2 transition-colors" />
                    </a>
                  </div>
                </div>
              )}

              {/* TAB 2: GOOGLE CLOUD & API SETUP */}
              {activeTab === 'api_setup' && (
                <div className="space-y-6">
                  {/* Critical Requirement Header */}
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border border-blue-200 dark:border-blue-900/60 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-blue-900 dark:text-blue-300 font-bold text-xs uppercase tracking-wide">
                      <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Required Google Cloud API</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                      ScribeNode uses Google's <strong className="text-slate-900 dark:text-white">Generative Language API</strong> (<code className="bg-white/80 dark:bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">generativelanguage.googleapis.com</code>) to transcribe audio tracks and generate structured podcast insights.
                    </p>
                  </div>

                  {/* Setup Pathways */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      How to Set Up Your API Key
                    </h4>

                    {/* Option A: Google AI Studio */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                          Option A: Google AI Studio (Recommended / Fastest)
                        </span>
                        <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[9px] font-bold rounded uppercase border border-emerald-200 dark:border-emerald-800">
                          Auto-Enables API
                        </span>
                      </div>
                      
                      <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 pl-1">
                        <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1">Google AI Studio API Keys <ExternalLink className="w-3 h-3" /></a></li>
                        <li>Sign in with your Google Account and click <strong className="text-slate-800 dark:text-slate-200">"Create API key"</strong>.</li>
                        <li>Select your Google Cloud project or allow AI Studio to provision a new project.</li>
                        <li><strong className="text-slate-800 dark:text-slate-200">Done!</strong> Keys created via AI Studio automatically have the <em className="text-blue-700 dark:text-blue-300 not-italic font-semibold">Generative Language API</em> enabled.</li>
                      </ol>

                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer"
                      >
                        <span>Open Google AI Studio Keys</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Option B: Google Cloud Console */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-slate-800 dark:bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                          Option B: Google Cloud Console (Custom GCP Projects)
                        </span>
                      </div>

                      <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 pl-1">
                        <li>Go to <a href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1">Generative Language API in Google Cloud <ExternalLink className="w-3 h-3" /></a>.</li>
                        <li>Select your target GCP project from the top dropdown.</li>
                        <li>Click the blue <strong className="text-slate-800 dark:text-slate-200">"ENABLE"</strong> button.</li>
                        <li>Navigate to <strong className="text-slate-800 dark:text-slate-200">APIs & Services &gt; Credentials</strong> &rarr; <strong className="text-slate-800 dark:text-slate-200">Create Credentials &gt; API Key</strong>.</li>
                        <li><em className="text-slate-500">Optional security:</em> Under API restrictions, restrict the key to only the <strong>Generative Language API</strong>.</li>
                      </ol>

                      <a
                        href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer"
                      >
                        <span>Enable API in Cloud Console</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Environment Variable Setup Block */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Configuring ScribeNode (.env / Docker)
                    </h4>
                    <div className="bg-slate-900 dark:bg-slate-950 text-slate-200 p-3 rounded-xl font-mono text-[11px] relative border border-slate-800">
                      <button
                        type="button"
                        onClick={() => copyToClipboard('GEMINI_API_KEY="your-api-key-here"', 'env-key')}
                        className="absolute top-2.5 right-2.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {copiedSnippet === 'env-key' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSnippet === 'env-key' ? 'Copied' : 'Copy'}</span>
                      </button>
                      <div className="text-slate-500 select-none"># .env or docker-compose.yml</div>
                      <div className="text-emerald-400">GEMINI_API_KEY<span className="text-white">=</span><span className="text-amber-300">"AIzaSy..."</span></div>
                    </div>
                  </div>

                  {/* Troubleshooting Common Errors */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Common API Troubleshooting
                    </h4>
                    <div className="space-y-2">
                      <div className="p-3 bg-red-50/70 dark:bg-red-950/30 border border-red-200/80 dark:border-red-900/60 rounded-lg text-[11px]">
                        <div className="font-bold text-red-900 dark:text-red-300 mb-0.5">
                          Error: "Generative Language API has not been used in project..." (PERMISSION_DENIED / 403)
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">
                          Your API key is valid, but the API is not enabled on that project. Click the <strong className="text-slate-800 dark:text-slate-200">"Enable API in Cloud Console"</strong> button above to activate it.
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px]">
                        <div className="font-bold text-slate-900 dark:text-slate-200 mb-0.5">Error: "API_KEY_INVALID" (400)</div>
                        <p className="text-slate-600 dark:text-slate-400">
                          Check for accidental spaces or quotes around the key in your <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.2 rounded font-mono text-[10px]">.env</code> file, and restart the container.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: RELEASE NOTES */}
              {activeTab === 'release_notes' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      What's New in v1.5.5
                    </h3>
                    <ul className="space-y-3 border-l-2 border-blue-200 dark:border-blue-800 pl-3.5">
                      <li className="relative">
                        <span className="font-bold text-slate-900 dark:text-white">Seamless Dark, Light & Auto-OS System Themes:</span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                          Fully customizable appearance with three accessible modes: refined Light workspace, deep slate neutral Dark mode, and automatic OS synchronization via <code className="font-mono text-[10px]">prefers-color-scheme</code>. Dual control placement across the top header and mobile drawer.
                        </p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900 dark:text-white">Progressive Web App (PWA) & Standalone Windowing:</span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                          Install ScribeNode as a native application across macOS, Windows, Linux, Android, and iOS. Enjoy frameless standalone desktop windows, customized dock/home icons, quick in-app install actions, and auto-updating service worker precaching.
                        </p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900 dark:text-white">Offline Resilience & Saved Transcript Access:</span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                          Instant offline status detection with non-intrusive banner alerts. Seamlessly inspect, filter, format, and export previously transcribed podcast episodes and meetings even when disconnected or traveling.
                        </p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900 dark:text-white">Flagship Gemini 3.8 Flash & Full Fallback Cascade:</span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                          Primary multimodal reasoning and speech alignment engine powered by Google DeepMind's Gemini 3.8 Flash, backed by an automated fallback cascade spanning Gemini 3.6 Flash, Flash Latest, and Flash Lite models.
                        </p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900 dark:text-white">Podcast RSS Feed & Remote URL Ingestion:</span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                          Directly transcribe podcasts from public RSS feeds or direct audio URLs. Preview feed metadata, browse episodes, and stream audio directly to the transcription pipeline without manual file downloads.
                        </p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900 dark:text-white">Audio Enclosure Byte Duration Estimation:</span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                          Resilient audio duration fallback estimation derived from enclosure file size lengths (~128 kbps standard) alongside standard XML tags.
                        </p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900 dark:text-white">Custom Vocabulary & Technical Glossary:</span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                          Supply custom domain terms, acronyms, brand names, and niche jargon prior to transcription to dramatically improve speech recognition accuracy across specialized recordings.
                        </p>
                      </li>
                      <li className="relative">
                        <span className="font-bold text-slate-900 dark:text-white">Inline Quick Edit & Global Speaker Renaming:</span>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                          Directly refine transcript text with the integrated markdown editor, or replace speaker labels across the entire transcript with one click using the Speaker Renaming dialog.
                        </p>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                      Previous Milestones
                    </h4>
                    <div className="space-y-2">
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-[11px] text-slate-600 dark:text-slate-400 space-y-1 border border-slate-200/60 dark:border-slate-700/60">
                        <div className="font-bold text-slate-800 dark:text-slate-200">v1.5.1 &mdash; RSS Feed Pagination & Duration Fallbacks</div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Enhanced RSS picker with 50/100 episode pagination, full-archive search filtering, enclosure byte duration estimation, and Dependabot supply chain setup.</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-[11px] text-slate-600 dark:text-slate-400 space-y-1 border border-slate-200/60 dark:border-slate-700/60">
                        <div className="font-bold text-slate-800 dark:text-slate-200">v1.5.0 &mdash; Flagship Gemini 3.8 Flash, RSS Feeds & Custom Vocabulary</div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Multimodal Gemini 3.8 Flash, full 9-tier model cascade, RSS feed ingestion, custom glossary injection, and in-place transcript editor.</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-[11px] text-slate-600 dark:text-slate-400 space-y-1 border border-slate-200/60 dark:border-slate-700/60">
                        <div className="font-bold text-slate-800 dark:text-slate-200">v1.4.5 &mdash; Flagship Gemini 3.7 Flash & Markdown Standards</div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Flagship multimodal transcription, publication-grade markdown layout, human-friendly error categorization, and granular model cascade failover diagnostics.</p>
                      </div>
                    </div>
                  </div>

                  {/* Open Source Repository */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <a
                      href="https://github.com/WillPresley/scribenode-podcast-transcription"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/40 hover:bg-blue-50/70 dark:hover:bg-slate-800/80 rounded-xl border border-slate-200/90 dark:border-slate-700/80 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-800 dark:text-slate-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center shrink-0 group-hover:bg-blue-600 transition-colors shadow-2xs">
                          <GitBranch className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 text-xs">
                              WillPresley/scribenode-podcast-transcription
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                              GitHub
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Explore source code, self-hosted Docker instructions, and CI/CD pipelines</p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0 ml-2 transition-colors" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <a
                href="https://github.com/WillPresley/scribenode-podcast-transcription"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>View on GitHub</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
              <div className="flex items-center gap-2">
                {activeTab !== 'api_setup' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('api_setup')}
                    className="px-3 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Key className="w-3 h-3" />
                    API Setup Guide
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
