import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  Volume1, 
  VolumeX, 
  X, 
  Radio, 
  Sparkles,
  Sliders,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatPlaybackTime } from '../utils/transcript';
import { TranscribeJob } from '../types';

export interface AudioPlayerProps {
  job: TranscribeJob;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  onClose: () => void;
  followTranscript: boolean;
  onToggleFollow: () => void;
  seekTargetTime?: number | null;
  onSeekHandled?: () => void;
}

const PLAYBACK_RATES = [0.75, 1.0, 1.25, 1.5, 2.0];

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  job,
  currentTime,
  duration,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  onClose,
  followTranscript,
  onToggleFollow,
  seekTargetTime,
  onSeekHandled,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragTime, setDragTime] = useState<number>(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isSynthesizingDemo, setIsSynthesizingDemo] = useState<boolean>(false);
  const synthIntervalRef = useRef<number | null>(null);
  const simulatedTimeRef = useRef<number>(currentTime);

  useEffect(() => {
    simulatedTimeRef.current = currentTime;
  }, [currentTime]);

  const audioUrl = `/api/jobs/${job.id}/audio`;
  const hasAudioFile = job.hasAudioFile !== false;

  // Handle external seek targets (e.g. clicking a timestamp in the transcript)
  useEffect(() => {
    if (seekTargetTime !== undefined && seekTargetTime !== null && audioRef.current) {
      audioRef.current.currentTime = seekTargetTime;
      onTimeUpdate(seekTargetTime);
      if (!isPlaying) {
        audioRef.current.play().catch(err => console.warn("Auto-play error on seek:", err));
      }
      if (onSeekHandled) {
        onSeekHandled();
      }
    }
  }, [seekTargetTime, onSeekHandled, isPlaying, onTimeUpdate]);

  // Sync playback rate to native audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Sync volume to native audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Cleanup synthesizer if unmounted
  useEffect(() => {
    return () => {
      if (synthIntervalRef.current) {
        clearInterval(synthIntervalRef.current);
        synthIntervalRef.current = null;
      }
    };
  }, []);

  // Keyboard shortcut: Space to toggle play/pause (if active element is not an input/textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowLeft' && (e.altKey || e.shiftKey)) {
        e.preventDefault();
        handleJump(-5);
      } else if (e.code === 'ArrowRight' && (e.altKey || e.shiftKey)) {
        e.preventDefault();
        handleJump(5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  const togglePlayPause = useCallback(() => {
    if (audioRef.current && hasAudioFile) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(err => {
          console.warn("Play error:", err);
          setAudioError("Unable to play audio stream.");
        });
      }
    } else {
      // Demo simulated playback for sample items without physical media
      if (isPlaying) {
        if (synthIntervalRef.current) {
          clearInterval(synthIntervalRef.current);
          synthIntervalRef.current = null;
        }
        setIsSynthesizingDemo(false);
        onPlayStateChange(false);
      } else {
        setIsSynthesizingDemo(true);
        onPlayStateChange(true);
        const maxDuration = duration > 0 ? duration : 300;
        synthIntervalRef.current = window.setInterval(() => {
          const nextTime = simulatedTimeRef.current + 0.5 * playbackRate;
          if (nextTime >= maxDuration) {
            if (synthIntervalRef.current) {
              clearInterval(synthIntervalRef.current);
              synthIntervalRef.current = null;
            }
            setIsSynthesizingDemo(false);
            onPlayStateChange(false);
            simulatedTimeRef.current = 0;
            onTimeUpdate(0);
          } else {
            simulatedTimeRef.current = nextTime;
            onTimeUpdate(nextTime);
          }
        }, 500);
      }
    }
  }, [isPlaying, hasAudioFile, duration, playbackRate, onPlayStateChange, onTimeUpdate]);

  const handleJump = (deltaSeconds: number) => {
    if (audioRef.current && hasAudioFile) {
      const newTime = Math.max(0, Math.min(duration || 0, audioRef.current.currentTime + deltaSeconds));
      audioRef.current.currentTime = newTime;
      onTimeUpdate(newTime);
    } else {
      const newTime = Math.max(0, Math.min(duration || 300, currentTime + deltaSeconds));
      simulatedTimeRef.current = newTime;
      onTimeUpdate(newTime);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setDragTime(val);
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleSeekCommit = () => {
    setIsDragging(false);
    if (audioRef.current && hasAudioFile) {
      audioRef.current.currentTime = dragTime;
    }
    onTimeUpdate(dragTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  const displayedTime = isDragging ? dragTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayedTime / duration) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.99 }}
      transition={{ duration: 0.2 }}
      className="bg-slate-900 text-white rounded-xl p-3 sm:p-4 border border-slate-800 shadow-xl flex flex-col gap-2.5 relative select-none"
      id="scribe-audio-player"
    >
      {/* Native HTML5 Audio Tag */}
      {hasAudioFile && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onLoadedMetadata={() => {
            if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
              onDurationChange(audioRef.current.duration);
            }
            setAudioError(null);
          }}
          onTimeUpdate={() => {
            if (audioRef.current && !isDragging) {
              onTimeUpdate(audioRef.current.currentTime);
            }
          }}
          onPlay={() => onPlayStateChange(true)}
          onPause={() => onPlayStateChange(false)}
          onEnded={() => {
            onPlayStateChange(false);
            onTimeUpdate(0);
          }}
          onError={() => {
            setAudioError("Audio stream not available for this record.");
            onPlayStateChange(false);
          }}
        />
      )}

      {/* Header Info & Actions */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 flex items-center justify-center ${isPlaying ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
            <Radio className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Audio Sync</span>
              {!hasAudioFile && (
                <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded text-[9px] font-medium border border-amber-500/30">
                  Sample Preview Mode
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-slate-300 truncate max-w-[200px] sm:max-w-xs md:max-w-md" title={job.filename}>
              {job.filename}
            </p>
          </div>
        </div>

        {/* Right controls: Auto-scroll toggle and close player */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Follow toggle */}
          <button
            type="button"
            onClick={onToggleFollow}
            className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer border ${
              followTranscript 
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 hover:bg-blue-600/30' 
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title={followTranscript ? "Auto-scroll transcript enabled" : "Auto-scroll transcript disabled"}
          >
            <Sparkles className="h-3 w-3 text-blue-400" />
            <span className="hidden sm:inline">Auto-Scroll:</span>
            <span>{followTranscript ? "ON" : "OFF"}</span>
          </button>

          {/* Close & Stop Player */}
          <button
            type="button"
            onClick={() => {
              if (isPlaying) togglePlayPause();
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            title="Stop & Close Audio Player"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar & Timestamps */}
      <div className="space-y-1">
        <div className="relative flex items-center group">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={displayedTime}
            onChange={handleSeekChange}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:h-2.5 transition-all"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, #334155 ${progressPercent}%, #334155 100%)`
            }}
          />
        </div>

        {/* Time stamps display */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="font-semibold text-slate-200">{formatPlaybackTime(displayedTime)}</span>
          <span>{duration > 0 ? formatPlaybackTime(duration) : (job.duration || "--:--")}</span>
        </div>
      </div>

      {/* Main Playback & Media Controls */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
        
        {/* Left: Speed selector button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-md border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            title="Adjust Playback Speed"
          >
            <Sliders className="h-3 w-3 text-slate-400" />
            <span>{playbackRate}x</span>
          </button>

          <AnimatePresence>
            {showSpeedMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                className="absolute bottom-full left-0 mb-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-1 z-30 flex flex-col min-w-[70px]"
              >
                {PLAYBACK_RATES.map(rate => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setPlaybackRate(rate);
                      setShowSpeedMenu(false);
                    }}
                    className={`px-2 py-1 text-left text-[10px] font-bold rounded flex items-center justify-between cursor-pointer ${
                      playbackRate === rate ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span>{rate}x</span>
                    {playbackRate === rate && <Check className="h-2.5 w-2.5" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Center: Play, Pause, Jump -10s, Jump +10s */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Jump -10s */}
          <button
            type="button"
            onClick={() => handleJump(-10)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            title="Rewind 10 seconds"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={togglePlayPause}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-full shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center"
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-white" />
            ) : (
              <Play className="h-4 w-4 fill-white ml-0.5" />
            )}
          </button>

          {/* Jump +10s */}
          <button
            type="button"
            onClick={() => handleJump(10)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            title="Fast forward 10 seconds"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        {/* Right: Volume Slider & Mute Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5 text-slate-400" />
            ) : volume < 0.5 ? (
              <Volume1 className="h-3.5 w-3.5 text-slate-300" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-slate-300" />
            )}
          </button>
          
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-12 sm:w-16 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-300"
            title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
          />
        </div>

      </div>

      {audioError && (
        <div className="text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-lg px-2.5 py-1 flex items-center justify-between">
          <span>{audioError}</span>
          <button
            type="button"
            onClick={() => setAudioError(null)}
            className="text-amber-400 hover:text-amber-200 cursor-pointer text-xs"
          >
            ×
          </button>
        </div>
      )}
    </motion.div>
  );
};
