import { useState, useCallback, useRef, useEffect } from "react";
import { Play, Pause, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useGraph } from "@/store/graph-context";
import { useDockviewApi } from "@/store/dockview-context";
import { createRuntimeLoop, type RuntimeLoop, type RuntimeFrame } from "@/runtime/runtime-loop";

type PlayState = "stopped" | "playing" | "paused";

export function PlayControls() {
  const [playState, setPlayState] = useState<PlayState>("stopped");
  const [frameInfo, setFrameInfo] = useState<{ fps: number; frame: number }>({
    fps: 0,
    frame: 0,
  });
  const { state } = useGraph();
  const dockviewApi = useDockviewApi();
  const loopRef = useRef<RuntimeLoop | null>(null);
  const fpsRef = useRef<{ frames: number; lastCheck: number }>({
    frames: 0,
    lastCheck: performance.now(),
  });

  // Stable refs for current graph state
  const graphRef = useRef(state);
  graphRef.current = state;

  const handleFrame = useCallback((frame: RuntimeFrame) => {
    fpsRef.current.frames++;
    const now = performance.now();
    if (now - fpsRef.current.lastCheck >= 1000) {
      setFrameInfo({
        fps: fpsRef.current.frames,
        frame: frame.frameCount,
      });
      fpsRef.current.frames = 0;
      fpsRef.current.lastCheck = now;
    }
  }, []);

  const handlePlay = useCallback(() => {
    if (playState === "paused" && loopRef.current) {
      loopRef.current.resume();
      setPlayState("playing");
      return;
    }

    const loop = createRuntimeLoop({
      getGraph: () => ({
        nodes: graphRef.current.nodes,
        edges: graphRef.current.edges,
      }),
      onFrame: handleFrame,
    });

    loopRef.current = loop;
    loop.start();
    setPlayState("playing");

    // Auto-open viewport panel
    if (dockviewApi) {
      const existing = dockviewApi.getPanel("viewport");
      if (existing) {
        existing.focus();
      } else {
        const canvasPanel = dockviewApi.getPanel("canvas");
        dockviewApi.addPanel({
          id: "viewport",
          component: "viewport",
          title: "Viewport",
          position: canvasPanel
            ? { referencePanel: canvasPanel, direction: "within" }
            : { direction: "right" },
        });
      }
    }
  }, [playState, handleFrame, dockviewApi]);

  const handlePause = useCallback(() => {
    loopRef.current?.pause();
    setPlayState("paused");
  }, []);

  const handleStop = useCallback(() => {
    loopRef.current?.stop();
    loopRef.current = null;
    setPlayState("stopped");
    setFrameInfo({ fps: 0, frame: 0 });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      loopRef.current?.stop();
    };
  }, []);

  return (
    <div className="flex items-center gap-1">
      {playState === "playing" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={handlePause} />
            }
          >
            <Pause className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Pause</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" onClick={handlePlay} />
            }
          >
            <Play className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>
            {playState === "paused" ? "Resume" : "Play"}
          </TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStop}
              disabled={playState === "stopped"}
            />
          }
        >
          <Square className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>Stop</TooltipContent>
      </Tooltip>

      {playState !== "stopped" && (
        <span className="text-[10px] text-neutral-400 ml-1 tabular-nums">
          {frameInfo.fps} fps
        </span>
      )}
    </div>
  );
}
