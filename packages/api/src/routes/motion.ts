import { join, resolve, sep } from "path";
import { Elysia } from "elysia";
import { z, ZodError } from "zod";
import {
  animationCurveSchema,
  bodyKeypointSchema,
  frameBoxSchema,
  frameTransformSchema,
  generationProviderSchema,
  springCurveSchema,
  type KeyframePose,
  type GenerationProvider,
} from "@dreamer/schemas";
import type { AuthContext } from "../auth/context";
import { authPlugin } from "../auth/middleware";
import { motionArtifactsDir } from "../paths";
import { checkComfyUiHealth } from "../motion/comfyui-client";
import { MotionValidationError, motionRepo } from "../motion/motion-repo";
import { compileMotionPrompt } from "../motion/prompt-compiler";
import { getVideoGenerationProvider } from "../motion/providers";
import { checkVeoHealth } from "../motion/providers/veo-provider";
import { isSupportedVideoUpload } from "../motion/video-utils";

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

const createSegmentSchema = z.object({
  startTimeSeconds: z.number().nonnegative(),
  endTimeSeconds: z.number().positive(),
});

const createKeyframeSchema = z.object({
  timeSeconds: z.number().nonnegative(),
  role: z.enum(["source", "target"]).optional(),
});

const updateKeyframeSchema = z.object({
  keypoints: z.array(bodyKeypointSchema).min(1),
});

const generateSegmentSchema = z.object({
  motionPrompt: z.string().max(4000).default(""),
  provider: generationProviderSchema.default("mock"),
  durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
  animationCurve: animationCurveSchema.optional(),
  springCurve: springCurveSchema.optional(),
  subjectDescription: z.string().max(500).optional(),
});

const frameEditUpdateSchema = z.object({
  sourceFrameId: z.string().min(1).optional(),
  targetFrameId: z.string().min(1).optional(),
  subjectBox: frameBoxSchema.optional(),
  transform: frameTransformSchema.optional(),
});

function requireOwnerId(auth: AuthContext | null | undefined): string {
  if (!auth) throw new Error("missing auth context on motion route");
  return auth.userId;
}

function badRequest(set: { status?: number | string }, error: ZodError | string) {
  set.status = 400;
  if (typeof error === "string") return { error };
  return { error: "Invalid request payload", details: error.flatten() };
}

function providerInputFromSegment(input: {
  projectId: string;
  prompt: string;
  segment: {
    id: string;
    sourceSegmentUrl?: string;
    keyframes: KeyframePose[];
    frameEdit?: {
      sourceFrameId: string;
      targetFrameId: string;
      renderedFrameUrl?: string;
      comfyTargetFrameUrl?: string;
    };
    startTimeSeconds: number;
    endTimeSeconds: number;
  };
  durationOverride?: 4 | 6 | 8;
}) {
  const sourceFrame = input.segment.frameEdit
    ? input.segment.keyframes.find((frame) => frame.id === input.segment.frameEdit?.sourceFrameId)
    : null;
  const targetFrame = input.segment.frameEdit
    ? input.segment.keyframes.find((frame) => frame.id === input.segment.frameEdit?.targetFrameId)
    : null;
  const firstFrameUrl = sourceFrame?.imageUrl ?? input.segment.keyframes.find((frame) => frame.label === "start")?.imageUrl;
  const lastFrameUrl =
    input.segment.frameEdit?.comfyTargetFrameUrl ??
    input.segment.frameEdit?.renderedFrameUrl ??
    targetFrame?.imageUrl ??
    input.segment.keyframes.find((frame) => frame.label === "end")?.imageUrl;
  return {
    projectId: input.projectId,
    segmentId: input.segment.id,
    prompt: input.prompt,
    firstFrameUrl,
    lastFrameUrl,
    referenceImageUrls: input.segment.keyframes.map((frame) => frame.imageUrl),
    sourceSegmentUrl: input.segment.sourceSegmentUrl,
    // Veo always generates durationOverride (4/6/8s); stitchVideoSegment speeds up dynamically to match the S→T interval.
    durationSeconds: input.durationOverride ?? 4,
    aspectRatio: "16:9" as const,
    keyframes: input.segment.keyframes,
  };
}

