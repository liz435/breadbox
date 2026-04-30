import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionSegment } from "@dreamer/schemas";
import { MotionEditorShell } from "./components/MotionEditorShell";
import { VideoCanvas } from "./components/VideoCanvas";
import { TimelineStrip } from "./components/TimelineStrip";
import { MotionPromptPanel } from "./components/MotionPromptPanel";
import { GenerationResultPanel } from "./components/GenerationResultPanel";
import { useMotionEditorState } from "./use-motion-editor-state";
import { getComfyProviderHealth, getVeoProviderHealth } from "./api-client";

type VeoStatusState = {
  status: "idle" | "checking" | "ok" | "error";
  message: string;
  model?: string;
};

type ComfyStatusState = {
  status: "idle" | "checking" | "ok" | "error";
  message: string;
};

export function MotionEditorPage() {
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>(undefined);
  const [generationDuration, setGenerationDuration] = useState<4 | 6 | 8>(4);
  const [springTension, setSpringTension] = useState(0.2);
  const [springBounce, setSpringBounce] = useState(0);
  const [subjectDescription, setSubjectDescription] = useState("");
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | undefined>(undefined);
  const [veoStatus, setVeoStatus] = useState<VeoStatusState>({
    status: "idle",
    message: "Waiting to check Veo API",
  });
  const [comfyStatus, setComfyStatus] = useState<ComfyStatusState>({
    status: "idle",
    message: "Waiting to check ComfyUI",
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const seekFrameRef = useRef<number | null>(null);
  const [videoTime, setVideoTime] = useState(0);

  function handleVideoTimeUpdate(time: number) {
    setVideoTime(time);
  }

  function seekVideo(time: number) {
    const video = videoRef.current;
    if (video && Math.abs(video.currentTime - time) > 0.002) {
      video.currentTime = time;
    }
  }

  function handleTimelineSeek(time: number, mode: "preview" | "commit" = "commit") {
    pendingSeekRef.current = time;
    if (mode === "commit") {
      setVideoTime(time);
      if (seekFrameRef.current !== null) {
        window.cancelAnimationFrame(seekFrameRef.current);
        seekFrameRef.current = null;
      }
      seekVideo(time);
      return;
    }

    if (seekFrameRef.current !== null) return;
    seekFrameRef.current = window.requestAnimationFrame(() => {
      seekFrameRef.current = null;
      const nextTime = pendingSeekRef.current;
      if (nextTime !== null) {
        setVideoTime(nextTime);
        seekVideo(nextTime);
      }
    });
  }

  useEffect(() => {
    return () => {
      if (seekFrameRef.current !== null) window.cancelAnimationFrame(seekFrameRef.current);
    };
  }, []);

  const {
    state,
    selectedSegment,
    uploadVideo,
    createSegment,
    selectKeyframe,
    extractFrameForEdit,
    updateFrameEditLocal,
    setMotionPrompt,
    setProvider,
    prepareComfyGuidance,
    generate,
    cancelJob,
    clearError,
  } = useMotionEditorState();

  const keyframes = selectedSegment?.keyframes ?? [];
  const frameEdit = selectedSegment?.frameEdit ?? null;
  const timelineSegment = useMemo<MotionSegment | null>(() => {
    if (!state.project || !durationSeconds || durationSeconds <= 0) return null;
    const createdAt = state.project.createdAt;
    return {
      id: `source-${state.project.id}-${durationSeconds.toFixed(3)}`,
      projectId: state.project.id,
      startTimeSeconds: 0,
      endTimeSeconds: durationSeconds,
      sourceSegmentUrl: state.project.sourceVideoUrl,
      keyframes: [],
      motionPrompt: "",
      status: "ready",
      createdAt,
      updatedAt: createdAt,
    };
  }, [durationSeconds, state.project]);

  const generationActive =
    state.generationJob?.status === "queued" || state.generationJob?.status === "running";

  const handleRangeCommit = useCallback((sourceTimeSeconds: number, targetTimeSeconds: number) => {
    if (!state.project || state.busy === "creating-segment") return;
    const start = Math.max(0, Math.min(sourceTimeSeconds, targetTimeSeconds));
    const end = Math.min(durationSeconds ?? targetTimeSeconds, Math.max(sourceTimeSeconds, targetTimeSeconds));
    if (end - start < 0.05) return;
    if (
      selectedSegment &&
      Math.abs(selectedSegment.startTimeSeconds - start) < 0.01 &&
      Math.abs(selectedSegment.endTimeSeconds - end) < 0.01
    ) {
      return;
    }
    void createSegment(start, Math.min(end, start + 4));
  }, [createSegment, durationSeconds, selectedSegment, state.busy, state.project]);

  const checkVeoHealth = useCallback(async () => {
    setVeoStatus((prev) => ({ ...prev, status: "checking", message: "Checking Veo API…" }));
    try {
      const health = await getVeoProviderHealth({ live: true });
      setVeoStatus({
        status: health.ok ? "ok" : "error",
        message: health.message,
        model: health.model,
      });
    } catch (err) {
      setVeoStatus({
        status: "error",
        message: err instanceof Error ? err.message : "Veo API check failed",
      });
    }
  }, []);

  const checkComfyHealth = useCallback(async () => {
    setComfyStatus((prev) => ({ ...prev, status: "checking", message: "Checking ComfyUI…" }));
    try {
      const health = await getComfyProviderHealth({ live: true });
      setComfyStatus({
        status: health.ok ? "ok" : "error",
        message: health.message,
      });
    } catch (err) {
      setComfyStatus({
        status: "error",
        message: err instanceof Error ? err.message : "ComfyUI check failed",
      });
    }
  }, []);

  useEffect(() => {
    if (state.provider === "veo") {
      void checkVeoHealth();
      return;
    }
    setVeoStatus({ status: "idle", message: "Veo API check is only shown for Veo provider" });
  }, [state.provider, checkVeoHealth]);

  useEffect(() => {
    if (state.provider === "comfyui") {
      void checkComfyHealth();
      return;
    }
    setComfyStatus({ status: "idle", message: "ComfyUI check is only shown for ComfyUI provider" });
  }, [state.provider, checkComfyHealth]);

  return (
    <MotionEditorShell
      error={
        state.error ? (
          <div className="flex shrink-0 items-center justify-between border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              <span>{state.error}</span>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={clearError}>
              <X className="size-3.5" />
            </Button>
          </div>
        ) : null
      }
      canvas={
        <VideoCanvas
          ref={videoRef}
          videoUrl={previewVideoUrl ?? state.project?.sourceVideoUrl}
          busy={state.busy === "uploading"}
          onUpload={uploadVideo}
          onDurationChange={setDurationSeconds}
          onTimeUpdate={handleVideoTimeUpdate}
        />
      }
      controls={
        <div className="flex flex-col gap-0">
          <TimelineStrip
            segment={timelineSegment}
            keyframes={keyframes}
            frameEdit={frameEdit}
            selectedKeyframeId={frameEdit?.targetFrameId ?? state.selectedKeyframeId}
            sourceVideoUrl={state.project?.sourceVideoUrl}
            maxRangeSeconds={4}
            disabled={!state.project || !durationSeconds}
            busy={state.busy === "extracting-frame" || state.busy === "creating-segment"}
            externalCurrentTime={videoTime}
            onSeek={handleTimelineSeek}
            onRangeCommit={handleRangeCommit}
            onExtractFrame={(timeSeconds, role) => {
              if (selectedSegment) void extractFrameForEdit(timeSeconds, role);
            }}
            onSelect={(keyframeId) => {
              selectKeyframe(keyframeId);
              if (frameEdit) {
                updateFrameEditLocal({
                  ...frameEdit,
                  targetFrameId: keyframeId,
                  renderedFrameUrl: undefined,
                  maskUrl: undefined,
                  comfyTargetFrameUrl: undefined,
                });
              }
            }}
          />
        </div>
      }
      sidebar={
        <>
          <MotionPromptPanel
            value={state.motionPrompt}
            subjectDescription={subjectDescription}
            provider={state.provider}
            durationSeconds={generationDuration}
            springTension={springTension}
            springBounce={springBounce}
            disabled={!selectedSegment}
            generateDisabled={!selectedSegment || !selectedSegment.frameEdit?.sourceFrameId}
            generating={state.busy === "generating" || generationActive}
            veoHealth={veoStatus}
            comfyHealth={comfyStatus}
            onCheckVeoHealth={checkVeoHealth}
            onCheckComfyHealth={checkComfyHealth}
            onChange={setMotionPrompt}
            onSubjectChange={setSubjectDescription}
            onProviderChange={setProvider}
            onDurationChange={setGenerationDuration}
            onSpringChange={(tension, bounce) => {
              setSpringTension(tension);
              setSpringBounce(bounce);
            }}
            onGenerate={() =>
              generate(undefined, generationDuration, {
                springCurve: { tension: springTension, bounce: springBounce },
                subjectDescription,
              })
            }
          />
          <GenerationResultPanel
            job={state.generationJob}
            resultVideoUrl={state.resultVideoUrl}
            originalVideoUrl={selectedSegment?.sourceSegmentUrl}
            retimedSegmentUrl={selectedSegment?.retimedSegmentUrl}
            rifeSegmentUrl={selectedSegment?.rifeSegmentUrl}
            motionPreviewUrl={selectedSegment?.motionPreviewUrl}
            stitchedVideoUrl={selectedSegment?.stitchedVideoUrl}
            comfyPipeline={selectedSegment?.comfyPipeline}
            stitching={
              state.generationJob?.status === "succeeded" &&
              Boolean(state.resultVideoUrl) &&
              (!selectedSegment?.stitchedVideoUrl || !selectedSegment?.retimedSegmentUrl)
            }
            preparingComfy={state.busy === "preparing-comfy"}
            onPrepareComfy={prepareComfyGuidance}
            onLoadStitched={() => setPreviewVideoUrl(selectedSegment?.stitchedVideoUrl)}
            onCancelJob={cancelJob}
          />
        </>
      }
    />
  );
}
