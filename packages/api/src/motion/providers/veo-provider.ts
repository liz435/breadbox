import type { GenerationJob } from "@dreamer/schemas";
import { motionRepo } from "../motion-repo";
import { artifactPathFromUrl } from "../video-utils";
import type {
  GenerateMotionInput,
  ProviderGenerateResult,
  ProviderJobStatus,
  VideoGenerationProvider,
} from "./types";

type VeoOperation = {
  name?: string;
  done?: boolean;
  error?: { message?: string; code?: number; status?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string; bytesBase64Encoded?: string };
      }>;
    };
    generatedVideos?: Array<{
      video?: { uri?: string; bytesBase64Encoded?: string };
    }>;
  };
};

type VeoPredictPayload = {
  instances: Array<Record<string, unknown>>;
  parameters: {
    aspectRatio: GenerateMotionInput["aspectRatio"];
    durationSeconds: 4 | 6 | 8;
    personGeneration: string;
    resolution: string;
  };
};

type InlineImage = {
  mimeType: "image/jpeg" | "image/png";
  base64: string;
};

type VeoImagePayloadFormat = "inlineData" | "imageBytes" | "bytesBase64Encoded";
type VeoGuidanceMode = "auto" | "first-last" | "first-frame" | "text-only";

export class VeoProvider implements VideoGenerationProvider {
  readonly id = "veo" as const;

  async generate(input: GenerateMotionInput): Promise<ProviderGenerateResult> {
    const apiKey = readApiKey();
    const model = readModel();
    const endpoint = `${readBaseUrl()}/models/${encodeURIComponent(model)}:predictLongRunning`;
    const guidanceMode = readGuidanceMode(model);

    const primaryPayload = await buildVeoPredictPayload({
      input,
      model,
      includeImageGuidance: true,
      guidanceMode,
    });
    if (expectsImageGuidance(input) && !primaryPayload.hasImageGuidance && !allowTextOnlyFallback()) {
      throw new Error(
        "Veo image guidance was expected, but no readable source or target frame artifact was found. No text-only fallback was run.",
      );
    }
    let result = await submitVeoPredict({ endpoint, apiKey, payload: primaryPayload.payload });

    if (!result.ok) {
      if (
        primaryPayload.hasImageGuidance &&
        allowTextOnlyFallback() &&
        shouldRetryWithoutImageGuidance(result.failureStatus, result.failureText)
      ) {
        // Some keys/accounts expose text-to-video only for this model surface and reject image payloads.
        // This fallback is opt-in because it can produce unrelated clips for motion editing.
        const fallbackPayload = await buildVeoPredictPayload({
          input,
          model,
          includeImageGuidance: false,
          guidanceMode,
        });
        const fallbackResult = await submitVeoPredict({ endpoint, apiKey, payload: fallbackPayload.payload });
        if (fallbackResult.ok) {
          result = fallbackResult;
        } else {
          throw new Error(formatVeoFailure(fallbackResult.failureStatus, fallbackResult.failureText ?? "Unknown Veo error"));
        }
      } else {
        if (primaryPayload.hasImageGuidance && shouldRetryWithoutImageGuidance(result.failureStatus, result.failureText)) {
          throw new Error(
            `${formatVeoFailure(result.failureStatus, result.failureText ?? "Unknown Veo error")}\n\nVeo rejected the image-guided request using ${primaryPayload.guidanceMode} guidance and ${primaryPayload.imagePayloadFormat} images. No text-only fallback was run, because that can create an unrelated video. Try VEO_GUIDANCE_MODE=first-frame for cheaper source-frame-only guidance, VEO_IMAGE_PAYLOAD_FORMAT=inlineData/imageBytes/bytesBase64Encoded if Google changes the preview request shape, or switch to a Veo 3.1 model/account that accepts image guidance. Set VEO_ALLOW_TEXT_ONLY_FALLBACK=1 only if you explicitly want prompt-only generations.`,
          );
        }
        throw new Error(formatVeoFailure(result.failureStatus, result.failureText ?? "Unknown Veo error"));
      }
    }

    if (!result.ok || !result.operation) {
      throw new Error(formatVeoFailure(result.failureStatus, result.failureText ?? "Unknown Veo error"));
    }

    if (!result.operation.name) {
      throw new Error("Veo did not return an operation name");
    }
    return { providerJobId: result.operation.name };
  }

