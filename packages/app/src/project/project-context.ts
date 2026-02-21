import { createContext, useContext } from "react";
import type { ProjectFile } from "./schemas";

export type ProjectContextValue = {
  projectFile: ProjectFile;
  projectId: string;
  sceneId: string;
  threadId: string;
  sessionId: string;
  version: number;
  setVersion: (version: number) => void;
};

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (ctx === null) {
    throw new Error("useProject must be used within a <ProjectLoader>");
  }
  return ctx;
}

const STORAGE_KEY = "dreamer:projectId";

export function getSavedProjectId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveProjectId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable — ignore
  }
}
