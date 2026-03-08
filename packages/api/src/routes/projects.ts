import { join } from "path";
import { Elysia } from "elysia";
import { ZodError } from "zod";
import { applyOpsRequestSchema } from "../db/schemas";
import {
  OpValidationError,
  projectRepo,
  VersionConflictError,
} from "../db/project-repo";
import type { Asset } from "../db/schemas";

function mimeToAssetType(mimeType: string, ext: string): Asset["type"] {
  if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "sprite";
  if (mimeType.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"].includes(ext)) return "audio";
  if (mimeType.startsWith("video/") || ["mp4", "webm", "mov", "avi", "mkv", "m4v"].includes(ext)) return "video";
  if (["glsl", "wgsl", "frag", "vert", "hlsl"].includes(ext)) return "shader";
  if (["ts", "js", "tsx", "jsx"].includes(ext)) return "script";
  if (["json", "yaml", "yml", "txt", "md"].includes(ext)) return "text";
  if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "font";
  return "text";
}

export const projectRoutes = new Elysia({ prefix: "/project" })
  .get("/", async () => {
    return projectRepo.listProjects();
  })
  .post("/", async ({ body, set }) => {
    try {
      const payload = (body ?? {}) as { id?: string; name?: string; ensure?: boolean };
      const project = payload.ensure
        ? await projectRepo.getOrCreateProject({
            id: payload.id,
            name: payload.name,
          })
        : await projectRepo.createProject({
            id: payload.id,
            name: payload.name,
          });
      return project;
    } catch (error) {
      if (error instanceof OpValidationError) {
        set.status = 409;
        return { error: error.message };
      }
      throw error;
    }
  })
  .get("/:id", async ({ params, set }) => {
    const project = await projectRepo.readProject(params.id);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }
    return project;
  })
  .patch("/:id", async ({ params, body, set }) => {
    const payload = body as { name?: string } | null;
    const name = payload?.name?.trim();
    if (!name) {
      set.status = 400;
      return { error: "Name is required" };
    }
    const result = await projectRepo.renameProject(params.id, name);
    if (!result) {
      set.status = 404;
      return { error: "Project not found" };
    }
    return result;
  })
  .patch("/:id/scenes/:sceneId", async ({ params, body, set }) => {
    const payload = body as { name?: string } | null;
    const name = payload?.name?.trim();
    if (!name) {
      set.status = 400;
      return { error: "Name is required" };
    }
    const result = await projectRepo.renameScene(params.id, params.sceneId, name);
    if (!result) {
      set.status = 404;
      return { error: "Project or scene not found" };
    }
    return result;
  })
  .post("/:id/ops", async ({ params, body, set }) => {
    try {
      const input = applyOpsRequestSchema.parse(body);
      const result = await projectRepo.applyOps(params.id, input);
      if (!result) {
        set.status = 404;
        return { error: "Project not found" };
      }
      return {
        newVersion: result.newVersion,
        appliedOps: result.appliedOps,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        set.status = 400;
        return { error: "Invalid request payload", details: error.flatten() };
      }
      if (error instanceof VersionConflictError) {
        set.status = 409;
        return {
          error: "Version conflict",
          expectedVersion: error.expectedVersion,
          currentVersion: error.currentVersion,
        };
      }
      if (error instanceof OpValidationError) {
        set.status = 422;
        return { error: error.message };
      }
      throw error;
    }
  })
  // ── Graph save ──────────────────────────────────────────────────────────
  .post("/:id/graph", async ({ params, body, set }) => {
    const payload = body as {
      nodes: Record<string, unknown>;
      edges: Record<string, unknown>;
    } | null;
    if (!payload || !payload.nodes || !payload.edges) {
      set.status = 400;
      return { error: "Body must include nodes and edges" };
    }
    const result = await projectRepo.saveGraph(params.id, payload);
    if (!result) {
      set.status = 404;
      return { error: "Project not found" };
    }
    return result;
  })
  // ── Asset upload ────────────────────────────────────────────────────────
  .post("/:id/assets", async ({ params, request, set }) => {
    const project = await projectRepo.readProject(params.id);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      set.status = 400;
      return { error: "Missing file in form data" };
    }

    const dir = await projectRepo.ensureAssetsDir(params.id);
    const ext = file.name.split(".").pop() ?? "bin";
    const assetId = crypto.randomUUID();
    const filename = `${assetId}.${ext}`;
    const filePath = join(dir, filename);

    const buffer = await file.arrayBuffer();
    await Bun.write(filePath, buffer);

    const uri = `/project/${params.id}/assets/${filename}`;
    const assetType = mimeToAssetType(file.type, ext);

    // Register asset in the project JSON
    project.assets[assetId] = {
      id: assetId,
      projectId: params.id,
      type: assetType,
      uri,
      meta: {
        name: file.name,
        originalName: file.name,
        mimeType: file.type,
        size: buffer.byteLength,
        ext,
      },
    };
    project.project.updatedAt = new Date().toISOString();
    await projectRepo.writeProject(params.id, project);

    return {
      assetId,
      filename,
      uri,
      size: buffer.byteLength,
      assetType,
    };
  })
  // ── Asset list ─────────────────────────────────────────────────────────
  .get("/:id/assets", async ({ params, set }) => {
    const project = await projectRepo.readProject(params.id);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }
    return Object.values(project.assets);
  })
  // ── Asset rename ────────────────────────────────────────────────────────
  .patch("/:id/assets/:assetId", async ({ params, body, set }) => {
    const project = await projectRepo.readProject(params.id);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }
    const asset = project.assets[params.assetId];
    if (!asset) {
      set.status = 404;
      return { error: "Asset not found" };
    }
    const payload = body as { name?: string } | null;
    const name = payload?.name?.trim();
    if (!name) {
      set.status = 400;
      return { error: "Name is required" };
    }
    asset.meta.name = name;
    project.project.updatedAt = new Date().toISOString();
    await projectRepo.writeProject(params.id, project);
    return { id: asset.id, name };
  })
  // ── Asset delete ───────────────────────────────────────────────────────
  .delete("/:id/assets/:assetId", async ({ params, set }) => {
    const project = await projectRepo.readProject(params.id);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }
    const asset = project.assets[params.assetId];
    if (!asset) {
      set.status = 404;
      return { error: "Asset not found" };
    }

    // Remove from project JSON
    delete project.assets[params.assetId];
    project.project.updatedAt = new Date().toISOString();
    await projectRepo.writeProject(params.id, project);

    // Try to delete the file (best effort)
    const filename = asset.uri.split("/").pop();
    if (filename) {
      const filePath = join(projectRepo.projectAssetsDir(params.id), filename);
      try {
        const { unlink } = await import("fs/promises");
        await unlink(filePath);
      } catch {
        // File may already be gone
      }
    }

    return { deleted: true };
  })
  // ── Asset serve ─────────────────────────────────────────────────────────
  .get("/:id/assets/:filename", async ({ params, set }) => {
    const dir = projectRepo.projectAssetsDir(params.id);
    const filePath = join(dir, params.filename);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Asset not found" };
    }

    set.headers["Cache-Control"] = "public, max-age=31536000, immutable";
    set.headers["Content-Type"] = file.type || "application/octet-stream";
    return file;
  });
