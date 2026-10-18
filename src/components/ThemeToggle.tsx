import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { ThemeMode } from '../types';
import { HEADER_CONTROL_TOKENS } from '../utils/uiTokens';

export interface ThemeToggleProps {
  currentMode: ThemeMode;
  onSelectMode: (mode: ThemeMode) => void;
  variant?: 'header' | 'drawer';
}

export interface ThemeOption {
  mode: ThemeMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { mode: 'light', label: 'Light', icon: Sun, description: 'Crisp light mode' },
  { mode: 'dark', label: 'Dark', icon: Moon, description: 'Deep slate dark mode' },
  { mode: 'system', label: 'System', icon: Monitor, description: 'Follows operating system' }
];

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  currentMode,
  onSelectMode,
  variant = 'header'
}) => {
  if (variant === 'drawer') {
    return (
      <div className="w-full space-y-1.5" role="radiogroup" aria-label="Theme selection">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
          <span>Theme</span>
          <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500 capitalize">
            {currentMode}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
          {THEME_OPTIONS.map(({ mode, label, icon: Icon, description }) => {
            const isSelected = currentMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={isSelected}
                title={description}
                onClick={() => onSelectMode(mode)}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold border border-slate-200/60 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 transition-colors ${
                    isSelected
                      ? mode === 'light'
                        ? 'text-amber-500'
                        : mode === 'dark'
                          ? 'text-indigo-400'
                          : 'text-blue-500'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Header variant (compact desktop segmented control aligned to HEADER_CONTROL_TOKENS)
  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className={`inline-flex items-center p-0.5 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/90 transition-colors ${HEADER_CONTROL_TOKENS.height} ${HEADER_CONTROL_TOKENS.radius} ${HEADER_CONTROL_TOKENS.shadow}`}
    >
      {THEME_OPTIONS.map(({ mode, label, icon: Icon, description }) => {
        const isSelected = currentMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${label} theme: ${description}`}
            title={`${label} theme (${description})`}
            onClick={() => onSelectMode(mode)}
            className={`relative h-full flex items-center justify-center gap-1 px-1.5 sm:px-2 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isSelected
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold border border-slate-200/70 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/40'
            }`}
          >
            <Icon
              className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                isSelected
                  ? mode === 'light'
                    ? 'text-amber-500'
                    : mode === 'dark'
                      ? 'text-indigo-400'
                      : 'text-blue-500'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span className="hidden xl:inline text-[11px] leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
export type { ThemeMode };
