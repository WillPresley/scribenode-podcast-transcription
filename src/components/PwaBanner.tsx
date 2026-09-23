import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

interface PwaBannerProps {
  isInstallable: boolean;
  isOffline: boolean;
  onInstall: () => void;
}

export const PwaBanner: React.FC<PwaBannerProps> = ({
  isInstallable,
  isOffline,
  onInstall
}) => {
  const [installDismissed, setInstallDismissed] = useState(false);

  return (
    <>
      {/* Offline Status Alert */}
      {isOffline && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 text-amber-200 text-xs sm:text-sm flex items-center justify-between transition-all">
          <div className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span>
              <strong>Offline Mode:</strong> You are currently offline. You can view, search, and export existing transcripts. Creating new transcriptions requires internet.
            </span>
          </div>
        </div>
      )}

      {/* PWA Install Invitation Banner */}
      {isInstallable && !installDismissed && (
        <div className="bg-gradient-to-r from-blue-950/60 to-slate-900/90 border-b border-blue-500/20 px-4 py-2 text-xs sm:text-sm flex items-center justify-between text-slate-200 shadow-sm backdrop-blur-md">
          <div className="flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-md bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
              <Download className="w-3.5 h-3.5" />
            </div>
            <span>
              Install <strong>ScribeNode</strong> as a desktop or mobile application for instant launch and standalone window experience.
            </span>
          </div>
          <div className="flex items-center space-x-2 ml-3 shrink-0">
            <button
              onClick={onInstall}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-md shadow transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Install</span>
            </button>
            <button
              onClick={() => setInstallDismissed(true)}
              className="p-1 text-slate-400 hover:text-slate-200 transition rounded hover:bg-slate-800/60 cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss install banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
