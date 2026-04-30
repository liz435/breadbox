// ComfyUI REST API client for RIFE frame interpolation.

export type ComfyImageRef = { name: string; subfolder: string; type: string };

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
        multiplier,
        fast_mode: true,
        ensemble: true,
        scale_factor: 1.0,
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
        const json = (await res.json()) as Record<
          string,
          { outputs?: Record<string, { images?: ComfyImageRef[] }> }
        >;
        const entry = json[promptId];
        const images = entry?.outputs?.["5"]?.images;
        if (Array.isArray(images) && images.length > 0) {
          const sorted = [...images].sort((a, b) => a.name.localeCompare(b.name));
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
