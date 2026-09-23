import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Archive,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  FileArchive,
  HardDrive,
  RefreshCw,
  FolderArchive,
  Layers,
  Sparkles,
  Info
} from "lucide-react";
import { BackupFileInfo, RestoreResult } from "../types";

export interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess
}) => {
  const [activeTab, setActiveTab] = useState<"export" | "import" | "stored">("export");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    action: "delete" | "restore";
    filename: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBackups = async () => {
    try {
      setLoadingBackups(true);
      const res = await fetch("/api/backups");
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch (err) {
      console.error("Failed to load backups list:", err);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBackups();
      setStatusMessage(null);
      setSelectedFile(null);
    }
  }, [isOpen]);

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (timestampOrIso: number | string): string => {
    try {
      const d = new Date(timestampOrIso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return String(timestampOrIso);
    }
  };

  const triggerBrowserDownload = (filename: string) => {
    const link = document.createElement("a");
    link.href = `/api/backups/${encodeURIComponent(filename)}/download`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateBackup = async () => {
    try {
      setIsProcessing(true);
      setStatusMessage(null);

      const res = await fetch("/api/backups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeAudio })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create backup.");
      }

      setStatusMessage({
        type: "success",
        text: `Backup '${data.backup.filename}' created (${formatFileSize(data.backup.sizeBytes)}). Download starting...`
      });

      // Automatically trigger browser download
      triggerBrowserDownload(data.backup.filename);

      // Refresh stored backups list
      fetchBackups();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "An unexpected error occurred while creating the backup."
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadRestore = async () => {
    if (!selectedFile) {
      setStatusMessage({ type: "error", text: "Please select a .zip backup archive first." });
      return;
    }

    try {
      setIsProcessing(true);
      setStatusMessage(null);

      const formData = new FormData();
      formData.append("backup", selectedFile);
      formData.append("mode", restoreMode);

      const res = await fetch("/api/backups/upload-restore", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to restore uploaded backup archive.");
      }

      const result: RestoreResult = data.result;
      setStatusMessage({
        type: "success",
        text: `Restored ${result.restoredJobsCount} jobs and ${result.restoredAudioCount} audio files successfully in ${result.mode} mode!`
      });

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      fetchBackups();
      onRestoreSuccess();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to restore backup."
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStoredRestore = async (filename: string) => {
    try {
      setIsProcessing(true);
      setStatusMessage(null);

      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: restoreMode })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to restore stored backup.");
      }

      const result: RestoreResult = data.result;
      setStatusMessage({
        type: "success",
        text: `Restored ${result.restoredJobsCount} jobs and ${result.restoredAudioCount} audio files from '${filename}'!`
      });

      setConfirmDialog(null);
      onRestoreSuccess();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to restore backup archive."
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    try {
      setIsProcessing(true);
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete backup.");
      }
      setStatusMessage({
        type: "info",
        text: `Backup '${filename}' deleted from storage.`
      });
      setConfirmDialog(null);
      fetchBackups();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to delete backup."
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base sm:text-lg text-white tracking-tight">
                  Backup & System Restore
                </h2>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Homelab / Docker
                </span>
              </div>
              <p className="text-xs text-slate-400">Full snapshot export, browser backup, and one-click data restore</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-4 pt-2 gap-1.5 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("export")}
            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-t border-x ${
              activeTab === "export"
                ? "bg-white text-blue-600 border-slate-200 -mb-[1px] shadow-2xs"
                : "bg-transparent text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Create & Export</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-t border-x ${
              activeTab === "import"
                ? "bg-white text-blue-600 border-slate-200 -mb-[1px] shadow-2xs"
                : "bg-transparent text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload & Restore</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("stored");
              fetchBackups();
            }}
            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border-t border-x ${
              activeTab === "stored"
                ? "bg-white text-blue-600 border-slate-200 -mb-[1px] shadow-2xs"
                : "bg-transparent text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-100"
            }`}
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>Server Archives ({backups.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-700 text-xs leading-relaxed">
          {/* Status Alert Banner */}
          {statusMessage && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                statusMessage.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : statusMessage.type === "error"
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : statusMessage.type === "error" ? (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              )}
              <span className="font-medium">{statusMessage.text}</span>
            </motion.div>
          )}

          {/* TAB 1: CREATE & EXPORT */}
          {activeTab === "export" && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileArchive className="w-4 h-4 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    Full System Snapshot Package (.zip)
                  </h3>
                </div>
                <p className="text-slate-600">
                  Exports your transcripts, summaries, timestamps, speaker diarisations, chapter marks,
                  and metadata into a dated, compressed ZIP package. Ideal for regular homelab backups,
                  disaster recovery, or migrating to another ScribeNode Docker container.
                </p>

                {/* Audio inclusion toggle */}
                <div className="pt-2 border-t border-slate-200/80">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={includeAudio}
                      onChange={(e) => setIncludeAudio(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-slate-800 text-xs group-hover:text-blue-600 transition-colors">
                        Include Audio Recordings in Backup
                      </span>
                      <p className="text-[11px] text-slate-500">
                        {includeAudio
                          ? "Includes raw audio recordings so the audio player and playback markers work immediately upon restore."
                          : "Lightweight Mode: Omits audio binary files. Resulting ZIP is ultra-compact (typically < 100 KB) and downloads in milliseconds."}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                  <span>Saves to container storage & downloads to your device automatically</span>
                </div>
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={isProcessing}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating Archive...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Generate & Download Backup (.zip)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD & RESTORE */}
          {activeTab === "import" && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    Restore from Local Backup File
                  </h3>
                </div>
                <p className="text-slate-600">
                  Select or drag a previously downloaded ScribeNode <code className="text-blue-700 bg-blue-50 px-1 py-0.5 rounded font-mono">.zip</code> archive.
                  The server validates the manifest, unpacks the database, links audio files, and updates the active queue.
                </p>

                {/* File picker */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                    selectedFile
                      ? "border-blue-400 bg-blue-50/50"
                      : "border-slate-300 hover:border-blue-400 bg-white"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <FileArchive className={`w-8 h-8 ${selectedFile ? "text-blue-600" : "text-slate-400"}`} />
                    {selectedFile ? (
                      <div>
                        <p className="font-bold text-slate-800 text-xs">{selectedFile.name}</p>
                        <p className="text-[11px] text-slate-500">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-bold text-slate-700 text-xs">Click to browse or drop backup .zip here</p>
                        <p className="text-[11px] text-slate-400">Accepts standard ScribeNode backup archives</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Restore Mode selection */}
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <span className="font-bold text-slate-800 text-xs block">Select Restore Strategy:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        restoreMode === "merge"
                          ? "bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-400"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="restoreMode"
                        value="merge"
                        checked={restoreMode === "merge"}
                        onChange={() => setRestoreMode("merge")}
                        className="sr-only"
                      />
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                        <span>Merge (Recommended)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Keeps existing jobs in place while adding or updating items from the archive.
                      </p>
                    </label>

                    <label
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        restoreMode === "replace"
                          ? "bg-amber-50 border-amber-400 text-amber-900 ring-1 ring-amber-400"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="restoreMode"
                        value="replace"
                        checked={restoreMode === "replace"}
                        onChange={() => setRestoreMode("replace")}
                        className="sr-only"
                      />
                      <div className="font-bold text-xs flex items-center gap-1.5 text-amber-800">
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>Clean / Replace All</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Clears the current job list completely and restores exactly what is inside the backup.
                      </p>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleUploadRestore}
                  disabled={!selectedFile || isProcessing}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Restoring System Data...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Restore Selected Archive</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SERVER-STORED ARCHIVES */}
          {activeTab === "stored" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <FolderArchive className="w-4 h-4 text-blue-600" />
                    <span>Persistent Volume Backups</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Stored in Docker volume <code className="text-slate-700 font-mono">/app/uploads/backups</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchBackups}
                  disabled={loadingBackups}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Refresh list"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingBackups ? "animate-spin" : ""}`} />
                </button>
              </div>

              {loadingBackups ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs">Scanning stored backup archives...</span>
                </div>
              ) : backups.length === 0 ? (
                <div className="py-10 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center p-6 space-y-2">
                  <Archive className="w-8 h-8 text-slate-300" />
                  <p className="font-bold text-slate-700 text-xs">No Server Backups Found Yet</p>
                  <p className="text-[11px] text-slate-400 max-w-sm">
                    Generate your first snapshot from the "Create & Export" tab to persist a copy in your volume.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("export")}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Create First Backup</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {backups.map((b) => (
                    <div
                      key={b.filename}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-slate-300 transition-all shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileArchive className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="font-mono text-xs font-bold text-slate-900 truncate">
                            {b.filename}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span>{formatDate(b.createdAt)}</span>
                          <span>•</span>
                          <span className="font-mono">{formatFileSize(b.sizeBytes)}</span>
                          {typeof b.jobCount === "number" && (
                            <>
                              <span>•</span>
                              <span>{b.jobCount} {b.jobCount === 1 ? "job" : "jobs"}</span>
                            </>
                          )}
                          {b.includesAudio && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-medium text-[10px]">
                              Audio Included
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => triggerBrowserDownload(b.filename)}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="Download archive to your computer"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDialog({ action: "restore", filename: b.filename })}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                          title="Restore from this backup"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDialog({ action: "delete", filename: b.filename })}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete backup from disk"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Confirmation Overlay Dialog */}
          {confirmDialog && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-sm w-full space-y-3"
              >
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  {confirmDialog.action === "delete" ? (
                    <>
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Delete Stored Backup?</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4 text-emerald-600" />
                      <span>Restore Stored Backup?</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-600">
                  {confirmDialog.action === "delete" ? (
                    <>
                      Are you sure you want to permanently delete{" "}
                      <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                        {confirmDialog.filename}
                      </code>
                      ? This cannot be undone.
                    </>
                  ) : (
                    <>
                      Restore state from{" "}
                      <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">
                        {confirmDialog.filename}
                      </code>
                      ? In Merge mode, your current transcripts are preserved.
                    </>
                  )}
                </p>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDialog(null)}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  {confirmDialog.action === "delete" ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteBackup(confirmDialog.filename)}
                      disabled={isProcessing}
                      className="px-3.5 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer transition-colors"
                    >
                      {isProcessing ? "Deleting..." : "Delete Archive"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStoredRestore(confirmDialog.filename)}
                      disabled={isProcessing}
                      className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer transition-colors"
                    >
                      {isProcessing ? "Restoring..." : "Confirm Restore"}
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          {/* Homelab Info Footer */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-slate-500">
            <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-700">Homelab & Docker Portability:</span>
              <p>
                ScribeNode backups are standard ZIP bundles compatible across any container, VM, or local installation.
                Backups preserve transcripts, audio chunks, custom prompts, and metadata for seamless zero-loss recovery.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
