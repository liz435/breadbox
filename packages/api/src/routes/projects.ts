import { join } from "path";
import { Elysia } from "elysia";
import { ZodError } from "zod";
import { applyOpsRequestSchema } from "../db/schemas";
import {
  OpValidationError,
  projectRepo,
  VersionConflictError,
} from "../db/project-repo";

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

    return {
      assetId,
      filename,
      uri: `/project/${params.id}/assets/${filename}`,
      size: buffer.byteLength,
    };
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