  async getStatus(job: GenerationJob, input: GenerateMotionInput): Promise<ProviderJobStatus> {
    const apiKey = readApiKey();
    if (!job.providerJobId) return { status: "failed", error: "Missing Veo operation id" };

    const res = await fetch(`${readBaseUrl()}/${job.providerJobId}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { status: "failed", error: `Veo status failed: ${res.status} ${text}` };
    }

    const operation = (await res.json()) as VeoOperation;
    if (operation.error) {
      return {
        status: "failed",
        error: operation.error.message ?? operation.error.status ?? "Veo generation failed",
      };
    }
    if (!operation.done) return { status: "running" };

    const video = extractGeneratedVideo(operation);
    if (!video) return { status: "failed", error: "Veo completed without a downloadable video" };

    let bytes: ArrayBuffer;
    if (video.bytesBase64Encoded) {
      bytes = arrayBufferFromBuffer(Buffer.from(video.bytesBase64Encoded, "base64"));
    } else if (video.uri) {
      const download = await fetch(video.uri, {
        headers: { "x-goog-api-key": apiKey },
        redirect: "follow",
      });
      if (!download.ok) {
        const text = await download.text().catch(() => download.statusText);
        return { status: "failed", error: `Veo video download failed: ${download.status} ${text}` };
      }
      bytes = await download.arrayBuffer();
    } else {
      return { status: "failed", error: "Veo completed without video bytes or URI" };
    }

    const videoUrl = await motionRepo.saveGeneratedVideo({
      projectId: input.projectId,
      jobId: job.id,
      bytes,
      ext: "mp4",
    });
    return { status: "succeeded", videoUrl };
  }
}

export type VeoHealthStatus = {
  provider: "veo";
  configured: boolean;
  ok: boolean;
  mode: "config" | "live";
  model: string;
  baseUrl: string;
  checkedAt: string;
  message: string;
  statusCode?: number;
};

export async function checkVeoHealth(input?: {
  performNetworkCheck?: boolean;
}): Promise<VeoHealthStatus> {
  const model = readModel();
  const baseUrl = readBaseUrl();
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const checkedAt = new Date().toISOString();
  const mode: VeoHealthStatus["mode"] = input?.performNetworkCheck === false ? "config" : "live";

  if (!key) {
    return {
      provider: "veo",
      configured: false,
      ok: false,
      mode,
      model,
      baseUrl,
      checkedAt,
      message: "Missing GEMINI_API_KEY or GOOGLE_API_KEY",
    };
  }

  if (!input?.performNetworkCheck) {
    return {
      provider: "veo",
      configured: true,
      ok: true,
      mode: "config",
      model,
      baseUrl,
      checkedAt,
      message: "Veo API key is configured",
    };
  }

  try {
    const res = await fetch(`${baseUrl}/models?pageSize=1`, {
      method: "GET",
      headers: { "x-goog-api-key": key },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return {
        provider: "veo",
        configured: true,
        ok: false,
        mode,
        model,
        baseUrl,
        checkedAt,
        statusCode: res.status,
        message: `Veo API check failed: ${res.status} ${trimMessage(text)}`,
      };
    }
    return {
      provider: "veo",
      configured: true,
      ok: true,
      mode,
      model,
      baseUrl,
      checkedAt,
      statusCode: res.status,
      message: "Veo API reachable",
    };
  } catch (err) {
    return {
      provider: "veo",
      configured: true,
      ok: false,
      mode,
      model,
      baseUrl,
      checkedAt,
      message: `Veo API network check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function readApiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("Veo requires GEMINI_API_KEY or GOOGLE_API_KEY on the API server");
  }
  return key;
}

function readModel(): string {
  return process.env.VEO_MODEL ?? "veo-3.1-generate-preview";
}

function readBaseUrl(): string {
  return process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
}

function normalizeVeoDuration(durationSeconds: number): 4 | 6 | 8 {
  if (durationSeconds <= 4) return 4;
  if (durationSeconds <= 6) return 6;
  return 8;
}

function expectsImageGuidance(input: GenerateMotionInput): boolean {
  return Boolean(input.firstFrameUrl || input.lastFrameUrl || input.referenceImageUrls.length > 0);
}

function allowTextOnlyFallback(): boolean {
  return process.env.VEO_ALLOW_TEXT_ONLY_FALLBACK === "1";
}

async function buildVeoPredictPayload(input: {
  input: GenerateMotionInput;
  model: string;
  includeImageGuidance: boolean;
  guidanceMode: VeoGuidanceMode;
}): Promise<{
  payload: VeoPredictPayload;
  hasImageGuidance: boolean;
  imagePayloadFormat: VeoImagePayloadFormat;
  guidanceMode: Exclude<VeoGuidanceMode, "auto">;
  failureStatus?: number;
  failureText?: string;
}> {
  const instance: Record<string, unknown> = {
    prompt: input.input.prompt,
  };
  let effectiveDuration = normalizeVeoDuration(input.input.durationSeconds);
  let hasImageGuidance = false;
  const imagePayloadFormat = readImagePayloadFormat(input.model);
  const guidanceMode = input.includeImageGuidance ? resolveGuidanceMode(input.model, input.guidanceMode) : "text-only";

  if (guidanceMode !== "text-only") {
    const firstFrame = await readInlineImage(input.input.projectId, input.input.firstFrameUrl);
    if (firstFrame) {
      instance.image = toVeoImagePayload(firstFrame, imagePayloadFormat);
      hasImageGuidance = true;
    }

    // lastFrame interpolation is documented for Veo 3.x models.
    const isVeo3Family = input.model.includes("veo-3");
    if (isVeo3Family) {
      if (guidanceMode === "first-last") {
        const lastFrame = await readInlineImage(input.input.projectId, input.input.lastFrameUrl);
        if (lastFrame) {
          instance.lastFrame = toVeoImagePayload(lastFrame, imagePayloadFormat);
          hasImageGuidance = true;
        }
      }

      // referenceImages requires explicit opt-in (VEO_REFERENCE_IMAGES=1) because it forces
      // durationSeconds=8 and is only available on specific account tiers — sending it without
      // access causes 400 BadRequest errors and wasted spend.
      if (process.env.VEO_REFERENCE_IMAGES === "1" && !input.model.includes("lite")) {
        const excludeUrls = new Set(
          [input.input.firstFrameUrl, input.input.lastFrameUrl].filter(Boolean) as string[],
        );
        const refUrls = input.input.referenceImageUrls
          .filter((url) => !excludeUrls.has(url))
          .slice(0, 3);

        if (refUrls.length > 0) {
          const refImages = (
            await Promise.all(refUrls.map((url) => readInlineImage(input.input.projectId, url)))
          ).filter((img): img is NonNullable<typeof img> => img !== null);

          if (refImages.length > 0) {
            instance.referenceImages = refImages.map((img) => ({
              image: toVeoImagePayload(img, imagePayloadFormat),
              referenceType: "asset",
            }));
            hasImageGuidance = true;
            // Veo API requires durationSeconds=8 when referenceImages are present.
            effectiveDuration = 8;
          }
        }
      }
    }
  }

  return {
    payload: {
      instances: [instance],
      parameters: {
        aspectRatio: input.input.aspectRatio,
        durationSeconds: effectiveDuration,
        personGeneration: resolvePersonGeneration(hasImageGuidance),
        resolution: process.env.VEO_RESOLUTION ?? "720p",
      },
    },
    hasImageGuidance,
    imagePayloadFormat,
    guidanceMode,
  };
}

type SubmitVeoResult = {
  ok: boolean;
  operation?: VeoOperation;
  failureStatus?: number;
  failureText?: string;
};

async function submitVeoPredict(input: {
  endpoint: string;
  apiKey: string;
  payload: VeoPredictPayload;
}): Promise<SubmitVeoResult> {
  const res = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": input.apiKey,
    },
    body: JSON.stringify(input.payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { ok: false, failureStatus: res.status, failureText: text };
  }
  return { ok: true, operation: (await res.json()) as VeoOperation };
}

