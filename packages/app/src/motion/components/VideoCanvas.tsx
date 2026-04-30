import { forwardRef, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveMotionUrl } from "../api-client";

type VideoCanvasProps = {
  videoUrl?: string;
  busy?: boolean;
  onUpload: (file: File) => void;
  onDurationChange?: (duration: number) => void;
  onTimeUpdate?: (time: number) => void;
};

export const VideoCanvas = forwardRef<HTMLVideoElement, VideoCanvasProps>(
  function VideoCanvas({ videoUrl, busy, onUpload, onDurationChange, onTimeUpdate }, videoRef) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const timeFrameRef = useRef<number | null>(null);
    const [dragActive, setDragActive] = useState(false);

    useEffect(() => {
      return () => {
        if (timeFrameRef.current !== null) window.cancelAnimationFrame(timeFrameRef.current);
      };
    }, []);

    function setVideoRef(node: HTMLVideoElement | null) {
      localVideoRef.current = node;
      if (typeof videoRef === "function") {
        videoRef(node);
      } else if (videoRef) {
        videoRef.current = node;
      }
    }

    function emitVideoTime() {
      const video = localVideoRef.current;
      if (!video) return;
      onTimeUpdate?.(video.currentTime);
    }

    function scheduleVideoTime() {
      if (timeFrameRef.current !== null) return;
      timeFrameRef.current = window.requestAnimationFrame(() => {
        timeFrameRef.current = null;
        emitVideoTime();
      });
    }

    function pickFile(file: File | undefined) {
      if (!file || busy) return;
      onUpload(file);
    }

    if (!videoUrl) {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            pickFile(event.dataTransfer.files[0]);
          }}
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/60 bg-muted/20 px-6 text-center transition-colors",
            dragActive && "border-2 border-foreground/80 bg-accent/40",
            busy && "cursor-not-allowed opacity-60",
          )}
        >
          <Upload className="size-10 text-muted-foreground" />
          <div>
            <p className="text-base text-foreground">Drop a short .mp4 or .mov</p>
            <p className="mt-1 text-xs text-muted-foreground">MVP limit: 250 MB</p>
          </div>
          <span
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md border border-border bg-transparent px-3 text-xs font-medium text-foreground transition-colors",
              !busy && "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Upload className="size-3.5" />
            Choose Video
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,.mov,.m4v"
            className="hidden"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
        </button>
      );
    }

    return (
      <div className="relative h-full overflow-hidden rounded-lg bg-black">
        <video
          ref={setVideoRef}
          src={resolveMotionUrl(videoUrl)}
          controls
          className="h-full w-full object-contain"
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration;
            if (Number.isFinite(duration)) onDurationChange?.(duration);
          }}
          onTimeUpdate={(event) => {
            onTimeUpdate?.(event.currentTarget.currentTime);
          }}
          onSeeking={scheduleVideoTime}
          onSeeked={emitVideoTime}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wider text-white/80 hover:bg-black/80"
        >
          Replace
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mov,.m4v"
          className="hidden"
          onChange={(event) => pickFile(event.target.files?.[0])}
        />
      </div>
    );
  },
);
