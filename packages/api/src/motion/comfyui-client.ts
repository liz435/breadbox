// ComfyUI REST API client for RIFE frame interpolation.

export type ComfyImageRef = { name: string; subfolder: string; type: string };

export type ComfyProviderHealth = {
  provider: "comfyui";
  configured: boolean;
  ok: boolean;
  mode: "config" | "live";
  baseUrl: string | null;
  checkedAt: string;
  message: string;
  features: {
    rife: boolean;
    preview: boolean;
    transition: boolean;
    provider: boolean;
    targetFrameWorkflow: boolean;
    maskWorkflow: boolean;
    controlWorkflow: boolean;
  };
  statusCode?: number;
};

export function comfyUiUrl(): string | null {
  const url = process.env.COMFYUI_URL?.trim();
  return url && url.length > 0 ? url : null;
}

export function comfyRifeFrameCount(): number {
  const raw = process.env.COMFYUI_RIFE_FRAMES;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 2 ? parsed : 8;
}

function requireComfyUiUrl(): string {
  const url = comfyUiUrl();
  if (!url) throw new Error("COMFYUI_URL is not configured");
  return url.replace(/\/+$/, "");
}

export async function uploadImageToComfyUI(
  filePath: string,
  filename: string,
): Promise<ComfyImageRef> {
  const baseUrl = requireComfyUiUrl();
  const bytes = await Bun.file(filePath).arrayBuffer();
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/jpeg" }), filename);

  const res = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI upload failed (${res.status} ${res.statusText}): ${detail.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as { name?: string; subfolder?: string; type?: string };
  if (typeof json.name !== "string" || typeof json.type !== "string") {
    throw new Error(
      `ComfyUI upload returned unexpected response: ${JSON.stringify(json).slice(0, 500)}`,
    );
  }
  return {
    name: json.name,
    subfolder: typeof json.subfolder === "string" ? json.subfolder : "",
    type: json.type,
  };
}

function imageInputPath(ref: ComfyImageRef): string {
  return ref.subfolder ? `${ref.subfolder}/${ref.name}` : ref.name;
}

export function buildRifeWorkflowJson(
  frameARef: ComfyImageRef,
  frameBRef: ComfyImageRef,
  multiplier: number,
): Record<string, unknown> {
  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: imageInputPath(frameARef) },
    },
    "2": {
      class_type: "LoadImage",
      inputs: { image: imageInputPath(frameBRef) },
    },
    "3": {
      class_type: "ImageBatch",
      inputs: { image1: ["1", 0], image2: ["2", 0] },
    },
    "4": {
      class_type: "RIFE VFI",
      inputs: {
        frames: ["3", 0],
        clear_cache_after_n_frames: 10,
        multiplier,
        fast_mode: true,
        ensemble: true,
        scale_factor: 1.0,
        dtype: "fp32",
        torch_compile: false,
        batch_size: 1,
        ckpt_name: "rife47.pth",
      },
    },
    "5": {
      class_type: "SaveImage",
      inputs: { images: ["4", 0], filename_prefix: "rife_out" },
    },
  };
}

export async function queueRifeWorkflow(
  frameARef: ComfyImageRef,
  frameBRef: ComfyImageRef,
  outputFrameCount: number,
): Promise<string> {
  const baseUrl = requireComfyUiUrl();
  const prompt = buildRifeWorkflowJson(frameARef, frameBRef, outputFrameCount);

  const res = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI queue failed (${res.status} ${res.statusText}): ${detail.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as { prompt_id?: unknown };
  if (typeof json.prompt_id !== "string" || json.prompt_id.length === 0) {
    throw new Error(
      `ComfyUI queue response missing prompt_id: ${JSON.stringify(json).slice(0, 500)}`,
    );
  }
  return json.prompt_id;
}

export async function getRifeResult(promptId: string): Promise<ComfyImageRef[] | null> {
  const baseUrl = requireComfyUiUrl();
  const res = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI history failed (${res.status} ${res.statusText}): ${detail.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as Record<
    string,
    { outputs?: Record<string, { images?: ComfyImageRef[] }> }
  >;
  const images = json[promptId]?.outputs?.["5"]?.images;
  if (!Array.isArray(images) || images.length === 0) return null;
  return [...images].sort((a, b) => a.name.localeCompare(b.name));
}

export async function pollRifeResult(
  promptId: string,
  timeoutMs = 60_000,
): Promise<ComfyImageRef[]> {
  const baseUrl = requireComfyUiUrl();
  const startedAt = Date.now();

  return new Promise<ComfyImageRef[]>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;

    const cleanup = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const elapsed = Date.now() - startedAt;
        if (elapsed > timeoutMs) {
          cleanup();
          reject(
            new Error(
              `ComfyUI prompt ${promptId} timed out after ${elapsed}ms (limit ${timeoutMs}ms)`,
            ),
          );
          return;
        }

        const res = await fetch(
          `${baseUrl}/history/${encodeURIComponent(promptId)}`,
        );
        if (!res.ok) {
          // Transient errors are retried until timeout.
          return;
        }
        const sorted = await getRifeResult(promptId);
        if (sorted && sorted.length > 0) {
          cleanup();
          resolve(sorted);
        }
      } catch {
        // Swallow transient fetch errors; will retry on next tick or time out.
      } finally {
        inFlight = false;
      }
    };

    timer = setInterval(tick, 1000);
    // Kick off an immediate first poll so short jobs don't wait a full second.
    void tick();
  });
}

