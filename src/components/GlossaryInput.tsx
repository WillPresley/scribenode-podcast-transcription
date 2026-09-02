import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Sparkles, Tag, X } from "lucide-react";

interface GlossaryInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function GlossaryInput({ value, onChange }: GlossaryInputProps) {
  const [isOpen, setIsOpen] = useState<boolean>(Boolean(value.trim()));

  const termsCount = value
    ? value.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean).length
    : 0;

  return (
    <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-3.5 space-y-2.5">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
          <div>
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              Custom Glossary & Vocabulary Hints
              {termsCount > 0 && (
                <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-800 text-[9px] font-mono rounded font-extrabold">
                  {termsCount} {termsCount === 1 ? "term" : "terms"}
                </span>
              )}
            </span>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Guide the AI model to accurately spell domain acronyms, technical terms, and speaker names.
            </p>
          </div>
        </div>
        <div className="text-slate-400 p-1">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="space-y-2 pt-1 border-t border-slate-200/60">
          <div className="relative">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="e.g. Kubernetes, eBPF, Cilium, Satya Nadella, LLVM, ScribeNode, PyTorch"
              rows={2}
              className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none leading-relaxed resize-y"
            />
            {value.trim() && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                title="Clear glossary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3 text-indigo-400" />
              Separate terms with commas, semicolons, or line breaks.
            </span>
            <span className="font-mono">{termsCount} terms</span>
          </div>
        </div>
      )}
    </div>
  );
}
