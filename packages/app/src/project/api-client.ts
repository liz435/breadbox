import { API_ORIGIN } from "@dreamer/config";
import { projectFileSchema, type ProjectFile } from "./schemas";
import type { z } from "zod";
import { refreshCurrentUser } from "@/auth/use-current-user";
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
// attaches the session cookie (`dreamer_session` hosted, `dreamer_local`
// locally). The fetch is same-origin in prod (static UI served by the
// Elysia API) and via Vite's /api proxy in dev, so `credentials: "include"`
// is sufficient — no bearer token, no `window.__DREAMER__.localToken`.
//
// On 401 we invalidate the cached auth snapshot so the next render of
// the App gate observes the logged-out state, then:
//   - hosted:  redirect to /api/auth/github/start with the current path
//              so the post-callback redirect lands back where the user
//              was. Preserves query + hash.
//   - local:   a cookie was expected but wasn't accepted. Can't redirect
//              (no OAuth in local mode); show a toast telling the user
//              to restart the CLI to mint a fresh bootstrap URL.
//   - dev:     should never happen (auth is skipped), but log it.

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

async function handleUnauthorized(): Promise<void> {
  // Guard against a stampede of 401s from a page's initial in-flight
  // requests all redirecting at once. The first wins; the rest fall
  // through silently after the cache is already invalidated.
  if (unauthorizedHandled) return;
  unauthorizedHandled = true;

  await refreshCurrentUser();

  try {
    const caps = await getCapabilities();
    if (caps.hosted && typeof window !== "undefined") {
      const redirect = window.location.pathname + window.location.search;
      window.location.assign(
        `/api/auth/github/start?redirect=${encodeURIComponent(redirect)}`,
      );
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

export function createProject(params?: {
  id?: string;
  name?: string;
}): Promise<ProjectFile> {
  return request(`/project`, projectFileSchema, {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
}

export async function saveProjectGraph(
  projectId: string,
  graph: { nodes: Record<string, unknown>; edges: Record<string, unknown> }
): Promise<void> {
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
  const url = `${API_ORIGIN}/project/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;
  const res = await authedFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
}
