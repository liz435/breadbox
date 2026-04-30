import type { GenerationJob } from "@dreamer/schemas";
import {
  comfyRifeFrameCount,
  getRifeResult,
  queueRifeWorkflow,
  uploadImageToComfyUI,
} from "../comfyui-client";
import {
  artifactPath,
  artifactPathFromUrl,
  artifactUrl,
  ensureMotionArtifactDir,
  writeComfyFramesToVideo,
} from "../video-utils";
import type {
  GenerateMotionInput,
  ProviderGenerateResult,
  ProviderJobStatus,
  VideoGenerationProvider,
} from "./types";

const PROVIDER_JOB_PREFIX = "comfy-rife:";

export class ComfyUiProvider implements VideoGenerationProvider {
  readonly id = "comfyui" as const;

  async generate(input: GenerateMotionInput): Promise<ProviderGenerateResult> {
    const firstFramePath = input.firstFrameUrl
      ? artifactPathFromUrl(input.projectId, input.firstFrameUrl)
      : null;
    const lastFramePath = input.lastFrameUrl
      ? artifactPathFromUrl(input.projectId, input.lastFrameUrl)
      : null;
    if (!firstFramePath || !lastFramePath) {
      throw new Error("ComfyUI provider requires source and target frame artifacts");
    }

    const uniquePrefix = `comfy-provider-${input.segmentId}-${Date.now()}`;
    const frameARef = await uploadImageToComfyUI(firstFramePath, `${uniquePrefix}-a.jpg`);
    const frameBRef = await uploadImageToComfyUI(lastFramePath, `${uniquePrefix}-b.jpg`);
    const promptId = await queueRifeWorkflow(
      frameARef,
      frameBRef,
      Math.max(comfyRifeFrameCount(), Math.ceil(input.durationSeconds * 12)),
    );
    return { providerJobId: `${PROVIDER_JOB_PREFIX}${promptId}` };
  }

  async getStatus(job: GenerationJob, input: GenerateMotionInput): Promise<ProviderJobStatus> {
    const promptId = job.providerJobId?.startsWith(PROVIDER_JOB_PREFIX)
      ? job.providerJobId.slice(PROVIDER_JOB_PREFIX.length)
      : null;
    if (!promptId) return { status: "failed", error: "Missing ComfyUI prompt id" };

    const outputFilename = `${job.id}-generated.mp4`;
    const outputPath = artifactPath(input.projectId, outputFilename);
    if (await Bun.file(outputPath).exists()) {
      return { status: "succeeded", videoUrl: artifactUrl(input.projectId, outputFilename) };
    }

    const frameRefs = await getRifeResult(promptId);
    if (!frameRefs) return { status: "running" };

    const artifactDir = await ensureMotionArtifactDir(input.projectId);
    await writeComfyFramesToVideo({
      frameRefs,
      outputPath,
      tempDir: artifactDir,
      fps: 12,
      startIndex: 0,
      maxFrames: frameRefs.length,
    });

    return { status: "succeeded", videoUrl: artifactUrl(input.projectId, outputFilename) };
  }
}
