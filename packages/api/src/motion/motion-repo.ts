import { join } from "path";
import { mkdir, readdir } from "fs/promises";
import {
  generationJobSchema,
  motionProjectSchema,
  type AnimationCurve,
  type BodyKeypoint,
  type ComfyPipeline,
  type ComfyPipelineStep,
  type FrameTransformEdit,
  type GenerationJob,
  type GenerationProvider,
  type KeyframePose,
  type MotionProject,
  type MotionSegment,
} from "@dreamer/schemas";
import { motionJobsDir, motionProjectsDir } from "../paths";
import { createDefaultBodyKeypoints } from "./body-keypoints";
import { checkComfyUiHealth, comfyPrepTimeoutMs, comfyUiUrl } from "./comfyui-client";
import {
  applyRifeBookendTransitions,
  artifactPathFromUrl,
  artifactUrl,
  cutVideoSegment,
  ensureMotionArtifactDir,
  extensionFromName,
  extractVideoFrame,
  getVideoInfo,
  renderRifeInterpolationClip,
  renderSubjectBoxMask,
  renderTransformedFrame,
  retimeGeneratedSegment,
  stitchVideoSegment,
} from "./video-utils";

export class MotionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MotionValidationError";
  }
}

function now(): string {
  return new Date().toISOString();
}

function createId(): string {
  return crypto.randomUUID();
}

type ComfyPipelineStepName = keyof ComfyPipeline;
const stitchLocks = new Map<
  string,
  Promise<{ project: MotionProject; segment: MotionSegment; stitchedVideoUrl: string } | null>
>();

function withComfyStep(
  segment: MotionSegment,
  stepName: ComfyPipelineStepName,
  step: Omit<ComfyPipelineStep, "updatedAt">,
): MotionSegment {
  return {
    ...segment,
    comfyPipeline: {
      ...segment.comfyPipeline,
      [stepName]: {
        ...step,
        updatedAt: now(),
      },
    },
    updatedAt: now(),
  };
}

async function saveSegment(project: MotionProject, segment: MotionSegment): Promise<void> {
  project.segments[segment.id] = segment;
  project.updatedAt = now();
  await writeProjectRaw(project);
}

function projectPath(projectId: string): string {
  return join(motionProjectsDir(), `${projectId}.json`);
}

function jobPath(jobId: string): string {
  return join(motionJobsDir(), `${jobId}.json`);
}

async function ensureMotionDirs(): Promise<void> {
  await mkdir(motionProjectsDir(), { recursive: true });
  await mkdir(motionJobsDir(), { recursive: true });
}

async function readProjectRaw(projectId: string): Promise<MotionProject | null> {
  const file = Bun.file(projectPath(projectId));
  if (!(await file.exists())) return null;
  const parsed = motionProjectSchema.safeParse(await file.json());
  return parsed.success ? parsed.data : null;
}

async function writeProjectRaw(project: MotionProject): Promise<void> {
  await ensureMotionDirs();
  await Bun.write(projectPath(project.id), JSON.stringify(project, null, 2));
}

async function readProject(projectId: string, ownerId: string): Promise<MotionProject | null> {
  const project = await readProjectRaw(projectId);
  if (!project || project.ownerId !== ownerId) return null;
  return project;
}

