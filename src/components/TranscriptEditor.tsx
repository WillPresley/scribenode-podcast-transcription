import React, { useState } from "react";
import { Edit3, Check, X, Loader2, RotateCcw, AlertCircle } from "lucide-react";

interface TranscriptEditorProps {
  initialText: string;
  onSave: (newText: string) => Promise<void>;
  onCancel: () => void;
}

export function TranscriptEditor({ initialText, onSave, onCancel }: TranscriptEditorProps) {
  const [text, setText] = useState<string>(initialText);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const handleSave = async () => {
    if (!text.trim()) {
      setError("Transcript cannot be empty.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await onSave(text);
    } catch (err: any) {
      setError(err.message || "Failed to save transcript changes.");
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden border border-blue-200 shadow-sm">
      {/* Editor Header */}
      <div className="p-3 bg-blue-50/70 border-b border-blue-200/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-xs text-blue-900">Editing Transcript (Markdown)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setText(initialText)}
            className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors flex items-center gap-1 cursor-pointer border border-transparent hover:border-slate-200"
            title="Reset to original text"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-md font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-xs rounded-md shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Editor Textarea */}
      <div className="flex-1 p-3 min-h-[350px]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full h-full p-3 font-mono text-xs text-slate-800 bg-slate-50/50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white resize-none leading-relaxed"
          placeholder="Enter transcript markdown here..."
        />
      </div>

      <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>Lines: {text.split("\n").length}</span>
        <span>Words: {text.split(/\s+/).filter(Boolean).length}</span>
        <span>Characters: {text.length}</span>
      </div>
    </div>
  );
}
