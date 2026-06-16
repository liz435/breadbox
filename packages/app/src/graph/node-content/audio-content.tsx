import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, Square } from "lucide-react";
import type { GraphNode } from "@dreamer/schemas";

type AudioContentProps = {
  node: GraphNode;
};

export function AudioContent({ node }: AudioContentProps) {
  const fileName =
    typeof node.data.fileName === "string" ? node.data.fileName : null;
  const uri = typeof node.data.uri === "string" ? node.data.uri : null;
  const volume =
    typeof node.data.volume === "number" ? node.data.volume : 1.0;
  const loop = node.data.loop === true;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef<number>(0);

  // Clean up audio on unmount or URI change
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [uri]);

  const getOrCreateAudio = useCallback(() => {
    if (!uri) return null;
    if (!audioRef.current || audioRef.current.src !== uri) {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(uri);
      audio.volume = volume;
      audio.loop = loop;
      audio.addEventListener("loadedmetadata", () => {
        setDuration(audio.duration);
      });
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(0);
        cancelAnimationFrame(rafRef.current);
      });
      audioRef.current = audio;
    }
    return audioRef.current;
  }, [uri, volume, loop]);

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      setProgress(audio.currentTime);
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const handlePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const audio = getOrCreateAudio();
      if (!audio) return;
      audio.play().then(() => {
        setIsPlaying(true);
        rafRef.current = requestAnimationFrame(updateProgress);
      }).catch(() => {
        // autoplay blocked
      });
    },
    [getOrCreateAudio, updateProgress],
  );

  const handlePause = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      audioRef.current?.pause();
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const handleStop = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setProgress(0);
      cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="px-2 py-1">
      {fileName ? (
        <div className="text-[10px] text-foreground truncate mb-1">
          {fileName}
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground italic mb-1">
          No audio file
        </div>
      )}

      {/* Waveform / progress bar */}
      <div className="h-6 bg-background rounded border border-border flex items-center px-1 gap-1 relative overflow-hidden">
        {/* Progress fill */}
        {uri && (
          <div
            className="absolute inset-y-0 left-0 bg-pink-500/15 transition-[width] duration-100"
            style={{ width: `${progressPct}%` }}
          />
        )}
        {/* Waveform bars */}
        <div className="flex items-center gap-px flex-1 h-4 relative z-10">
          {Array.from({ length: 24 }).map((_, i) => {
            const h = Math.sin(i * 0.5) * 0.5 + 0.5;
            const filled = uri ? (i / 24) * 100 < progressPct : false;
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm ${filled ? "bg-pink-400 opacity-80" : "bg-pink-500 opacity-30"}`}
                style={{ height: `${h * 100}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 mt-1">
        {uri && (
          <>
            {isPlaying ? (
              <button
                type="button"
                className="p-0.5 rounded hover:bg-muted text-foreground transition-colors"
                onClick={handlePause}
              >
                <Pause className="size-3" />
              </button>
            ) : (
              <button
                type="button"
                className="p-0.5 rounded hover:bg-muted text-foreground transition-colors"
                onClick={handlePlay}
              >
                <Play className="size-3" />
              </button>
            )}
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted text-foreground transition-colors"
              onClick={handleStop}
            >
              <Square className="size-2.5" />
            </button>
            {duration > 0 && (
              <span className="text-[9px] text-muted-foreground ml-auto">
                {formatTime(progress)}/{formatTime(duration)}
              </span>
            )}
          </>
        )}
        {!uri && (
          <div className="flex justify-between flex-1 text-[9px] text-muted-foreground">
            <span>Vol: {Math.round(volume * 100)}%</span>
            {loop && <span>Loop</span>}
          </div>
        )}
      </div>
    </div>
  );
}
