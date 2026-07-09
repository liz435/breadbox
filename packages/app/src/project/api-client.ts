import { API_ORIGIN } from "@dreamer/config";
import { projectFileSchema, type ProjectFile } from "./schemas";
import { z } from "zod";
import { refreshCurrentUser, isAnonymousPreview } from "@/auth/use-current-user";
import { getCapabilities } from "./use-capabilities";
import { toast } from "@/components/ui/toast";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ── Auth-aware fetch plumbing ────────────────────────────────────────────
//
// Every API call threads through `resolveFetchOptions` so the browser
// attaches session cookies when present.
// The fetch is same-origin in prod (static UI served by the Elysia API)
// and via Vite's /api proxy in dev, so `credentials: "include"` is
// sufficient — no bearer token in the URL or headers.
//
// On 401 we invalidate the cached auth snapshot so the next render of
// the App gate observes the logged-out state, then:
//   - hosted:  redirect to /auth/sign-in with the current path so the
//              post-callback redirect lands back where the user was.
//              Preserves query + hash.
//   - dev:     CLI mode is single-tenant with auth bypassed, so a 401
//              here means a Host/Origin gate fired — log and surface a
//              toast instead of redirecting.

/**
 * Merge auth-aware defaults into a RequestInit. Always sets
 * `credentials: "include"` so same-origin cookies attach. Preserves any
 * caller-supplied headers and init fields.
 */
export function resolveFetchOptions(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: "include",
  };
}

let unauthorizedHandled = false;
let previewPromptShown = false;

/**
 * Returns true when the current page is viewing the app without a
 * session on a hosted deploy. Mutating endpoints short-circuit in this
 * state and surface a "Sign in to save" prompt instead of hitting the
 * server just to receive a 401.
 */
export function isInAnonymousPreview(): boolean {
  return isAnonymousPreview();
}

/**
 * Navigate to the server's sign-in route. Dead path on the local server
 * (isHosted is always false, and /auth/sign-in 404s) — kept only because
 * the hosted-preview components still reference it.
 */
export function redirectToSignIn(): void {
  if (typeof window === "undefined") return;
  const redirect = window.location.pathname + window.location.search;
  window.location.assign(
    `/auth/sign-in?redirect=${encodeURIComponent(redirect)}`,
  );
}

/**
 * Surfaces the "sign in to save" prompt at most once per page load so
 * repeated save attempts don't spam the toast stack.
 */
function promptSignInOnce(action: string): void {
  if (previewPromptShown) return;
  previewPromptShown = true;
  toast.info(`Sign in with GitHub to ${action}.`);
  // Allow the banner/button click handlers to re-prompt after dismissal.
  setTimeout(() => {
    previewPromptShown = false;
  }, 8000);
}

async function handleUnauthorized(): Promise<void> {
  // Guard against a stampede of 401s from a page's initial in-flight
  // requests all redirecting at once. The first wins; the rest fall
  // through silently after the cache is already invalidated.
  if (unauthorizedHandled) return;
  unauthorizedHandled = true;

  await refreshCurrentUser();

  try {
    // Anonymous-preview mode: the page is intentionally unauthenticated;
    // mutating calls that leak through to the server and 401 should NOT
    // redirect, or the preview experience breaks. The mutation itself
    // already surfaced the sign-in prompt.
    if (isAnonymousPreview()) return;

    const caps = await getCapabilities();
    if (caps.hosted && typeof window !== "undefined") {
      redirectToSignIn();
      return;
    }
    // Local mode: no OAuth to kick off. Surface the state so the user
    // knows to restart the CLI. Don't redirect — the login screen is
    // rendered by the App gate once the auth snapshot re-resolves.
    toast.error(
      "Session invalid — restart `dreamer headed` in your terminal to generate a new URL.",
    );
  } finally {
    // Give the redirect / toast time to land, then clear the flag so a
    // later sign-in cycle can trigger this path again.
    setTimeout(() => {
      unauthorizedHandled = false;
    }, 2000);
  }
}

/**
 * Used by mutating functions to bail out of API calls when the visitor
 * is browsing as an anonymous preview. Shows a single toast per sliding
 * window telling them which action required auth, then throws so the
 * caller's save/compile/etc handler can stop cleanly.
 */
function blockMutationIfPreview(action: string): void {
  if (!isAnonymousPreview()) return;
  promptSignInOnce(action);
  throw new ApiError(401, `preview: sign in to ${action}`);
}

/**
 * Low-level wrapper around `fetch` that attaches auth and routes 401
 * through the redirect / toast flow before rethrowing as an ApiError.
 */
async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, resolveFetchOptions(init));
  if (res.status === 401) {
    void handleUnauthorized();
  }
  return res;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const url = `${API_ORIGIN}${path}`;
  const res = await authedFetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }

  const json: unknown = await res.json();
  return schema.parse(json);
}

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  hasContent: boolean;
};

