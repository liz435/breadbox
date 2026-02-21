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
