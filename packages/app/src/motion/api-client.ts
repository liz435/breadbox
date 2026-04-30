import { API_ORIGIN } from "@dreamer/config";
import {
  generationJobSchema,
  frameTransformEditSchema,
  comfyPipelineSchema,
  motionProjectSchema,
  motionSegmentSchema,
  keyframePoseSchema,
  type BodyKeypoint,
  type FrameBox,
  type FrameTransform,
  type FrameTransformEdit,
  type GenerationJob,
  type GenerationProvider,
  type KeyframePose,
  type MotionProject,
  type MotionSegment,
  type SpringCurve,
} from "@dreamer/schemas";
import { z } from "zod";
import { ApiError, resolveFetchOptions } from "@/project/api-client";

const createProjectResponseSchema = z.object({
  project: motionProjectSchema,
  sourceVideoUrl: z.string(),
});

const createSegmentResponseSchema = z.object({
  project: motionProjectSchema,
  segment: motionSegmentSchema,
});

const updateKeyframeResponseSchema = z.object({
  project: motionProjectSchema,
  segment: motionSegmentSchema,
  keyframe: keyframePoseSchema,
});

const createKeyframeResponseSchema = updateKeyframeResponseSchema;

const frameEditResponseSchema = z.object({
  project: motionProjectSchema,
  segment: motionSegmentSchema,
  edit: frameTransformEditSchema,
});

const generateResponseSchema = z.object({
  jobId: z.string(),
  status: generationJobSchema.shape.status,
  job: generationJobSchema,
  segment: motionSegmentSchema,
  compiledPrompt: z.string(),
});

const jobResponseSchema = z.object({
  job: generationJobSchema,
  resultVideoUrl: z.string().optional(),
  segment: motionSegmentSchema.optional(),
});

const veoProviderHealthSchema = z.object({
  provider: z.literal("veo"),
  configured: z.boolean(),
  ok: z.boolean(),
  mode: z.union([z.literal("config"), z.literal("live")]),
  model: z.string(),
  baseUrl: z.string(),
  checkedAt: z.string(),
  message: z.string(),
  statusCode: z.number().optional(),
});

export type VeoProviderHealth = z.infer<typeof veoProviderHealthSchema>;

const comfyProviderHealthSchema = z.object({
  provider: z.literal("comfyui"),
  configured: z.boolean(),
  ok: z.boolean(),
  mode: z.union([z.literal("config"), z.literal("live")]),
  baseUrl: z.string().nullable(),
  checkedAt: z.string(),
  message: z.string(),
  features: z.object({
    rife: z.boolean(),
    preview: z.boolean(),
    transition: z.boolean(),
    provider: z.boolean(),
    targetFrameWorkflow: z.boolean(),
    maskWorkflow: z.boolean(),
    controlWorkflow: z.boolean(),
  }),
  statusCode: z.number().optional(),
});

export type ComfyProviderHealth = z.infer<typeof comfyProviderHealthSchema>;

async function parseJson<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
  return schema.parse(await res.json());
}

export function resolveMotionUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return url;
  return url;
}

export async function createMotionProject(input: {
  file: File;
  name?: string;
}): Promise<{ project: MotionProject; sourceVideoUrl: string }> {
  const formData = new FormData();
  formData.append("file", input.file);
  if (input.name) formData.append("name", input.name);
  const res = await fetch(`${API_ORIGIN}/api/motion/projects`, resolveFetchOptions({
    method: "POST",
    body: formData,
  }));
  return parseJson(res, createProjectResponseSchema);
}

export async function createMotionSegment(input: {
  projectId: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
}): Promise<{ project: MotionProject; segment: MotionSegment }> {
  const res = await fetch(
    `${API_ORIGIN}/api/motion/projects/${encodeURIComponent(input.projectId)}/segments`,
    resolveFetchOptions({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTimeSeconds: input.startTimeSeconds,
        endTimeSeconds: input.endTimeSeconds,
      }),
    }),
  );
  return parseJson(res, createSegmentResponseSchema);
}

export async function updateMotionKeyframe(input: {
  segmentId: string;
  keyframeId: string;
  keypoints: BodyKeypoint[];
}): Promise<{ project: MotionProject; segment: MotionSegment; keyframe: KeyframePose }> {
  const res = await fetch(
    `${API_ORIGIN}/api/motion/segments/${encodeURIComponent(input.segmentId)}/keyframes/${encodeURIComponent(input.keyframeId)}`,
    resolveFetchOptions({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keypoints: input.keypoints }),
    }),
  );
  return parseJson(res, updateKeyframeResponseSchema);
}

