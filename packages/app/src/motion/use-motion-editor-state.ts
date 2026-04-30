import { useCallback, useEffect, useMemo, useReducer } from "react";
import type {
  AnimationCurve,
  BodyKeypoint,
  FrameBox,
  FrameTransform,
  FrameTransformEdit,
  GenerationJob,
  GenerationProvider,
  KeyframePose,
  MotionProject,
  MotionSegment,
} from "@dreamer/schemas";
import {
  cancelMotionJob,
  createMotionKeyframe,
  createMotionProject,
  createMotionSegment,
  generateMotionSegment,
  getMotionJob,
  renderMotionFrameEdit,
  updateMotionKeyframe,
} from "./api-client";
import { compileMotionPromptPreview } from "./prompt-compiler";

type MotionEditorState = {
  project: MotionProject | null;
  selectedSegmentId: string | null;
  selectedKeyframeId: string | null;
  motionPrompt: string;
  provider: GenerationProvider;
  compiledPrompt: string;
  generationJob: GenerationJob | null;
  resultVideoUrl: string | null;
  busy: "idle" | "uploading" | "creating-segment" | "extracting-frame" | "saving-keypoints" | "rendering-frame" | "generating";
  error: string | null;
};

type MotionEditorAction =
  | { type: "START"; busy: MotionEditorState["busy"] }
  | { type: "ERROR"; error: string }
  | { type: "PROJECT_READY"; project: MotionProject }
  | { type: "SEGMENT_READY"; project: MotionProject; segment: MotionSegment }
  | { type: "SELECT_KEYFRAME"; keyframeId: string }
  | { type: "UPDATE_KEYFRAME_LOCAL"; segmentId: string; keyframe: KeyframePose }
  | { type: "KEYFRAME_SAVED"; project: MotionProject; segment: MotionSegment; keyframe: KeyframePose }
  | { type: "FRAME_EDIT_LOCAL"; segmentId: string; edit: FrameTransformEdit }
  | { type: "FRAME_EDIT_RENDERED"; project: MotionProject; segment: MotionSegment; edit: FrameTransformEdit }
  | { type: "SET_PROMPT"; prompt: string; compiledPrompt: string }
  | { type: "SET_PROVIDER"; provider: GenerationProvider }
  | { type: "GENERATION_STARTED"; job: GenerationJob; segment: MotionSegment; compiledPrompt: string }
  | { type: "JOB_UPDATED"; job: GenerationJob; resultVideoUrl?: string; segment?: MotionSegment }
  | { type: "CLEAR_ERROR" };

const initialState: MotionEditorState = {
  project: null,
  selectedSegmentId: null,
  selectedKeyframeId: null,
  motionPrompt: "",
  provider: "veo",
  compiledPrompt: "",
  generationJob: null,
  resultVideoUrl: null,
  busy: "idle",
  error: null,
};

function reducer(state: MotionEditorState, action: MotionEditorAction): MotionEditorState {
  switch (action.type) {
    case "START":
      return { ...state, busy: action.busy, error: null };
    case "ERROR":
      return { ...state, busy: "idle", error: action.error };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "PROJECT_READY":
      return {
        ...state,
        project: action.project,
        selectedSegmentId: null,
        selectedKeyframeId: null,
        generationJob: null,
        resultVideoUrl: null,
        busy: "idle",
        error: null,
      };
    case "SEGMENT_READY":
      return {
        ...state,
        project: action.project,
        selectedSegmentId: action.segment.id,
        selectedKeyframeId: action.segment.frameEdit?.targetFrameId ?? action.segment.keyframes[0]?.id ?? null,
        generationJob: null,
        resultVideoUrl: null,
        compiledPrompt: compileMotionPromptPreview(action.segment, state.motionPrompt),
        busy: "idle",
        error: null,
      };
    case "SELECT_KEYFRAME":
      return { ...state, selectedKeyframeId: action.keyframeId };
    case "UPDATE_KEYFRAME_LOCAL":
      return {
        ...state,
        project: updateSegmentInProject(state.project, action.segmentId, (segment) => ({
          ...segment,
          keyframes: segment.keyframes.map((frame) =>
            frame.id === action.keyframe.id ? action.keyframe : frame,
          ),
        })),
      };
    case "KEYFRAME_SAVED":
      return {
        ...state,
        project: action.project,
        selectedSegmentId: action.segment.id,
        selectedKeyframeId: action.keyframe.id,
        compiledPrompt: compileMotionPromptPreview(action.segment, state.motionPrompt),
        busy: "idle",
        error: null,
      };
    case "FRAME_EDIT_LOCAL":
      return {
        ...state,
        project: updateSegmentInProject(state.project, action.segmentId, (segment) => ({
          ...segment,
          frameEdit: action.edit,
        })),
        selectedKeyframeId: action.edit.targetFrameId,
        compiledPrompt: compileMotionPromptPreview(
          updateSegmentInProject(state.project, action.segmentId, (segment) => ({
            ...segment,
            frameEdit: action.edit,
          }))?.segments[action.segmentId] ?? null,
          state.motionPrompt,
        ),
      };
    case "FRAME_EDIT_RENDERED":
      return {
        ...state,
        project: action.project,
        selectedSegmentId: action.segment.id,
        compiledPrompt: compileMotionPromptPreview(action.segment, state.motionPrompt),
        busy: "idle",
        error: null,
      };
    case "SET_PROMPT":
      return {
        ...state,
        motionPrompt: action.prompt,
        compiledPrompt: action.compiledPrompt,
      };
    case "SET_PROVIDER":
      return { ...state, provider: action.provider };
    case "GENERATION_STARTED":
      return {
        ...state,
        project: updateSegmentInProject(state.project, action.segment.id, () => action.segment),
        generationJob: action.job,
        compiledPrompt: action.compiledPrompt,
        resultVideoUrl: null,
        busy: "idle",
        error: null,
      };
    case "JOB_UPDATED":
      return {
        ...state,
        generationJob: action.job,
        resultVideoUrl: action.resultVideoUrl ?? state.resultVideoUrl,
        project: action.segment
          ? updateSegmentInProject(state.project, action.segment.id, () => action.segment!)
          : state.project,
      };
  }
}