export async function listProjects(): Promise<ProjectSummary[]> {
  // Anonymous preview has one ephemeral in-memory project and no server
  // state to enumerate. Return empty so the selector collapses cleanly
  // and no "Failed to load project list" toast fires from the 401.
  if (isAnonymousPreview()) return [];
  const url = `${API_ORIGIN}/project`;
  const res = await authedFetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
  return res.json();
}

export async function renameProject(
  projectId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  blockMutationIfPreview("rename projects");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}`;
  const res = await authedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
  return res.json();
}

export async function renameScene(
  projectId: string,
  sceneId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  blockMutationIfPreview("rename scenes");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`;
  const res = await authedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
  return res.json();
}

export function fetchProject(projectId: string): Promise<ProjectFile> {
  return request(`/project/${encodeURIComponent(projectId)}`, projectFileSchema);
}

// ── Last-opened project ──────────────────────────────────────────────────
//
// The server keeps a record of the last project each user opened so a
// fresh launch reopens where they left off. This is deliberately NOT
// localStorage-only: the desktop app loads from `localhost:<port>` where
// the port can change between launches, and localStorage is per-origin,
// so a client-side record silently vanishes whenever the port shifts.

const lastOpenedResponseSchema = z.object({
  projectId: z.string().nullable(),
});

/**
 * Last project the user opened, validated server-side to still exist.
 * Returns null on any failure — callers fall back to localStorage or a
 * fresh project.
 */
export async function fetchLastOpenedProjectId(): Promise<string | null> {
  if (isAnonymousPreview()) return null;
  try {
    const res = await authedFetch(`${API_ORIGIN}/project/last-opened`);
    if (!res.ok) return null;
    return lastOpenedResponseSchema.parse(await res.json()).projectId;
  } catch {
    return null;
  }
}

/** Best-effort record of the open so the next launch resumes here. */
export async function saveLastOpenedProjectId(projectId: string): Promise<void> {
  if (isAnonymousPreview()) return;
  try {
    await authedFetch(`${API_ORIGIN}/project/last-opened`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
  } catch {
    // Non-fatal — the next launch falls back to localStorage.
  }
}

export function createProject(params?: {
  id?: string;
  name?: string;
}): Promise<ProjectFile> {
  blockMutationIfPreview("create a project");
  return request(`/project`, projectFileSchema, {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
}

export async function saveProjectGraph(
  projectId: string,
  graph: { nodes: Record<string, unknown>; edges: Record<string, unknown> }
): Promise<void> {
  blockMutationIfPreview("save your project");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/graph`;
  const res = await authedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
}

export async function saveBoardState(
  projectId: string,
  boardState: Record<string, unknown>,
): Promise<void> {
  blockMutationIfPreview("save your project");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/board`;
  const res = await authedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(boardState),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
}

/**
 * Atomic combined save: persists board state and graph in a single
 * read-modify-write on the server. Prefer this over calling
 * `saveBoardState` and `saveProjectGraph` in parallel — concurrent
 * single-field writes can clobber each other's field.
 *
 * Pass `undefined` for either field to leave it untouched on disk.
 */
export async function saveProjectState(
  projectId: string,
  payload: {
    boardState?: Record<string, unknown>;
    graph?: { nodes: Record<string, unknown>; edges: Record<string, unknown> };
  },
): Promise<void> {
  blockMutationIfPreview("save your project");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/state`;
  const res = await authedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
}

export async function uploadProjectAsset(
  projectId: string,
  file: File
): Promise<{ assetId: string; filename: string; uri: string; size: number; assetType: string }> {
  blockMutationIfPreview("upload assets");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/assets`;
  const formData = new FormData();
  formData.append("file", file);
  const res = await authedFetch(url, { method: "POST", body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
  return res.json();
}

export async function listProjectAssets(
  projectId: string,
): Promise<Array<{ id: string; projectId: string; type: string; uri: string; meta: Record<string, unknown> }>> {
  // Preview project has no server-side assets; skip the 401 round-trip.
  if (isAnonymousPreview()) return [];
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/assets`;
  const res = await authedFetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
  return res.json();
}

export async function renameProjectAsset(
  projectId: string,
  assetId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  blockMutationIfPreview("rename assets");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;
  const res = await authedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
  return res.json();
}

export async function deleteProject(projectId: string): Promise<void> {
  blockMutationIfPreview("delete projects");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}`;
  const res = await authedFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
}

export async function deleteProjectAsset(
  projectId: string,
  assetId: string,
): Promise<void> {
  blockMutationIfPreview("delete assets");
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;
  const res = await authedFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
}

/**
 * Reclaim imported 3D-model files that no assembly body references anymore.
 * Fire-and-forget on project open; a no-op for the preview project (no
 * server-side assets).
 */
export async function sweepProjectAssets(
  projectId: string,
): Promise<{ removed: number; marked: number; bytesReclaimed: number }> {
  if (isAnonymousPreview()) return { removed: 0, marked: 0, bytesReclaimed: 0 };
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/assets/sweep`;
  const res = await authedFetch(url, { method: "POST" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
  return res.json();
}