export async function downloadComfyFrame(ref: ComfyImageRef): Promise<ArrayBuffer> {
  const baseUrl = requireComfyUiUrl();
  const params = new URLSearchParams({
    filename: ref.name,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  const res = await fetch(`${baseUrl}/view?${params.toString()}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI download failed (${res.status} ${res.statusText}): ${detail.slice(0, 500)}`,
    );
  }
  return res.arrayBuffer();
}

export async function checkComfyUiHealth(input?: {
  performNetworkCheck?: boolean;
}): Promise<ComfyProviderHealth> {
  const baseUrl = comfyUiUrl();
  const checkedAt = new Date().toISOString();
  const hasTargetFrameWorkflow = Boolean(process.env.COMFYUI_TARGET_FRAME_WORKFLOW_PATH?.trim());
  const hasMaskWorkflow = Boolean(process.env.COMFYUI_MASK_WORKFLOW_PATH?.trim());
  const hasControlWorkflow = Boolean(process.env.COMFYUI_CONTROL_WORKFLOW_PATH?.trim());
  const features = {
    rife: false,
    preview: false,
    transition: false,
    provider: false,
    targetFrameWorkflow: hasTargetFrameWorkflow,
    maskWorkflow: hasMaskWorkflow,
    controlWorkflow: hasControlWorkflow,
  };

  if (!baseUrl) {
    return {
      provider: "comfyui",
      configured: false,
      ok: false,
      mode: input?.performNetworkCheck === false ? "config" : "live",
      baseUrl: null,
      checkedAt,
      message: "COMFYUI_URL is not configured",
      features,
    };
  }

  if (input?.performNetworkCheck === false) {
    return {
      provider: "comfyui",
      configured: true,
      ok: true,
      mode: "config",
      baseUrl,
      checkedAt,
      message: "COMFYUI_URL is configured",
      features: {
        ...features,
        rife: true,
        preview: true,
        transition: true,
        provider: true,
      },
    };
  }

  try {
    const normalized = baseUrl.replace(/\/+$/, "");
    const [statsRes, objectInfoRes] = await Promise.all([
      fetch(`${normalized}/system_stats`),
      fetch(`${normalized}/object_info/RIFE%20VFI`),
    ]);
    if (!statsRes.ok) {
      return {
        provider: "comfyui",
        configured: true,
        ok: false,
        mode: "live",
        baseUrl,
        checkedAt,
        message: `ComfyUI did not respond (${statsRes.status} ${statsRes.statusText})`,
        features,
        statusCode: statsRes.status,
      };
    }

    const rifeReady = objectInfoRes.ok;
    return {
      provider: "comfyui",
      configured: true,
      ok: rifeReady,
      mode: "live",
      baseUrl,
      checkedAt,
      message: rifeReady ? "ComfyUI connected with RIFE VFI available" : "ComfyUI connected but RIFE VFI is unavailable",
      features: {
        ...features,
        rife: rifeReady,
        preview: rifeReady,
        transition: rifeReady,
        provider: rifeReady,
      },
      statusCode: rifeReady ? undefined : objectInfoRes.status,
    };
  } catch (err) {
    return {
      provider: "comfyui",
      configured: true,
      ok: false,
      mode: "live",
      baseUrl,
      checkedAt,
      message: err instanceof Error ? err.message : "ComfyUI health check failed",
      features,
    };
  }
}