export const motionRoutes = new Elysia({ prefix: "/api/motion" })
  .use(authPlugin)
  .get("/providers/veo/health", async ({ query, set }) => {
    try {
      const rawLive = (query as { live?: string | boolean | number } | undefined)?.live;
      const live =
        rawLive === undefined
          ? true
          : rawLive === true || rawLive === 1 || rawLive === "1" || rawLive === "true";
      return checkVeoHealth({ performNetworkCheck: live });
    } catch (err) {
      set.status = 500;
      return {
        provider: "veo",
        configured: false,
        ok: false,
        mode: "live" as const,
        model: process.env.VEO_MODEL ?? "veo-3.1-generate-preview",
        baseUrl: process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
        checkedAt: new Date().toISOString(),
        message: err instanceof Error ? err.message : "Veo health check failed",
      };
    }
  })
  .get("/providers/comfyui/health", async ({ query, set }) => {
    try {
      const rawLive = (query as { live?: string | boolean | number } | undefined)?.live;
      const live =
        rawLive === undefined
          ? true
          : rawLive === true || rawLive === 1 || rawLive === "1" || rawLive === "true";
      return checkComfyUiHealth({ performNetworkCheck: live });
    } catch (err) {
      set.status = 500;
      return {
        provider: "comfyui",
        configured: false,
        ok: false,
        mode: "live" as const,
        baseUrl: process.env.COMFYUI_URL ?? null,
        checkedAt: new Date().toISOString(),
        message: err instanceof Error ? err.message : "ComfyUI health check failed",
        features: {
          rife: false,
          preview: false,
          transition: false,
          provider: false,
          targetFrameWorkflow: false,
          maskWorkflow: false,
          controlWorkflow: false,
        },
      };
    }
  })
  .post("/projects", async ({ auth, request, set }) => {
    const ownerId = requireOwnerId(auth);
    const formData = await request.formData();
    const file = formData.get("file");
    const rawName = formData.get("name");
    const name = typeof rawName === "string" ? rawName : undefined;

    if (!file || !(file instanceof File)) {
      set.status = 400;
      return { error: "Missing video file" };
    }
    if (!isSupportedVideoUpload(file)) {
      set.status = 400;
      return { error: "Only .mp4, .mov, and .m4v uploads are supported" };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      set.status = 413;
      return { error: "Video upload is too large for the MVP limit of 250 MB" };
    }

    const project = await motionRepo.createProjectFromUpload({ ownerId, name, file });
    return { project, sourceVideoUrl: project.sourceVideoUrl };
  })
  .post("/projects/:projectId/segments", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const input = createSegmentSchema.parse(body);
      const { project, segment } = await motionRepo.createSegment({
        ownerId,
        projectId: params.projectId,
        startTimeSeconds: input.startTimeSeconds,
        endTimeSeconds: input.endTimeSeconds,
      });
      return { project, segment };
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      if (err instanceof MotionValidationError) return badRequest(set, err.message);
      throw err;
    }
  })
  .post("/segments/:segmentId/keyframes", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const input = createKeyframeSchema.parse(body);
      const result = await motionRepo.createKeyframe({
        ownerId,
        segmentId: params.segmentId,
        timeSeconds: input.timeSeconds,
        role: input.role,
      });
      if (!result) {
        set.status = 404;
        return { error: "Segment not found" };
      }
      return result;
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      if (err instanceof MotionValidationError) return badRequest(set, err.message);
      throw err;
    }
  })
  .patch("/segments/:segmentId/keyframes/:keyframeId", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const input = updateKeyframeSchema.parse(body);
      const result = await motionRepo.updateKeyframe({
        ownerId,
        segmentId: params.segmentId,
        keyframeId: params.keyframeId,
        keypoints: input.keypoints,
      });
      if (!result) {
        set.status = 404;
        return { error: "Segment or keyframe not found" };
      }
      return result;
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      throw err;
    }
  })
  .patch("/frame-edits/:editId", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const input = frameEditUpdateSchema.parse(body);
      const result = await motionRepo.updateFrameEdit({
        ownerId,
        editId: params.editId,
        sourceFrameId: input.sourceFrameId,
        targetFrameId: input.targetFrameId,
        subjectBox: input.subjectBox,
        transform: input.transform,
      });
      if (!result) {
        set.status = 404;
        return { error: "Frame edit not found" };
      }
      return result;
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      if (err instanceof MotionValidationError) return badRequest(set, err.message);
      throw err;
    }
  })
  .post("/frame-edits/:editId/render-target-frame", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const input = frameEditUpdateSchema.parse(body ?? {});
      const result = await motionRepo.renderFrameEdit({
        ownerId,
        editId: params.editId,
        sourceFrameId: input.sourceFrameId,
        targetFrameId: input.targetFrameId,
        subjectBox: input.subjectBox,
        transform: input.transform,
      });
      if (!result) {
        set.status = 404;
        return { error: "Frame edit not found" };
      }
      return result;
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      if (err instanceof MotionValidationError) return badRequest(set, err.message);
      throw err;
    }
  })
  .post("/segments/:segmentId/comfy/prepare", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const result = await motionRepo.prepareComfyGuidance({
        ownerId,
        segmentId: params.segmentId,
      });
      if (!result) {
        set.status = 404;
        return { error: "Segment not found" };
      }
      return result;
    } catch (err) {
      if (err instanceof MotionValidationError) return badRequest(set, err.message);
      throw err;
    }
  })
  .post("/segments/:segmentId/generate", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const input = generateSegmentSchema.parse(body);

      const found = await motionRepo.findProjectBySegment(ownerId, params.segmentId);
      if (!found) {
        set.status = 404;
        return { error: "Segment not found" };
      }
      const compiledPrompt = compileMotionPrompt({
        userPrompt: input.motionPrompt,
        startTimeSeconds: found.segment.startTimeSeconds,
        endTimeSeconds: found.segment.endTimeSeconds,
        generationDurationSeconds: input.durationSeconds ?? 4,
        frameEdit: found.segment.frameEdit,
        sourceFrame: found.segment.frameEdit
          ? found.segment.keyframes.find((frame) => frame.id === found.segment.frameEdit?.sourceFrameId)
          : undefined,
        targetFrame: found.segment.frameEdit
          ? found.segment.keyframes.find((frame) => frame.id === found.segment.frameEdit?.targetFrameId)
          : undefined,
        animationCurve: input.animationCurve,
        springCurve: input.springCurve,
        subjectDescription: input.subjectDescription,
      });
      const created = await motionRepo.createGenerationJob({
        ownerId,
        segmentId: params.segmentId,
        motionPrompt: input.motionPrompt,
        provider: input.provider as GenerationProvider,
        compiledPrompt,
        animationCurve: input.animationCurve,
      });
      const provider = getVideoGenerationProvider(input.provider);
      const providerInput = providerInputFromSegment({
        projectId: created.project.id,
        segment: created.segment,
        prompt: compiledPrompt,
        durationOverride: input.durationSeconds,
      });
      let providerResult: { providerJobId: string };
      try {
        providerResult = await provider.generate(providerInput);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Generation provider failed";
        const failedJob = await motionRepo.updateJob({
          ...created.job,
          status: "failed",
          error,
        });
        await motionRepo.markSegmentFailed({ ownerId, job: failedJob, error });
        set.status = 502;
        return { error, job: failedJob, segment: created.segment, compiledPrompt };
      }
      const job = await motionRepo.updateJob({
        ...created.job,
        status: input.provider === "mock" ? "queued" : "running",
        providerJobId: providerResult.providerJobId,
      });

      return {
        jobId: job.id,
        status: job.status,
        job,
        segment: created.segment,
        compiledPrompt,
      };
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      if (err instanceof MotionValidationError) {
        set.status = err.message.includes("not found") ? 404 : 400;
        return { error: err.message };
      }
      throw err;
    }
  })
  .get("/jobs/:jobId", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    const existingJob = await motionRepo.readJob(params.jobId, ownerId);
    if (!existingJob) {
      set.status = 404;
      return { error: "Generation job not found" };
    }
    const project = await motionRepo.readProject(existingJob.projectId, ownerId);
    const segment = project?.segments[existingJob.segmentId];
    if (!project || !segment) {
      set.status = 404;
      return { error: "Generation segment not found" };
    }

    let job = existingJob;
    let responseSegment = segment;
    if (job.status === "queued" || job.status === "running") {
      try {
        const provider = getVideoGenerationProvider(job.provider);
        const providerStatus = await provider.getStatus(
          job,
          providerInputFromSegment({
            projectId: project.id,
            segment,
            prompt: segment.compiledPrompt ?? segment.motionPrompt,
          }),
        );

        if (providerStatus.status === "succeeded" && providerStatus.videoUrl) {
          job = await motionRepo.updateJob({
            ...job,
            status: "succeeded",
            resultVideoUrl: providerStatus.videoUrl,
          });
          await motionRepo.markSegmentGenerated({
            ownerId,
            job,
            resultVideoUrl: providerStatus.videoUrl,
          });
          try {
            const stitched = await motionRepo.stitchAndSaveSegment({
              ownerId,
              job,
              resultVideoUrl: providerStatus.videoUrl,
            });
            if (stitched) {
              responseSegment = stitched.segment;
            }
          } catch (err) {
            console.error("[stitch] failed:", err);
            const refreshed = await motionRepo.findProjectBySegment(ownerId, job.segmentId);
            responseSegment = refreshed?.segment ?? responseSegment;
          }
        } else if (providerStatus.status === "failed") {
          const error = providerStatus.error ?? "Generation failed";
          job = await motionRepo.updateJob({ ...job, status: "failed", error });
          await motionRepo.markSegmentFailed({ ownerId, job, error });
        } else {
          job = await motionRepo.updateJob({ ...job, status: "running" });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : "Generation provider failed";
        job = await motionRepo.updateJob({ ...job, status: "failed", error });
        await motionRepo.markSegmentFailed({ ownerId, job, error });
      }
    }
    if (
      job.status === "succeeded" &&
      job.resultVideoUrl &&
      (!responseSegment.stitchedVideoUrl || !responseSegment.retimedSegmentUrl)
    ) {
      try {
        const stitched = await motionRepo.stitchAndSaveSegment({
          ownerId,
          job,
          resultVideoUrl: job.resultVideoUrl,
        });
        if (stitched) {
          responseSegment = stitched.segment;
        }
      } catch (err) {
        console.error("[stitch] failed:", err);
      }
    }

    if (responseSegment === segment) {
      const refreshed = await motionRepo.findProjectBySegment(ownerId, job.segmentId);
      responseSegment = refreshed?.segment ?? responseSegment;
    }
    return { job, resultVideoUrl: job.resultVideoUrl, segment: responseSegment };
  })
  .post("/jobs/:jobId/cancel", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    const existingJob = await motionRepo.readJob(params.jobId, ownerId);
    if (!existingJob) {
      set.status = 404;
      return { error: "Generation job not found" };
    }
    if (existingJob.status !== "queued" && existingJob.status !== "running") {
      set.status = 409;
      return { error: "Job is not in a cancellable state", status: existingJob.status };
    }
    const job = await motionRepo.updateJob({ ...existingJob, status: "failed", error: "Cancelled by user" });
    await motionRepo.markSegmentFailed({ ownerId, job, error: "Cancelled by user" });
    return { job };
  })
  .get("/artifacts/:projectId/:filename", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    const project = await motionRepo.readProject(params.projectId, ownerId);
    if (!project) {
      set.status = 404;
      return { error: "Motion project not found" };
    }

    const filename = params.filename;
    if (
      filename.length === 0 ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("\0") ||
      filename === "." ||
      filename === ".."
    ) {
      set.status = 400;
      return { error: "Invalid artifact filename" };
    }

    const dir = join(motionArtifactsDir(), params.projectId);
    const dirResolved = resolve(dir);
    const filePath = resolve(join(dir, filename));
    if (filePath !== dirResolved && !filePath.startsWith(dirResolved + sep)) {
      set.status = 400;
      return { error: "Invalid artifact filename" };
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Artifact not found" };
    }

    set.headers["Cache-Control"] = "private, max-age=3600";
    set.headers["Content-Type"] = file.type || "application/octet-stream";
    return file;
  });
