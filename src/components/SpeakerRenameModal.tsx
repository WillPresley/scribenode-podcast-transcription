import React, { useState } from "react";
import { Users, UserCheck, X, Check, Loader2, AlertCircle } from "lucide-react";

interface SpeakerRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectedSpeakers: string[];
  onRename: (oldName: string, newName: string) => Promise<void>;
}

export function SpeakerRenameModal({
  isOpen,
  onClose,
  detectedSpeakers,
  onRename
}: SpeakerRenameModalProps) {
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>(
    detectedSpeakers[0] || "SPEAKER A"
  );
  const [customOldSpeaker, setCustomOldSpeaker] = useState<string>("");
  const [useCustomOldSpeaker, setUseCustomOldSpeaker] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  if (!isOpen) return null;

  const targetOld = useCustomOldSpeaker ? customOldSpeaker.trim() : selectedSpeaker;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetOld) {
      setError("Please select or enter the speaker name to replace.");
      return;
    }
    if (!newName.trim()) {
      setError("Please enter the new speaker name.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await onRename(targetOld, newName.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to rename speaker.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Rename Speaker</h3>
              <p className="text-[10px] text-slate-400">Replaces all instances of a speaker across the transcript</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs text-slate-700 dark:text-slate-200">
          {error && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Speaker Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 dark:text-slate-100 text-[11px]">Speaker to Replace</label>
              <button
                type="button"
                onClick={() => setUseCustomOldSpeaker(!useCustomOldSpeaker)}
                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
              >
                {useCustomOldSpeaker ? "Select from list" : "Type custom name"}
              </button>
            </div>

            {useCustomOldSpeaker ? (
              <input
                type="text"
                value={customOldSpeaker}
                onChange={(e) => setCustomOldSpeaker(e.target.value)}
                placeholder="e.g. SPEAKER A or Speaker 1"
                className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-1 focus:ring-blue-500 outline-hidden"
              />
            ) : detectedSpeakers.length > 0 ? (
              <select
                value={selectedSpeaker}
                onChange={(e) => setSelectedSpeaker(e.target.value)}
                className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 outline-hidden font-medium"
              >
                {detectedSpeakers.map((spk) => (
                  <option key={spk} value={spk} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {spk}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={customOldSpeaker}
                onChange={(e) => setCustomOldSpeaker(e.target.value)}
                placeholder="e.g. SPEAKER A"
                className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-1 focus:ring-blue-500 outline-hidden"
              />
            )}
          </div>

          {/* New Name */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-800 dark:text-slate-100 text-[11px]">New Speaker Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Sarah Drabner (Host)"
              className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-hidden font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              autoFocus
            />
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Matches variations like <code className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1 py-0.2 rounded font-mono">[00:12] {targetOld || "SPEAKER"}:</code> and updates them instantly.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newName.trim()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Rename Across Transcript</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
