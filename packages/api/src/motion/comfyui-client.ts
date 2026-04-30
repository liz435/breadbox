// ComfyUI REST API client for RIFE frame interpolation.

export type ComfyImageRef = { name: string; subfolder: string; type: string };

class ComfyUiHttpError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
    readonly statusText: string,
    detail: string,
  ) {
    super(
      `ComfyUI ${endpoint} failed (${status} ${statusText})${detail ? `: ${detail.slice(0, 500)}` : ""}`,
    );
    this.name = "ComfyUiHttpError";
  }
}

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

export function comfyRequestTimeoutMs(): number {
  return readPositiveIntEnv("COMFYUI_REQUEST_TIMEOUT_MS", 10_000);
}

export function comfyPrepTimeoutMs(): number {
  return readPositiveIntEnv("COMFYUI_PREP_TIMEOUT_MS", 90_000);
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requireComfyUiUrl(): string {
  const url = comfyUiUrl();
  if (!url) throw new Error("COMFYUI_URL is not configured");
  return url.replace(/\/+$/, "");
}

function comfyHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  const authHeader = process.env.COMFYUI_AUTH_HEADER?.trim();
  if (authHeader) next.set("Authorization", authHeader);
  return next;
}

async function fetchComfy(
  endpoint: string,
  init?: RequestInit,
  timeoutMs = comfyRequestTimeoutMs(),
): Promise<Response> {
  const baseUrl = requireComfyUiUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}${endpoint}`, {
      ...init,
      headers: comfyHeaders(init?.headers),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`ComfyUI ${endpoint} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertComfyOk(endpoint: string, res: Response): Promise<Response> {
  if (res.ok) return res;
  const detail = await res.text().catch(() => "");
  throw new ComfyUiHttpError(endpoint, res.status, res.statusText, detail);
}

export async function uploadImageToComfyUI(
  filePath: string,
  filename: string,
): Promise<ComfyImageRef> {
  const bytes = await Bun.file(filePath).arrayBuffer();
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/jpeg" }), filename);

  const endpoint = "/upload/image";
  const res = await fetchComfy(endpoint, {
    method: "POST",
    body: form,
  });
  await assertComfyOk(endpoint, res);
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
        dtype: "float32",
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
  const prompt = buildRifeWorkflowJson(frameARef, frameBRef, outputFrameCount);

  const endpoint = "/prompt";
  const res = await fetchComfy(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  await assertComfyOk(endpoint, res);
  const json = (await res.json()) as { prompt_id?: unknown };
  if (typeof json.prompt_id !== "string" || json.prompt_id.length === 0) {
    throw new Error(
      `ComfyUI queue response missing prompt_id: ${JSON.stringify(json).slice(0, 500)}`,
    );
  }
  return json.prompt_id;
}

export async function getRifeResult(promptId: string): Promise<ComfyImageRef[] | null> {
  const endpoint = `/history/${encodeURIComponent(promptId)}`;
  const res = await fetchComfy(endpoint);
  await assertComfyOk(endpoint, res);
  const json = (await res.json()) as Record<
    string,
    {
      status?: { status_str?: string; completed?: boolean; messages?: [string, { exception_message?: string; node_id?: string }][] };
      outputs?: Record<string, { images?: ComfyImageRef[] }>;
    }
  >;
  const entry = json[promptId];
  if (!entry) return null;

  // Fail fast on workflow execution errors rather than waiting for timeout.
  const status = entry.status;
  if (status?.status_str === "error") {
    const errMsg = status.messages?.find(([type]) => type === "execution_error")?.[1]?.exception_message;
    throw new Error(`ComfyUI workflow failed: ${errMsg ?? "unknown error"}`);
  }

  const images = entry.outputs?.["5"]?.images;
  if (!Array.isArray(images) || images.length === 0) return null;
  return [...images].sort((a, b) => a.name.localeCompare(b.name));
}

export async function pollRifeResult(
  promptId: string,
  timeoutMs = 60_000,
): Promise<ComfyImageRef[]> {
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

        const sorted = await getRifeResult(promptId);
        if (sorted && sorted.length > 0) {
          cleanup();
          resolve(sorted);
        }
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("ComfyUI polling failed"));
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
  const params = new URLSearchParams({
    filename: ref.name,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  const endpoint = `/view?${params.toString()}`;
  const res = await fetchComfy(endpoint);
  await assertComfyOk(endpoint, res);
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
    const [statsRes, objectInfoRes] = await Promise.all([
      fetchComfy("/system_stats"),
      fetchComfy("/object_info/RIFE%20VFI"),
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

    if (!objectInfoRes.ok) {
      return {
        provider: "comfyui",
        configured: true,
        ok: false,
        mode: "live",
        baseUrl,
        checkedAt,
        message: "ComfyUI connected but RIFE VFI node is unavailable — ensure ComfyUI-Frame-Interpolation is installed",
        features,
        statusCode: objectInfoRes.status,
      };
    }

    // Verify at least one checkpoint is listed — a 400 results from queuing
    // with ckpt_name when the file hasn't been downloaded yet.
    const objectInfo = (await objectInfoRes.json()) as Record<string, unknown>;
    const ckptChoices = (
      (objectInfo["RIFE VFI"] as Record<string, unknown> | undefined)
        ?.input as Record<string, unknown> | undefined
    )?.required;
    const ckptList = (ckptChoices as Record<string, unknown[][]> | undefined)?.ckpt_name?.[0];
    const hasCheckpoint = Array.isArray(ckptList) && ckptList.length > 0;

    const rifeReady = hasCheckpoint;
    return {
      provider: "comfyui",
      configured: true,
      ok: rifeReady,
      mode: "live",
      baseUrl,
      checkedAt,
      message: rifeReady
        ? "ComfyUI connected with RIFE VFI available"
        : "ComfyUI connected but no RIFE checkpoint found — redeploy the ComfyUI service to download rife47.pth",
      features: {
        ...features,
        rife: rifeReady,
        preview: rifeReady,
        transition: rifeReady,
        provider: rifeReady,
      },
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
