import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Cpu,
  Sparkles,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Layers
} from 'lucide-react';
import { ModelStatusInfo } from '../types';
import { formatModelDisplayName } from '../utils/transcript';

interface ModelDiagnosticsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  modelStatus: ModelStatusInfo;
  onSelectModel: (model: string) => void;
  onResetCascade: () => void;
  allModels: string[];
  onOpenApiSetup: () => void;
  onOpenReleaseNotes: () => void;
}

export const ModelDiagnosticsPopover: React.FC<ModelDiagnosticsPopoverProps> = ({
  isOpen,
  onClose,
  modelStatus,
  onSelectModel,
  onResetCascade,
  allModels,
  onOpenApiSetup,
  onOpenReleaseNotes
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile backdrop for outside tap dismissal */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 md:-right-24 lg:right-0 top-16 sm:top-full mt-2 w-auto sm:w-[500px] md:w-[740px] lg:w-[780px] max-w-[calc(100vw-24px)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 z-50 text-slate-800 dark:text-slate-100 p-4 sm:p-5 max-h-[85vh] md:max-h-none overflow-y-auto"
            role="dialog"
            aria-label="Gemini Model Orchestration & Health"
          >
            {/* Top Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100/60 dark:border-blue-800/60 shrink-0">
                  <Cpu className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Gemini Model Orchestration</h4>
                    <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-md border border-blue-200/60 dark:border-blue-800/80">
                      9-Tier Cascade
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Real-time model routing & multi-tier automatic failover cascade</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Close Model Orchestration Modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Main Body: 2-Column Grid on Desktop, Clean Stack on Mobile */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5">
              {/* Left Column: Active Model & Model Selector (md:col-span-5) */}
              <div className="md:col-span-5 flex flex-col justify-between space-y-3 md:space-y-3.5 md:pr-1">
                {/* Active Loaded Model Card */}
                <div className="p-3.5 bg-gradient-to-br from-blue-50/80 via-slate-50/50 to-indigo-50/40 dark:from-blue-950/40 dark:via-slate-800/40 dark:to-indigo-950/40 rounded-xl border border-blue-100 dark:border-blue-900/60">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                      Active Loaded Model
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[9px] font-bold rounded-md uppercase tracking-wider border whitespace-nowrap ${
                        modelStatus.status === "optimal"
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                          : modelStatus.status === "fallback_active"
                            ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                            : "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                      }`}
                    >
                      {modelStatus.status === "optimal"
                        ? "Optimal Tier"
                        : modelStatus.status === "fallback_active"
                          ? "Failover Engaged"
                          : "High Demand"}
                    </span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                    {formatModelDisplayName(modelStatus.activeModel)}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 select-all">
                    {modelStatus.activeModel}
                  </div>
                </div>

                {/* Choose Primary Model Card */}
                <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-200/90 dark:border-slate-700/80">
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="model-select-dropdown" className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      Prioritize Model
                    </label>
                    {(modelStatus.isCustomSelection || modelStatus.activeModel !== modelStatus.primaryModel) && (
                      <button
                        type="button"
                        onClick={onResetCascade}
                        className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Reset to default Gemini 3.8 Flash cascade"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        Reset to Default
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      id="model-select-dropdown"
                      value={modelStatus.activeModel}
                      onChange={(e) => onSelectModel(e.target.value)}
                      className="w-full pl-2.5 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer appearance-none shadow-xs"
                    >
                      {allModels.map((m) => (
                        <option key={m} value={m} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                          {formatModelDisplayName(m)} {m === modelStatus.primaryModel ? "★ (Flagship Default)" : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 leading-normal">
                    Prioritizes this model first. If high demand or rate limits occur, ScribeNode cascades down the sequence.
                  </p>
                </div>

                {/* Notice / Reason banner if applicable */}
                {modelStatus.lastFallbackReason && (
                  <div className={`p-2.5 rounded-xl text-[11px] flex items-start gap-2 border ${
                    modelStatus.status === "degraded"
                      ? "bg-red-50/90 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-300"
                      : modelStatus.isCustomSelection
                        ? "bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-300"
                        : "bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-300"
                  }`}>
                    <AlertCircle className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                      modelStatus.status === "degraded" ? "text-red-600 dark:text-red-400" : modelStatus.isCustomSelection ? "text-indigo-600 dark:text-indigo-400" : "text-amber-600 dark:text-amber-400"
                    }`} />
                    <div className="leading-snug min-w-0">
                      <div className="font-bold text-[11px]">
                        {modelStatus.status === "degraded" ? "High Demand Notice" : modelStatus.isCustomSelection ? "Custom Priority Active" : "Failover Status"}
                      </div>
                      <div className="text-[10px] mt-0.5 text-slate-700 dark:text-slate-300">
                        {modelStatus.lastFallbackReason}
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer Links in Left Column on Desktop */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenApiSetup();
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                  >
                    Google Cloud API Guide ➔
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenReleaseNotes();
                    }}
                    className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Release Notes
                  </button>
                </div>
              </div>

              {/* Right Column: 9-Tier Fallback Chain List (md:col-span-7) */}
              <div className="md:col-span-7 bg-slate-50/60 dark:bg-slate-950/50 rounded-xl p-3 sm:p-3.5 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200/60 dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Layers className="h-3 w-3 text-slate-400" />
                      Automatic Failover Pipeline Topology
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                      High-Priority ➔ Low-Demand
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-[290px] overflow-y-auto pr-1">
                    {modelStatus.fallbackModels.map((m, idx) => {
                      const isActive = m === modelStatus.activeModel;
                      const isDefaultPrimary = m === modelStatus.primaryModel;
                      const modelError = modelStatus.modelErrors?.[m];

                      return (
                        <div
                          key={m}
                          onClick={() => {
                            if (!isActive) onSelectModel(m);
                          }}
                          className={`p-2 rounded-lg border text-xs transition-all ${
                            isActive
                              ? "bg-white dark:bg-slate-800 border-blue-400 dark:border-blue-600 shadow-2xs ring-1 ring-blue-500/20"
                              : "bg-white/70 dark:bg-slate-900/70 border-slate-200/70 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                isActive
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              }`}>
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`font-semibold text-[11px] truncate ${isActive ? "text-blue-900 dark:text-blue-200" : "text-slate-800 dark:text-slate-200"}`}>
                                    {formatModelDisplayName(m)}
                                  </span>
                                  {isDefaultPrimary && (
                                    <span className="px-1 py-0.2 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[8px] font-bold uppercase rounded">
                                      Primary Default
                                    </span>
                                  )}
                                </div>
                                <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate">
                                  {m}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isActive ? (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Active #1
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap">
                                  Prioritize ↗
                                </span>
                              )}
                            </div>
                          </div>
                          {modelError && (
                            <div className="mt-1 pl-6 text-[10px] text-amber-800 dark:text-amber-300 font-normal leading-snug flex items-center gap-1">
                              <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>{modelError.friendlyMessage}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