function shouldRetryWithoutImageGuidance(status: number | undefined, text: string | undefined): boolean {
  if (!status || status !== 400 || !text) return false;
  const message = text.toLowerCase();
  return (
    message.includes("inlinedata") ||
    message.includes("imagebytes") ||
    message.includes("image") ||
    message.includes("unsupported video generation request") ||
    message.includes("not supported") ||
    message.includes("referenceimages") ||
    message.includes("lastframe")
  );
}

function resolvePersonGeneration(hasImageGuidance: boolean): string {
  // Veo 3.x requires allow_all for text-to-video and allow_adult for image-guided modes.
  // Do not let stale env values force an invalid request shape.
  return hasImageGuidance ? "allow_adult" : "allow_all";
}

function readImagePayloadFormat(model: string): VeoImagePayloadFormat {
  const raw = process.env.VEO_IMAGE_PAYLOAD_FORMAT;
  if (raw === "inlineData" || raw === "imageBytes" || raw === "bytesBase64Encoded") {
    return raw;
  }

  // The public REST examples show inlineData, but the preview Lite surface can reject that
  // exact field. Keep Lite on the alternate raw-image shape unless explicitly overridden.
  return model.includes("lite") ? "bytesBase64Encoded" : "inlineData";
}

function readGuidanceMode(model: string): VeoGuidanceMode {
  const raw = process.env.VEO_GUIDANCE_MODE;
  if (raw === "auto" || raw === "first-last" || raw === "first-frame" || raw === "text-only") {
    return raw;
  }
  return model.includes("lite") ? "first-frame" : "first-last";
}