async function listProjectFiles(): Promise<string[]> {
  try {
    const files = await readdir(motionProjectsDir());
    return files.filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
}

async function findProjectBySegment(
  ownerId: string,
  segmentId: string,
): Promise<{ project: MotionProject; segment: MotionSegment } | null> {
  const files = await listProjectFiles();
  for (const file of files) {
    const projectId = file.slice(0, -".json".length);
    const project = await readProject(projectId, ownerId);
    const segment = project?.segments[segmentId];
    if (project && segment) return { project, segment };
  }
  return null;
}

async function createProjectFromUpload(input: {
  ownerId: string;
  name?: string;
  file: File;
}): Promise<MotionProject> {
  await ensureMotionDirs();
  const id = createId();
  const createdAt = now();
  const ext = extensionFromName(input.file.name);
  const filename = `${id}-source.${ext}`;
  const artifactDir = await ensureMotionArtifactDir(id);
  const buffer = await input.file.arrayBuffer();
  await Bun.write(join(artifactDir, filename), buffer);

  const project: MotionProject = {
    id,
    ownerId: input.ownerId,
    name: input.name?.trim() || input.file.name || "Motion Project",
    sourceVideoUrl: artifactUrl(id, filename),
    sourceVideoMimeType: input.file.type || "application/octet-stream",
    segments: {},
    createdAt,
    updatedAt: createdAt,
  };
  await writeProjectRaw(project);
  return project;
}

async function createSegment(input: {
  ownerId: string;
  projectId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
}): Promise<{ project: MotionProject; segment: MotionSegment }> {
  if (input.endTimeSeconds <= input.startTimeSeconds) {
    throw new MotionValidationError("End time must be after start time");
  }
  if (input.endTimeSeconds - input.startTimeSeconds > 4) {
    throw new MotionValidationError("S/T ranges longer than 4 seconds are not supported");
  }

  const project = await readProject(input.projectId, input.ownerId);
  if (!project) throw new MotionValidationError("Project not found");

  const segmentId = createId();
  const createdAt = now();
  const middleTime = input.startTimeSeconds + (input.endTimeSeconds - input.startTimeSeconds) / 2;
  const keyframeInputs = [
    { label: "start" as const, timeSeconds: input.startTimeSeconds },
    { label: "middle" as const, timeSeconds: middleTime },
    { label: "end" as const, timeSeconds: input.endTimeSeconds },
  ];

  const artifactDir = await ensureMotionArtifactDir(project.id);
  const sourcePath = artifactPathFromUrl(project.id, project.sourceVideoUrl);
  if (!sourcePath) throw new MotionValidationError("Source video artifact is invalid");

  const segmentFilename = `${segmentId}-source.mp4`;
  await cutVideoSegment({
    sourcePath,
    outputPath: join(artifactDir, segmentFilename),
    startTimeSeconds: input.startTimeSeconds,
    durationSeconds: input.endTimeSeconds - input.startTimeSeconds,
  });

  const keyframes: KeyframePose[] = [];
  for (const frame of keyframeInputs) {
    const id = createId();
    const filename = `${segmentId}-${frame.label}.jpg`;
    await extractVideoFrame({
      sourcePath,
      outputPath: join(artifactDir, filename),
      timeSeconds: frame.timeSeconds,
    });
    keyframes.push({
      id,
      segmentId,
      label: frame.label,
      timeSeconds: frame.timeSeconds,
      imageUrl: artifactUrl(project.id, filename),
      keypoints: createDefaultBodyKeypoints(),
    });
  }
  const startFrame = keyframes.find((frame) => frame.label === "start");
  const endFrame = keyframes.find((frame) => frame.label === "end");
  if (!startFrame || !endFrame) {
    throw new MotionValidationError("Could not create start and end frames");
  }
  const frameEdit: FrameTransformEdit = {
    id: createId(),
    segmentId,
    sourceFrameId: startFrame.id,
    targetFrameId: endFrame.id,
    subjectBox: {
      x: 0.35,
      y: 0.2,
      width: 0.3,
      height: 0.58,
    },
    transform: {
      translateX: 0,
      translateY: -0.12,
      scale: 1,
      rotateDeg: 0,
    },
    createdAt,
    updatedAt: createdAt,
  };

  const segment: MotionSegment = {
    id: segmentId,
    projectId: project.id,
    startTimeSeconds: input.startTimeSeconds,
    endTimeSeconds: input.endTimeSeconds,
    sourceSegmentUrl: artifactUrl(project.id, segmentFilename),
    keyframes,
    frameEdit,
    motionPrompt: "",
    status: "ready",
    createdAt,
    updatedAt: createdAt,
  };

  project.segments[segment.id] = segment;
  project.updatedAt = now();
  await writeProjectRaw(project);
  return { project, segment };
}

async function createKeyframe(input: {
  ownerId: string;
  segmentId: string;
  timeSeconds: number;
  role?: "source" | "target";
}): Promise<{ project: MotionProject; segment: MotionSegment; keyframe: KeyframePose } | null> {
  const found = await findProjectBySegment(input.ownerId, input.segmentId);
  if (!found) return null;

  if (
    input.timeSeconds < found.segment.startTimeSeconds ||
    input.timeSeconds > found.segment.endTimeSeconds
  ) {
    throw new MotionValidationError(
      `Frame time must be within the segment (${found.segment.startTimeSeconds.toFixed(2)}s to ${found.segment.endTimeSeconds.toFixed(2)}s)`,
    );
  }

  if (input.role && found.segment.frameEdit) {
    const existingRoleKeyframeId =
      input.role === "source"
        ? found.segment.frameEdit.sourceFrameId
        : found.segment.frameEdit.targetFrameId;
    const existingRoleKeyframe = found.segment.keyframes.find(
      (frame) => frame.id === existingRoleKeyframeId,
    );
    if (existingRoleKeyframe) {
      if (Math.abs(existingRoleKeyframe.timeSeconds - input.timeSeconds) < 0.005) {
        return {
          project: found.project,
          segment: found.segment,
          keyframe: existingRoleKeyframe,
        };
      }

      const sourcePath = artifactPathFromUrl(found.project.id, found.project.sourceVideoUrl);
      if (!sourcePath) throw new MotionValidationError("Source video artifact is invalid");

      const artifactDir = await ensureMotionArtifactDir(found.project.id);
      const existingFilename = artifactPathFromUrl(found.project.id, existingRoleKeyframe.imageUrl);
      if (!existingFilename) throw new MotionValidationError("Keyframe artifact is invalid");

      await extractVideoFrame({
        sourcePath,
        outputPath: existingFilename,
        timeSeconds: input.timeSeconds,
      });

      const nowIso = now();
      const updatedKeyframe: KeyframePose = {
        ...existingRoleKeyframe,
        timeSeconds: input.timeSeconds,
      };
      const nextKeyframes = found.segment.keyframes
        .map((frame) => (frame.id === updatedKeyframe.id ? updatedKeyframe : frame))
        .sort((a, b) => a.timeSeconds - b.timeSeconds);
      const frameEdit: FrameTransformEdit = {
        ...found.segment.frameEdit,
        renderedFrameUrl: undefined,
        maskUrl: undefined,
        comfyTargetFrameUrl: undefined,
        updatedAt: nowIso,
      };
      const segment: MotionSegment = {
        ...found.segment,
        keyframes: nextKeyframes,
        frameEdit,
        updatedAt: nowIso,
      };
      found.project.segments[segment.id] = segment;
      found.project.updatedAt = nowIso;
      await writeProjectRaw(found.project);
      return { project: found.project, segment, keyframe: updatedKeyframe };
    }
  }

  const existingKeyframe = found.segment.keyframes.find(
    (frame) => Math.abs(frame.timeSeconds - input.timeSeconds) < 0.005,
  );
  if (existingKeyframe) {
    const nowIso = now();
    const frameEdit = found.segment.frameEdit && input.role
      ? {
        ...found.segment.frameEdit,
        sourceFrameId: input.role === "source" ? existingKeyframe.id : found.segment.frameEdit.sourceFrameId,
        targetFrameId: input.role === "target" ? existingKeyframe.id : found.segment.frameEdit.targetFrameId,
        renderedFrameUrl: undefined,
        maskUrl: undefined,
        comfyTargetFrameUrl: undefined,
        updatedAt: nowIso,
      }
      : found.segment.frameEdit;
    const segment: MotionSegment = {
      ...found.segment,
      frameEdit,
      updatedAt: input.role ? nowIso : found.segment.updatedAt,
    };
    if (input.role) {
      found.project.segments[segment.id] = segment;
      found.project.updatedAt = nowIso;
      await writeProjectRaw(found.project);
    }
    return { project: found.project, segment, keyframe: existingKeyframe };
  }

  const sourcePath = artifactPathFromUrl(found.project.id, found.project.sourceVideoUrl);
  if (!sourcePath) throw new MotionValidationError("Source video artifact is invalid");

  const id = createId();
  const artifactDir = await ensureMotionArtifactDir(found.project.id);
  const filename = `${found.segment.id}-custom-${id}.jpg`;
  await extractVideoFrame({
    sourcePath,
    outputPath: join(artifactDir, filename),
    timeSeconds: input.timeSeconds,
  });

  const keyframe: KeyframePose = {
    id,
    segmentId: found.segment.id,
    label: "custom",
    timeSeconds: input.timeSeconds,
    imageUrl: artifactUrl(found.project.id, filename),
    keypoints: createDefaultBodyKeypoints(),
  };

  const nextKeyframes = [...found.segment.keyframes, keyframe].sort(
    (a, b) => a.timeSeconds - b.timeSeconds,
  );
  const nowIso = now();
  const frameEdit = found.segment.frameEdit && input.role
    ? {
      ...found.segment.frameEdit,
      sourceFrameId: input.role === "source" ? keyframe.id : found.segment.frameEdit.sourceFrameId,
      targetFrameId: input.role === "target" ? keyframe.id : found.segment.frameEdit.targetFrameId,
      renderedFrameUrl: undefined,
      maskUrl: undefined,
      comfyTargetFrameUrl: undefined,
      updatedAt: nowIso,
    }
    : found.segment.frameEdit;

  const segment: MotionSegment = {
    ...found.segment,
    keyframes: nextKeyframes,
    frameEdit,
    updatedAt: nowIso,
  };
  found.project.segments[segment.id] = segment;
  found.project.updatedAt = nowIso;
  await writeProjectRaw(found.project);
  return { project: found.project, segment, keyframe };
}

async function findProjectByFrameEdit(
  ownerId: string,
  editId: string,
): Promise<{ project: MotionProject; segment: MotionSegment; edit: FrameTransformEdit } | null> {
  const files = await listProjectFiles();
  for (const file of files) {
    const projectId = file.slice(0, -".json".length);
    const project = await readProject(projectId, ownerId);
    if (!project) continue;
    for (const segment of Object.values(project.segments)) {
      if (segment.frameEdit?.id === editId) {
        return { project, segment, edit: segment.frameEdit };
      }
    }
  }
  return null;
}

async function updateFrameEdit(input: {
  ownerId: string;
  editId: string;
  sourceFrameId?: string;
  targetFrameId?: string;
  subjectBox?: FrameTransformEdit["subjectBox"];
  transform?: FrameTransformEdit["transform"];
}): Promise<{ project: MotionProject; segment: MotionSegment; edit: FrameTransformEdit } | null> {
  const found = await findProjectByFrameEdit(input.ownerId, input.editId);
  if (!found) return null;

  if (input.sourceFrameId) {
    const sourceFrame = found.segment.keyframes.find((frame) => frame.id === input.sourceFrameId);
    if (!sourceFrame) throw new MotionValidationError("Source frame not found");
  }
  if (input.targetFrameId) {
    const targetFrame = found.segment.keyframes.find((frame) => frame.id === input.targetFrameId);
    if (!targetFrame) throw new MotionValidationError("Target frame not found");
  }

  const edit: FrameTransformEdit = {
    ...found.edit,
    sourceFrameId: input.sourceFrameId ?? found.edit.sourceFrameId,
    targetFrameId: input.targetFrameId ?? found.edit.targetFrameId,
    subjectBox: input.subjectBox ?? found.edit.subjectBox,
    transform: input.transform ?? found.edit.transform,
    renderedFrameUrl: undefined,
    maskUrl: undefined,
    comfyTargetFrameUrl: undefined,
    updatedAt: now(),
  };
  const segment: MotionSegment = {
    ...found.segment,
    frameEdit: edit,
    updatedAt: now(),
  };
  found.project.segments[segment.id] = segment;
  found.project.updatedAt = now();
  await writeProjectRaw(found.project);
  return { project: found.project, segment, edit };
}

async function renderFrameEdit(input: {
  ownerId: string;
  editId: string;
  sourceFrameId?: string;
  targetFrameId?: string;
  subjectBox?: FrameTransformEdit["subjectBox"];
  transform?: FrameTransformEdit["transform"];
}): Promise<{ project: MotionProject; segment: MotionSegment; edit: FrameTransformEdit } | null> {
  const updated = await updateFrameEdit(input);
  if (!updated) return null;

  const sourceFrame = updated.segment.keyframes.find((frame) => frame.id === updated.edit.sourceFrameId);
  const targetFrame = updated.segment.keyframes.find((frame) => frame.id === updated.edit.targetFrameId);
  if (!sourceFrame) throw new MotionValidationError("Source frame not found");
  if (!targetFrame) throw new MotionValidationError("Target frame not found");

  const sourceFramePath = artifactPathFromUrl(updated.project.id, sourceFrame.imageUrl);
  const targetFramePath = artifactPathFromUrl(updated.project.id, targetFrame.imageUrl);
  if (!sourceFramePath) throw new MotionValidationError("Source frame artifact is invalid");
  if (!targetFramePath) throw new MotionValidationError("Target frame artifact is invalid");

  const artifactDir = await ensureMotionArtifactDir(updated.project.id);
  const filename = `${updated.edit.id}-target-frame.jpg`;
  const maskFilename = `${updated.edit.id}-subject-mask.jpg`;
  await renderTransformedFrame({
    sourceFramePath,
    targetFramePath,
    outputPath: join(artifactDir, filename),
    subjectBox: updated.edit.subjectBox,
    transform: updated.edit.transform,
  });
  await renderSubjectBoxMask({
    framePath: sourceFramePath,
    outputPath: join(artifactDir, maskFilename),
    subjectBox: updated.edit.subjectBox,
  });

  const edit: FrameTransformEdit = {
    ...updated.edit,
    renderedFrameUrl: artifactUrl(updated.project.id, filename),
    maskUrl: artifactUrl(updated.project.id, maskFilename),
    updatedAt: now(),
  };
  let segment: MotionSegment = {
    ...updated.segment,
    frameEdit: edit,
    updatedAt: now(),
  };
  segment = withComfyStep(segment, "targetFrame", {
    status: "succeeded",
    artifactUrl: edit.renderedFrameUrl,
    message: process.env.COMFYUI_TARGET_FRAME_WORKFLOW_PATH?.trim()
      ? "Local target frame rendered; Comfy target workflow hook is configured"
      : "Local transformed target frame rendered; no Comfy target workflow configured",
  });
  segment = withComfyStep(segment, "subjectMask", {
    status: "succeeded",
    artifactUrl: edit.maskUrl,
    message: process.env.COMFYUI_MASK_WORKFLOW_PATH?.trim()
      ? "Box mask rendered; Comfy mask workflow hook is configured"
      : "Box mask rendered from the selected source region",
  });
  segment = withComfyStep(segment, "controlGuidance", {
    status: process.env.COMFYUI_CONTROL_WORKFLOW_PATH?.trim() ? "idle" : "skipped",
    message: process.env.COMFYUI_CONTROL_WORKFLOW_PATH?.trim()
      ? "Control guidance workflow is configured but not run automatically"
      : "No Comfy control/depth/pose workflow configured",
  });
  updated.project.segments[segment.id] = segment;
  updated.project.updatedAt = now();
  await writeProjectRaw(updated.project);
  return { project: updated.project, segment, edit };
}

async function prepareComfyGuidance(input: {
  ownerId: string;
  segmentId: string;
}): Promise<{ project: MotionProject; segment: MotionSegment } | null> {
  const found = await findProjectBySegment(input.ownerId, input.segmentId);
  if (!found) return null;
  if (!found.segment.frameEdit) {
    throw new MotionValidationError("Create source and target guidance frames first");
  }

  const rendered = await renderFrameEdit({
    ownerId: input.ownerId,
    editId: found.segment.frameEdit.id,
  });
  if (!rendered) return null;

  let { project, segment, edit } = rendered;
  const sourceFrame = segment.keyframes.find((frame) => frame.id === edit.sourceFrameId);
  const targetFrame = segment.keyframes.find((frame) => frame.id === edit.targetFrameId);
  const sourceFramePath = sourceFrame ? artifactPathFromUrl(project.id, sourceFrame.imageUrl) : null;
  const targetFrameUrl = edit.comfyTargetFrameUrl ?? edit.renderedFrameUrl ?? targetFrame?.imageUrl;
  const targetFramePath = targetFrameUrl ? artifactPathFromUrl(project.id, targetFrameUrl) : null;

  segment = withComfyStep(segment, "provider", {
    status: comfyUiUrl() ? "succeeded" : "skipped",
    message: comfyUiUrl()
      ? "ComfyUI is configured as a local RIFE preview/provider backend"
      : "COMFYUI_URL is not configured",
  });
  project.segments[segment.id] = segment;
  await writeProjectRaw(project);

  if (!sourceFramePath || !targetFramePath || !sourceFrame || !targetFrame) {
    segment = withComfyStep(segment, "motionPreview", {
      status: "failed",
      message: "Source or target frame artifact is missing",
    });
    await saveSegment(project, segment);
    return { project, segment };
  }

  if (!comfyUiUrl()) {
    segment = withComfyStep(segment, "motionPreview", {
      status: "skipped",
      message: "COMFYUI_URL is not configured, so the cheap RIFE preview was skipped",
    });
    segment = withComfyStep(segment, "transition", {
      status: "skipped",
      message: "ComfyUI transitions will be skipped until COMFYUI_URL is configured",
    });
    segment = withComfyStep(segment, "stitchBridge", {
      status: "skipped",
      message: "Bookend stitch repair requires ComfyUI RIFE",
    });
    await saveSegment(project, segment);
    return { project, segment };
  }

  const health = await checkComfyUiHealth({ performNetworkCheck: true });
  if (!health.ok) {
    segment = withComfyStep(segment, "provider", {
      status: "failed",
      message: health.message,
    });
    segment = withComfyStep(segment, "motionPreview", {
      status: "failed",
      message: `ComfyUI preview unavailable: ${health.message}`,
    });
    segment = withComfyStep(segment, "transition", {
      status: "skipped",
      message: "ComfyUI transition repair will be skipped until the health check passes",
    });
    segment = withComfyStep(segment, "stitchBridge", {
      status: "skipped",
      message: "Bookend stitch repair will be skipped until ComfyUI is reachable",
    });
    await saveSegment(project, segment);
    return { project, segment };
  }

  const artifactDir = await ensureMotionArtifactDir(project.id);
  const previewFilename = `${segment.id}-comfy-preview.mp4`;
  const previewPath = join(artifactDir, previewFilename);
  segment = withComfyStep(segment, "motionPreview", {
    status: "running",
    message: "Rendering cheap RIFE source-to-target preview",
  });
  await saveSegment(project, segment);

  try {
    await renderRifeInterpolationClip({
      frameAPath: sourceFramePath,
      frameBPath: targetFramePath,
      outputPath: previewPath,
      tempDir: artifactDir,
      durationSeconds: Math.max(0.25, targetFrame.timeSeconds - sourceFrame.timeSeconds),
      fps: 12,
      timeoutMs: comfyPrepTimeoutMs(),
    });
    const previewUrl = artifactUrl(project.id, previewFilename);
    segment = {
      ...segment,
      motionPreviewUrl: previewUrl,
    };
    segment = withComfyStep(segment, "motionPreview", {
      status: "succeeded",
      artifactUrl: previewUrl,
      message: "Cheap RIFE source-to-target preview is ready",
    });
    segment = withComfyStep(segment, "stitchBridge", {
      status: "idle",
      message: "Bookend stitch repair will run after provider generation succeeds",
    });
    segment = withComfyStep(segment, "transition", {
      status: "idle",
      message: "RIFE transition repair will run after provider generation succeeds",
    });
  } catch (err) {
    segment = withComfyStep(segment, "motionPreview", {
      status: "failed",
      message: err instanceof Error ? err.message : "ComfyUI preview failed",
    });
  }

  await saveSegment(project, segment);
  return { project, segment };
}

async function updateKeyframe(input: {
  ownerId: string;
  segmentId: string;
  keyframeId: string;
  keypoints: BodyKeypoint[];
}): Promise<{ project: MotionProject; segment: MotionSegment; keyframe: KeyframePose } | null> {
  const found = await findProjectBySegment(input.ownerId, input.segmentId);
  if (!found) return null;

  const keyframeIndex = found.segment.keyframes.findIndex((frame) => frame.id === input.keyframeId);
  if (keyframeIndex < 0) return null;

  const keyframe: KeyframePose = {
    ...found.segment.keyframes[keyframeIndex],
    keypoints: input.keypoints,
  };
  const segment: MotionSegment = {
    ...found.segment,
    keyframes: found.segment.keyframes.map((frame, index) =>
      index === keyframeIndex ? keyframe : frame,
    ),
    updatedAt: now(),
  };

  found.project.segments[segment.id] = segment;
  found.project.updatedAt = now();
  await writeProjectRaw(found.project);
  return { project: found.project, segment, keyframe };
}

async function createGenerationJob(input: {
  ownerId: string;
  segmentId: string;
  motionPrompt: string;
  compiledPrompt: string;
  provider: GenerationProvider;
  animationCurve?: AnimationCurve;
}): Promise<{ project: MotionProject; segment: MotionSegment; job: GenerationJob }> {
  const found = await findProjectBySegment(input.ownerId, input.segmentId);
  if (!found) throw new MotionValidationError("Segment not found");

  const updatedSegment: MotionSegment = {
    ...found.segment,
    motionPrompt: input.motionPrompt,
    compiledPrompt: input.compiledPrompt,
    animationCurve: input.animationCurve,
    status: "generating",
    error: undefined,
    updatedAt: now(),
  };
  found.project.segments[updatedSegment.id] = updatedSegment;
  found.project.updatedAt = now();
  await writeProjectRaw(found.project);

  const createdAt = now();
  const job: GenerationJob = {
    id: createId(),
    projectId: found.project.id,
    segmentId: found.segment.id,
    provider: input.provider,
    status: "queued",
    createdAt,
    updatedAt: createdAt,
  };
  await writeJob(job);
  return { project: found.project, segment: updatedSegment, job };
}

async function saveGeneratedVideo(input: {
  projectId: string;
  jobId: string;
  bytes: ArrayBuffer;
  ext?: string;
}): Promise<string> {
  const artifactDir = await ensureMotionArtifactDir(input.projectId);
  const filename = `${input.jobId}-generated.${input.ext ?? "mp4"}`;
  await Bun.write(join(artifactDir, filename), input.bytes);
  return artifactUrl(input.projectId, filename);
}

async function readJob(jobId: string, ownerId: string): Promise<GenerationJob | null> {
  const file = Bun.file(jobPath(jobId));
  if (!(await file.exists())) return null;
  const parsed = generationJobSchema.safeParse(await file.json());
  if (!parsed.success) return null;
  const project = await readProject(parsed.data.projectId, ownerId);
  if (!project) return null;
  return parsed.data;
}

async function writeJob(job: GenerationJob): Promise<void> {
  await ensureMotionDirs();
  await Bun.write(jobPath(job.id), JSON.stringify(job, null, 2));
}

async function updateJob(job: GenerationJob): Promise<GenerationJob> {
  const updated = { ...job, updatedAt: now() };
  await writeJob(updated);
  return updated;
}

async function markSegmentGenerated(input: {
  ownerId: string;
  job: GenerationJob;
  resultVideoUrl: string;
}): Promise<{ project: MotionProject; segment: MotionSegment } | null> {
  const project = await readProject(input.job.projectId, input.ownerId);
  const segment = project?.segments[input.job.segmentId];
  if (!project || !segment) return null;

  const updatedSegment: MotionSegment = {
    ...segment,
    status: "succeeded",
    regeneratedSegmentUrl: input.resultVideoUrl,
    error: undefined,
    updatedAt: now(),
  };
  project.segments[segment.id] = updatedSegment;
  project.updatedAt = now();
  await writeProjectRaw(project);
  return { project, segment: updatedSegment };
}

async function markSegmentFailed(input: {
  ownerId: string;
  job: GenerationJob;
  error: string;
}): Promise<void> {
  const project = await readProject(input.job.projectId, input.ownerId);
  const segment = project?.segments[input.job.segmentId];
  if (!project || !segment) return;

  project.segments[segment.id] = {
    ...segment,
    status: "failed",
    error: input.error,
    updatedAt: now(),
  };
  project.updatedAt = now();
  await writeProjectRaw(project);
}

async function stitchAndSaveSegmentInner(input: {
  ownerId: string;
  job: GenerationJob;
  resultVideoUrl: string;
}): Promise<{ project: MotionProject; segment: MotionSegment; stitchedVideoUrl: string } | null> {
  const project = await readProject(input.job.projectId, input.ownerId);
  const existingSegment = project?.segments[input.job.segmentId];
  if (!project || !existingSegment) return null;
  let segment: MotionSegment = existingSegment;

  const sourcePath = artifactPathFromUrl(project.id, project.sourceVideoUrl);
  const generatedPath = artifactPathFromUrl(project.id, input.resultVideoUrl);
  if (!sourcePath || !generatedPath) return null;

  const artifactDir = await ensureMotionArtifactDir(project.id);
  const retimedFilename = `${input.job.id}-retimed.mp4`;
  const retimedPath = join(artifactDir, retimedFilename);
  const outputFilename = `${input.job.id}-stitched.mp4`;
  const outputPath = join(artifactDir, outputFilename);

  // Use S/T keyframe times as the stitch window. The generated clip will be
  // sped up by (veo_duration / st_interval) to fit exactly between S and T.
  const sourceKf = segment.keyframes.find((k) => k.id === segment.frameEdit?.sourceFrameId);
  const targetKf = segment.keyframes.find((k) => k.id === segment.frameEdit?.targetFrameId);
  const stitchStart = sourceKf?.timeSeconds ?? segment.startTimeSeconds;
  const stitchEnd = targetKf?.timeSeconds ?? segment.endTimeSeconds;
  const stitchDuration = Math.max(0.05, stitchEnd - stitchStart);

  await retimeGeneratedSegment({
    sourcePath,
    generatedPath,
    targetDurationSeconds: stitchDuration,
    outputPath: retimedPath,
    tempDir: artifactDir,
    animationCurve: segment.animationCurve,
  });

  // RIFE bookend transition: morph the first frames from S and the last frames
  // into T, hiding provider drift at both stitch boundaries. Opt-in via
  // COMFYUI_URL env var; non-fatal on failure.
  const comfyUrl = comfyUiUrl();
  const sourceFramePath = sourceKf ? artifactPathFromUrl(project.id, sourceKf.imageUrl) : null;
  const targetFrameUrl = segment.frameEdit?.comfyTargetFrameUrl ?? segment.frameEdit?.renderedFrameUrl ?? targetKf?.imageUrl;
  const targetFramePath = targetFrameUrl ? artifactPathFromUrl(project.id, targetFrameUrl) : null;
  let stitchInputPath = retimedPath;
  let rifeUrl: string | undefined;

  if (comfyUrl && (sourceFramePath || targetFramePath)) {
    const rifeOutputPath = join(artifactDir, `${input.job.id}-retimed-rife.mp4`);
    segment = withComfyStep(segment, "transition", {
      status: "running",
      message: "ComfyUI RIFE is repairing the generated clip bookends",
    });
    segment = withComfyStep(segment, "stitchBridge", {
      status: "running",
      message: "Preparing smoother source/generated and generated/original seams",
    });
    await saveSegment(project, segment);
    try {
      const rifeInfo = await getVideoInfo(retimedPath);
      await applyRifeBookendTransitions({
        videoPath: retimedPath,
        sourceFramePath: sourceFramePath ?? undefined,
        targetFramePath: targetFramePath ?? undefined,
        fps: Math.round(rifeInfo.fps) || 30,
        outputPath: rifeOutputPath,
        tempDir: artifactDir,
      });
      stitchInputPath = rifeOutputPath;
      rifeUrl = artifactUrl(project.id, `${input.job.id}-retimed-rife.mp4`);
      segment = {
        ...segment,
        rifeSegmentUrl: rifeUrl,
      };
      segment = withComfyStep(segment, "transition", {
        status: "succeeded",
        artifactUrl: rifeUrl,
        message: "ComfyUI RIFE bookend transition applied",
      });
      segment = withComfyStep(segment, "stitchBridge", {
        status: "succeeded",
        artifactUrl: rifeUrl,
        message: "Generated insert was bridged to the selected S/T frames before stitching",
      });
      await saveSegment(project, segment);
    } catch (err) {
      console.warn(
        "[rife] bookend transition failed, using unmodified retimed clip:",
        err instanceof Error ? err.message : String(err),
      );
      const message = err instanceof Error ? err.message : "ComfyUI RIFE transition failed";
      segment = withComfyStep(segment, "transition", {
        status: "failed",
        message,
      });
      segment = withComfyStep(segment, "stitchBridge", {
        status: "failed",
        message: `Used the unmodified retimed clip. ${message}`,
      });
      await saveSegment(project, segment);
    }
  } else {
    segment = withComfyStep(segment, "transition", {
      status: "skipped",
      message: comfyUrl
        ? "No source or target frame artifact was available for ComfyUI RIFE"
        : "COMFYUI_URL is not configured",
    });
    segment = withComfyStep(segment, "stitchBridge", {
      status: "skipped",
      message: comfyUrl
        ? "Bookend stitch repair needs source or target frame artifacts"
        : "Bookend stitch repair requires COMFYUI_URL",
    });
    await saveSegment(project, segment);
  }

  await stitchVideoSegment({
    sourcePath,
    generatedPath: stitchInputPath,
    startTimeSeconds: stitchStart,
    endTimeSeconds: stitchEnd,
    outputPath,
    tempDir: artifactDir,
    animationCurve: segment.animationCurve,
  });

  const retimedUrl = artifactUrl(project.id, retimedFilename);
  const stitchedUrl = artifactUrl(project.id, outputFilename);
  const updatedSegment: MotionSegment = {
    ...segment,
    retimedSegmentUrl: retimedUrl,
    rifeSegmentUrl: rifeUrl ?? segment.rifeSegmentUrl,
    stitchedVideoUrl: stitchedUrl,
    updatedAt: now(),
  };
  project.segments[segment.id] = updatedSegment;
  project.updatedAt = now();
  await writeProjectRaw(project);
  return { project, segment: updatedSegment, stitchedVideoUrl: stitchedUrl };
}

async function stitchAndSaveSegment(input: {
  ownerId: string;
  job: GenerationJob;
  resultVideoUrl: string;
}): Promise<{ project: MotionProject; segment: MotionSegment; stitchedVideoUrl: string } | null> {
  const lockKey = `${input.ownerId}:${input.job.id}`;
  const existing = stitchLocks.get(lockKey);
  if (existing) return existing;

  const task = stitchAndSaveSegmentInner(input).finally(() => {
    stitchLocks.delete(lockKey);
  });
  stitchLocks.set(lockKey, task);
  return task;
}

export const motionRepo = {
  createProjectFromUpload,
  createSegment,
  createKeyframe,
  findProjectBySegment,
  findProjectByFrameEdit,
  updateKeyframe,
  updateFrameEdit,
  renderFrameEdit,
  prepareComfyGuidance,
  createGenerationJob,
  readProject,
  readJob,
  updateJob,
  saveGeneratedVideo,
  markSegmentGenerated,
  markSegmentFailed,
  stitchAndSaveSegment,
};