function updateSegmentInProject(
  project: MotionProject | null,
  segmentId: string,
  update: (segment: MotionSegment) => MotionSegment,
): MotionProject | null {
  if (!project) return project;
  const segment = project.segments[segmentId];
  if (!segment) return project;
  return {
    ...project,
    segments: {
      ...project.segments,
      [segmentId]: update(segment),
    },
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useMotionEditorState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const selectedSegment = useMemo(() => {
    if (!state.project || !state.selectedSegmentId) return null;
    return state.project.segments[state.selectedSegmentId] ?? null;
  }, [state.project, state.selectedSegmentId]);

  const selectedKeyframe = useMemo(() => {
    if (!selectedSegment || !state.selectedKeyframeId) return null;
    return selectedSegment.keyframes.find((frame) => frame.id === state.selectedKeyframeId) ?? null;
  }, [selectedSegment, state.selectedKeyframeId]);

  const uploadVideo = useCallback(async (file: File) => {
    dispatch({ type: "START", busy: "uploading" });
    try {
      const result = await createMotionProject({ file, name: file.name });
      dispatch({ type: "PROJECT_READY", project: result.project });
    } catch (err) {
      dispatch({ type: "ERROR", error: errorMessage(err) });
    }
  }, []);

  const createSegment = useCallback(async (startTimeSeconds: number, endTimeSeconds: number) => {
    if (!state.project) return;
    dispatch({ type: "START", busy: "creating-segment" });
    try {
      const result = await createMotionSegment({
        projectId: state.project.id,
        startTimeSeconds,
        endTimeSeconds,
      });
      dispatch({ type: "SEGMENT_READY", project: result.project, segment: result.segment });
    } catch (err) {
      dispatch({ type: "ERROR", error: errorMessage(err) });
    }
  }, [state.project]);

  const selectKeyframe = useCallback((keyframeId: string) => {
    dispatch({ type: "SELECT_KEYFRAME", keyframeId });
  }, []);

  const extractFrameForEdit = useCallback(async (timeSeconds: number, role: "source" | "target") => {
    if (!selectedSegment) return;
    dispatch({ type: "START", busy: "extracting-frame" });
    try {
      const result = await createMotionKeyframe({
        segmentId: selectedSegment.id,
        timeSeconds,
        role,
      });
      dispatch({ type: "SEGMENT_READY", project: result.project, segment: result.segment });
    } catch (err) {
      dispatch({ type: "ERROR", error: errorMessage(err) });
    }
  }, [selectedSegment]);

  const updateKeyframeLocal = useCallback((keyframe: KeyframePose) => {
    if (!selectedSegment) return;
    dispatch({ type: "UPDATE_KEYFRAME_LOCAL", segmentId: selectedSegment.id, keyframe });
  }, [selectedSegment]);

  const saveKeypoints = useCallback(async (keyframe: KeyframePose, keypoints: BodyKeypoint[]) => {
    dispatch({ type: "START", busy: "saving-keypoints" });
    try {
      const result = await updateMotionKeyframe({
        segmentId: keyframe.segmentId,
        keyframeId: keyframe.id,
        keypoints,
      });
      dispatch({
        type: "KEYFRAME_SAVED",
        project: result.project,
        segment: result.segment,
        keyframe: result.keyframe,
      });
    } catch (err) {
      dispatch({ type: "ERROR", error: errorMessage(err) });
    }
  }, []);

  const setMotionPrompt = useCallback((prompt: string) => {
    dispatch({
      type: "SET_PROMPT",
      prompt,
      compiledPrompt: compileMotionPromptPreview(selectedSegment, prompt),
    });
  }, [selectedSegment]);

  const updateFrameEditLocal = useCallback((edit: FrameTransformEdit) => {
    if (!selectedSegment) return;
    dispatch({ type: "FRAME_EDIT_LOCAL", segmentId: selectedSegment.id, edit });
  }, [selectedSegment]);

	  const renderFrameEdit = useCallback(async (input: {
	    edit: FrameTransformEdit;
	    subjectBox?: FrameBox;
	    transform?: FrameTransform;
	    sourceFrameId?: string;
	    targetFrameId?: string;
	  }) => {
    dispatch({ type: "START", busy: "rendering-frame" });
    try {
	      const result = await renderMotionFrameEdit({
	        editId: input.edit.id,
	        sourceFrameId: input.sourceFrameId ?? input.edit.sourceFrameId,
	        targetFrameId: input.targetFrameId ?? input.edit.targetFrameId,
	        subjectBox: input.subjectBox ?? input.edit.subjectBox,
	        transform: input.transform ?? input.edit.transform,
      });
      dispatch({
        type: "FRAME_EDIT_RENDERED",
        project: result.project,
        segment: result.segment,
        edit: result.edit,
      });
    } catch (err) {
      dispatch({ type: "ERROR", error: errorMessage(err) });
    }
  }, []);

  const generate = useCallback(async (
    extraContext?: string,
    durationSeconds?: 4 | 6 | 8,
    animationCurve?: AnimationCurve,
  ) => {
    if (!selectedSegment) return;
    dispatch({ type: "START", busy: "generating" });
    const prompt = extraContext
      ? `${state.motionPrompt}. Feel: ${extraContext}`.trim()
      : state.motionPrompt;
    try {
      const result = await generateMotionSegment({
        segmentId: selectedSegment.id,
        motionPrompt: prompt,
        provider: state.provider,
        durationSeconds,
        animationCurve,
      });
      dispatch({
        type: "GENERATION_STARTED",
        job: result.job,
        segment: result.segment,
        compiledPrompt: result.compiledPrompt,
      });
    } catch (err) {
      dispatch({ type: "ERROR", error: errorMessage(err) });
    }
  }, [selectedSegment, state.motionPrompt, state.provider]);

  const cancelJob = useCallback(async () => {
    const job = state.generationJob;
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    try {
      const result = await cancelMotionJob(job.id);
      dispatch({ type: "JOB_UPDATED", job: result.job });
    } catch (err) {
      dispatch({ type: "ERROR", error: errorMessage(err) });
    }
  }, [state.generationJob]);

  useEffect(() => {
    const job = state.generationJob;
    const waitingForProvider = job?.status === "queued" || job?.status === "running";
    const waitingForStitch =
      job?.status === "succeeded" &&
      Boolean(state.resultVideoUrl ?? job.resultVideoUrl) &&
      Boolean(selectedSegment) &&
      (!selectedSegment?.stitchedVideoUrl || !selectedSegment?.retimedSegmentUrl);
    if (!job || (!waitingForProvider && !waitingForStitch)) return;

    const JOB_TIMEOUT_MS = waitingForStitch ? 2 * 60 * 1000 : 10 * 60 * 1000;
    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > JOB_TIMEOUT_MS) {
        if (waitingForStitch) {
          dispatch({ type: "ERROR", error: "Stitching timed out. The generated segment is still available." });
        } else {
          dispatch({ type: "ERROR", error: "Generation timed out after 10 minutes." });
        }
        return;
      }
      getMotionJob(job.id)
        .then((result) => {
          dispatch({
            type: "JOB_UPDATED",
            job: result.job,
            resultVideoUrl: result.resultVideoUrl,
            segment: result.segment,
          });
        })
        .catch((err) => {
          dispatch({ type: "ERROR", error: errorMessage(err) });
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedSegment, state.generationJob, state.resultVideoUrl]);

  return {
    state,
    selectedSegment,
    selectedKeyframe,
    uploadVideo,
    createSegment,
    selectKeyframe,
    extractFrameForEdit,
    updateKeyframeLocal,
    saveKeypoints,
    updateFrameEditLocal,
    renderFrameEdit,
    setMotionPrompt,
    setProvider: (provider: GenerationProvider) => dispatch({ type: "SET_PROVIDER", provider }),
    generate,
    cancelJob,
    clearError: () => dispatch({ type: "CLEAR_ERROR" }),
  };
}