function resolveGuidanceMode(
  model: string,
  mode: VeoGuidanceMode,
): Exclude<VeoGuidanceMode, "auto"> {
  if (mode === "auto") return model.includes("lite") ? "first-frame" : "first-last";
  return mode;
}

function toVeoImagePayload(image: InlineImage, format: VeoImagePayloadFormat): Record<string, unknown> {
  if (format === "inlineData") {
    return {
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64,
      },
    };
  }
  if (format === "imageBytes") {
    return {
      imageBytes: image.base64,
      mimeType: image.mimeType,
    };
  }
  return {
    bytesBase64Encoded: image.base64,
    mimeType: image.mimeType,
  };
}

function formatVeoFailure(status: number | undefined, text: string): string {
  return `Veo request failed: ${status ?? "unknown"} ${text}`;
}

async function readInlineImage(
  projectId: string,
  url: string | undefined,
): Promise<InlineImage | null> {
  if (!url) return null;
  const path = artifactPathFromUrl(projectId, url);
  if (!path) return null;
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const bytes = await file.arrayBuffer();
  const mimeType = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return {
    mimeType,
    base64: Buffer.from(bytes).toString("base64"),
  };
}

function arrayBufferFromBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}

function extractGeneratedVideo(operation: VeoOperation): {
  uri?: string;
  bytesBase64Encoded?: string;
} | null {
  const sample =
    operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video ??
    operation.response?.generatedVideos?.[0]?.video;
  return sample ?? null;
}

function trimMessage(message: string, max = 220): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}
