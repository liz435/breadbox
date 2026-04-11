import { API_ORIGIN } from "@dreamer/config";
import { projectFileSchema, type ProjectFile } from "./schemas";
import type { z } from "zod";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const url = `${API_ORIGIN}${path}`;
  const res = await fetch(url, {
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
};

export async function listProjects(): Promise<ProjectSummary[]> {
  const url = `${API_ORIGIN}/project`;
  const res = await fetch(url);
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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
  const res = await fetch(url, { method: "POST", body: formData });
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
  const res = await fetch(url);
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
  const res = await fetch(url, {
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
  const res = await fetch(url, { method: "DELETE" });
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
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${text}`);
  }
}
