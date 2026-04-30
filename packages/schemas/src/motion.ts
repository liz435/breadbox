import { z } from "zod";
import { nonEmptyStringSchema, timestampSchema } from "./primitives";

export const animationCurveSchema = z.enum(["linear", "easeIn", "easeOut", "easeInOut", "sharp"]);
export type AnimationCurve = z.infer<typeof animationCurveSchema>;

export const bodyKeypointNameSchema = z.enum([
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
]);

export type BodyKeypointName = z.infer<typeof bodyKeypointNameSchema>;

export const bodyKeypointSchema = z.object({
  name: bodyKeypointNameSchema,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
});

export type BodyKeypoint = z.infer<typeof bodyKeypointSchema>;

export const keyframePoseSchema = z.object({
  id: nonEmptyStringSchema,
  segmentId: nonEmptyStringSchema,
  label: z.enum(["start", "middle", "end", "custom"]),
  timeSeconds: z.number().nonnegative(),
  imageUrl: nonEmptyStringSchema,
  keypoints: z.array(bodyKeypointSchema),
});

export type KeyframePose = z.infer<typeof keyframePoseSchema>;

export const frameBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.02).max(1),
  height: z.number().min(0.02).max(1),
});

export type FrameBox = z.infer<typeof frameBoxSchema>;

export const frameTransformSchema = z.object({
  translateX: z.number().min(-1).max(1),
  translateY: z.number().min(-1).max(1),
  scale: z.number().min(0.2).max(3),
  rotateDeg: z.number().min(-180).max(180),
});

export type FrameTransform = z.infer<typeof frameTransformSchema>;

export const frameTransformEditSchema = z.object({
  id: nonEmptyStringSchema,
  segmentId: nonEmptyStringSchema,
  sourceFrameId: nonEmptyStringSchema,
  targetFrameId: nonEmptyStringSchema,
  subjectBox: frameBoxSchema,
  transform: frameTransformSchema,
  renderedFrameUrl: nonEmptyStringSchema.optional(),
  maskUrl: nonEmptyStringSchema.optional(),
  comfyTargetFrameUrl: nonEmptyStringSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type FrameTransformEdit = z.infer<typeof frameTransformEditSchema>;

export const motionSegmentStatusSchema = z.enum([
  "idle",
  "ready",
  "generating",
  "succeeded",
  "failed",
]);

export const comfyPipelineStepStatusSchema = z.enum([
  "idle",
  "skipped",
  "running",
  "succeeded",
  "failed",
]);

export type ComfyPipelineStepStatus = z.infer<typeof comfyPipelineStepStatusSchema>;

export const comfyPipelineStepSchema = z.object({
  status: comfyPipelineStepStatusSchema,
  message: z.string().optional(),
  artifactUrl: nonEmptyStringSchema.optional(),
  updatedAt: timestampSchema.optional(),
});

export type ComfyPipelineStep = z.infer<typeof comfyPipelineStepSchema>;

export const comfyPipelineSchema = z.object({
  targetFrame: comfyPipelineStepSchema.optional(),
  subjectMask: comfyPipelineStepSchema.optional(),
  motionPreview: comfyPipelineStepSchema.optional(),
  controlGuidance: comfyPipelineStepSchema.optional(),
  transition: comfyPipelineStepSchema.optional(),
  provider: comfyPipelineStepSchema.optional(),
  stitchBridge: comfyPipelineStepSchema.optional(),
});

export type ComfyPipeline = z.infer<typeof comfyPipelineSchema>;

export const motionSegmentSchema = z.object({
  id: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  startTimeSeconds: z.number().nonnegative(),
  endTimeSeconds: z.number().positive(),
  sourceSegmentUrl: nonEmptyStringSchema.optional(),
  regeneratedSegmentUrl: nonEmptyStringSchema.optional(),
  retimedSegmentUrl: nonEmptyStringSchema.optional(),
  rifeSegmentUrl: nonEmptyStringSchema.optional(),
  stitchedVideoUrl: nonEmptyStringSchema.optional(),
  motionPreviewUrl: nonEmptyStringSchema.optional(),
  keyframes: z.array(keyframePoseSchema),
  frameEdit: frameTransformEditSchema.optional(),
  motionPrompt: z.string(),
  compiledPrompt: z.string().optional(),
  animationCurve: animationCurveSchema.optional(),
  comfyPipeline: comfyPipelineSchema.optional(),
  status: motionSegmentStatusSchema,
  error: z.string().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type MotionSegment = z.infer<typeof motionSegmentSchema>;

export const motionProjectSchema = z.object({
  id: nonEmptyStringSchema,
  ownerId: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  sourceVideoUrl: nonEmptyStringSchema,
  sourceVideoMimeType: nonEmptyStringSchema,
  segments: z.record(z.string(), motionSegmentSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type MotionProject = z.infer<typeof motionProjectSchema>;

export const generationProviderSchema = z.enum([
  "mock",
  "veo",
  "comfyui",
  "runway",
  "luma",
  "replicate",
]);

export type GenerationProvider = z.infer<typeof generationProviderSchema>;

export const generationJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const generationJobSchema = z.object({
  id: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  segmentId: nonEmptyStringSchema,
  provider: generationProviderSchema,
  status: generationJobStatusSchema,
  providerJobId: nonEmptyStringSchema.optional(),
  resultVideoUrl: nonEmptyStringSchema.optional(),
  error: z.string().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type GenerationJob = z.infer<typeof generationJobSchema>;