export async function createMotionKeyframe(input: {
  segmentId: string;
  timeSeconds: number;
  role?: "source" | "target";
}): Promise<{ project: MotionProject; segment: MotionSegment; keyframe: KeyframePose }> {
  const res = await fetch(
    `${API_ORIGIN}/api/motion/segments/${encodeURIComponent(input.segmentId)}/keyframes`,
    resolveFetchOptions({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeSeconds: input.timeSeconds,
        role: input.role,
      }),
    }),
  );
  return parseJson(res, createKeyframeResponseSchema);
}

export async function renderMotionFrameEdit(input: {
  editId: string;
  sourceFrameId?: string;
  targetFrameId?: string;
  subjectBox?: FrameBox;
  transform?: FrameTransform;
}): Promise<{ project: MotionProject; segment: MotionSegment; edit: FrameTransformEdit }> {
  const res = await fetch(
    `${API_ORIGIN}/api/motion/frame-edits/${encodeURIComponent(input.editId)}/render-target-frame`,
    resolveFetchOptions({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceFrameId: input.sourceFrameId,
        targetFrameId: input.targetFrameId,
        subjectBox: input.subjectBox,
        transform: input.transform,
      }),
    }),
  );
  return parseJson(res, frameEditResponseSchema);
}

export async function generateMotionSegment(input: {
  segmentId: string;
  motionPrompt: string;
  provider?: GenerationProvider;
  durationSeconds?: 4 | 6 | 8;
  springCurve?: SpringCurve;
  subjectDescription?: string;
}): Promise<{
  jobId: string;
  status: GenerationJob["status"];
  job: GenerationJob;
  segment: MotionSegment;
  compiledPrompt: string;
}> {
  const res = await fetch(
    `${API_ORIGIN}/api/motion/segments/${encodeURIComponent(input.segmentId)}/generate`,
    resolveFetchOptions({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motionPrompt: input.motionPrompt,
        provider: input.provider ?? "mock",
        durationSeconds: input.durationSeconds,
        springCurve: input.springCurve,
        subjectDescription: input.subjectDescription,
      }),
    }),
  );
  return parseJson(res, generateResponseSchema);
}

export async function getMotionJob(jobId: string): Promise<{
  job: GenerationJob;
  resultVideoUrl?: string;
  segment?: MotionSegment;
}> {
  const res = await fetch(
    `${API_ORIGIN}/api/motion/jobs/${encodeURIComponent(jobId)}`,
    resolveFetchOptions(),
  );
  return parseJson(res, jobResponseSchema);
}

const cancelJobResponseSchema = z.object({
  job: generationJobSchema,
});

export async function cancelMotionJob(jobId: string): Promise<{ job: GenerationJob }> {
  const res = await fetch(
    `${API_ORIGIN}/api/motion/jobs/${encodeURIComponent(jobId)}/cancel`,
    resolveFetchOptions({ method: "POST" }),
  );
  return parseJson(res, cancelJobResponseSchema);
}

export async function getVeoProviderHealth(input?: {
  live?: boolean;
}): Promise<VeoProviderHealth> {
  const live = input?.live ?? true;
  const res = await fetch(
    `${API_ORIGIN}/api/motion/providers/veo/health?live=${live ? "1" : "0"}`,
    resolveFetchOptions(),
  );
  return parseJson(res, veoProviderHealthSchema);
}

const prepareComfyResponseSchema = z.object({
  project: motionProjectSchema,
  segment: motionSegmentSchema,
});

export async function prepareComfyMotionSegment(input: {
  segmentId: string;
}): Promise<{ project: MotionProject; segment: MotionSegment }> {
  const res = await fetch(
    `${API_ORIGIN}/api/motion/segments/${encodeURIComponent(input.segmentId)}/comfy/prepare`,
    resolveFetchOptions({ method: "POST" }),
  );
  return parseJson(res, prepareComfyResponseSchema);
}

export async function getComfyProviderHealth(input?: {
  live?: boolean;
}): Promise<ComfyProviderHealth> {
  const live = input?.live ?? true;
  const res = await fetch(
    `${API_ORIGIN}/api/motion/providers/comfyui/health?live=${live ? "1" : "0"}`,
    resolveFetchOptions(),
  );
  return parseJson(res, comfyProviderHealthSchema);
}

export type MotionComfyPipeline = z.infer<typeof comfyPipelineSchema>;
