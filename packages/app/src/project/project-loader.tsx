import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  ProjectContext,
  type ProjectContextValue,
  getSavedProjectId,
  saveProjectId,
} from "./project-context";
import { fetchProject, createProject, ApiError } from "./api-client";
import type { ProjectFile } from "./schemas";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; projectFile: ProjectFile };

const SESSION_ID = crypto.randomUUID();

async function loadProject(): Promise<ProjectFile> {
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
      <div className="flex h-full w-full items-center justify-center text-neutral-400">
        Loading project...
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-neutral-400">
        <p>Failed to load project</p>
        <p className="text-sm text-neutral-500">{state.message}</p>
        <button
          type="button"
          onClick={() => load()}
          className="rounded border border-neutral-600 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-700"
        >
          Retry
        </button>
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
