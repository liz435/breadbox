import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  ProjectContext,
  type ProjectContextValue,
  getSavedProjectId,
  saveProjectId,
} from "./project-context";
import { fetchProject, createProject, ApiError } from "./api-client";
import { API_PORT } from "@dreamer/config";
import type { ProjectFile } from "./schemas";
import { isAnonymousPreview } from "@/auth/use-current-user";
import { createPreviewProjectFile } from "./preview-project";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; projectFile: ProjectFile };

const SESSION_ID = crypto.randomUUID();

async function loadProject(): Promise<ProjectFile> {
  // Anonymous visitors on hosted deploys: skip the API entirely and boot
  // from a bundled example. Saves / mutations are gated separately in
  // api-client and surface a sign-in prompt.
  if (isAnonymousPreview()) {
    return createPreviewProjectFile();
  }

  const savedId = getSavedProjectId();

  if (savedId) {
    try {
      return await fetchProject(savedId);
    } catch (err) {
      // If the saved project was deleted, fall through to create
      if (err instanceof ApiError && err.status === 404) {
        // fall through
      } else {
        throw err;
      }
    }
  }

  const projectFile = await createProject();
  saveProjectId(projectFile.project.id);
  return projectFile;
}

export function ProjectLoader({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  const load = useCallback((targetId?: string) => {
    setState({ status: "loading" });
    const doLoad = targetId
      ? fetchProject(targetId).then((pf) => {
          saveProjectId(pf.project.id);
          return pf;
        })
      : loadProject();
    doLoad
      .then((projectFile) => {
        setVersion(projectFile.project.version);
        setState({ status: "ready", projectFile });
      })
      .catch((err) =>
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const switchProject = useCallback(
    (targetId: string) => {
      load(targetId);
    },
    [load],
  );

  const contextValue = useMemo<ProjectContextValue | null>(() => {
    if (state.status !== "ready") return null;
    const { projectFile } = state;
    return {
      projectFile,
      projectId: projectFile.project.id,
      sceneId: projectFile.project.activeSceneId,
      threadId: projectFile.project.threadId,
      sessionId: SESSION_ID,
      version,
      setVersion,
      switchProject,
    };
  }, [state, version, switchProject]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-neutral-300" />
        <p className="text-sm">Loading project...</p>
      </div>
    );
  }

  if (state.status === "error") {
    const isNetworkError = state.message.includes("fetch") || state.message.includes("Failed") || state.message.includes("NetworkError");
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-muted-foreground px-8">
        <div className="rounded-full bg-red-500/10 p-4">
          <svg viewBox="0 0 24 24" className="size-8 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx={12} cy={12} r={10} />
            <line x1={12} y1={8} x2={12} y2={12} />
            <line x1={12} y1={16} x2={12.01} y2={16} />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-foreground">
            {isNetworkError ? "Can't connect to the server" : "Failed to load project"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {isNetworkError
              ? `Make sure the API server is running on port ${API_PORT}. Run \`bun run dev:api\` in a terminal.`
              : state.message}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => load()}
            className="rounded bg-muted px-4 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("dreamer:projectId");
              load();
            }}
            className="rounded border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            New Project
          </button>
        </div>
      </div>
    );
  }

  if (contextValue === null) {
    return null;
  }

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
}
