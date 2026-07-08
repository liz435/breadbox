import { join, resolve, sep } from "path";
import { createHash } from "crypto";
import { Elysia } from "elysia";
import { z, ZodError } from "zod";
import { findDuplicateAsset, findOrphanModelAssets } from "./asset-cleanup";
import {
  applyOpsRequestSchema,
  projectGraphSchema,
} from "../db/schemas";
import { boardStateSchema } from "@dreamer/schemas";
import {
  OpValidationError,
  storage,
  VersionConflictError,
} from "../db";
import type { Asset } from "../db/schemas";
import type { AuthContext } from "../auth/context";
import { authPlugin } from "../auth/auth-plugin";
import { auditLog } from "../auth/audit-log";

// Combined save payload — both fields optional so the client can omit one
// when nothing changed in that half. At least one must be present.
const saveStateRequestSchema = z
  .object({
    boardState: boardStateSchema.optional(),
    graph: projectGraphSchema.optional(),
  })
  .refine(
    (v) => v.boardState !== undefined || v.graph !== undefined,
    { message: "Must include at least one of boardState or graph" },
  );

function badRequest(
  set: { status?: number | string },
  error: ZodError | string,
) {
  set.status = 400;
  if (typeof error === "string") return { error };
  return { error: "Invalid request payload", details: error.flatten() };
}

function mimeToAssetType(mimeType: string, ext: string): Asset["type"] {
  if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "sprite";
  if (mimeType.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"].includes(ext)) return "audio";
  if (mimeType.startsWith("video/") || ["mp4", "webm", "mov", "avi", "mkv", "m4v"].includes(ext)) return "video";
  if (mimeType === "model/gltf-binary" || mimeType === "model/stl" || ["glb", "gltf", "stl", "3mf"].includes(ext)) return "model";
  if (["glsl", "wgsl", "frag", "vert", "hlsl"].includes(ext)) return "shader";
  if (["ts", "js", "tsx", "jsx"].includes(ext)) return "script";
  if (["json", "yaml", "yml", "txt", "md"].includes(ext)) return "text";
  if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "font";
  return "text";
}

// Resolve ownerId from the auth context stashed by `authPlugin`. Routes
// under this plugin are not in the public allowlist, so a missing auth
// context here means the middleware didn't run — which should be
// impossible in prod, but we fail closed rather than mutate someone
// else's data on a misconfigured server.
function requireOwnerId(auth: AuthContext | null | undefined): string {
  if (!auth) throw new Error("missing auth context on authed route");
  return auth.userId;
}

export const projectRoutes = new Elysia({ prefix: "/project" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const ownerId = requireOwnerId(auth);
    return storage.projects.listProjects(ownerId);
  })
  .post("/", async ({ auth, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const payload = (body ?? {}) as { id?: string; name?: string; ensure?: boolean };
      const project = payload.ensure
        ? await storage.projects.getOrCreateProject({
            ownerId,
            id: payload.id,
            name: payload.name,
          })
        : await storage.projects.createProject({
            ownerId,
            id: payload.id,
            name: payload.name,
          });
      void auditLog({
        userId: ownerId,
        action: "project.create",
        projectId: project.project.id,
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
  // Static segment — registered before the "/:id" routes so "last-opened"
  // is never captured as a project id. Persisted server-side (not in
  // browser localStorage) so it survives the desktop app's port — and
  // therefore origin — changing between launches.
  .get("/last-opened", async ({ auth }) => {
    const ownerId = requireOwnerId(auth);
    const projectId = await storage.projects.getLastOpenedProjectId(ownerId);
    return { projectId };
  })
  .post("/last-opened", async ({ auth, body, set }) => {
    const ownerId = requireOwnerId(auth);
    const payload = body as { projectId?: string } | null;
    const projectId = payload?.projectId?.trim();
    if (!projectId) return badRequest(set, "projectId is required");
    const project = await storage.projects.readProject(projectId, ownerId);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }
    await storage.projects.setLastOpenedProjectId(projectId, ownerId);
    return { ok: true };
  })
  .get("/:id", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    const project = await storage.projects.readProject(params.id, ownerId);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }
    return project;
  })
  .delete("/:id", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    const deleted = await storage.projects.deleteProject(params.id, ownerId);
    if (!deleted) {
      set.status = 404;
      return { error: "Project not found" };
    }
    void auditLog({
      userId: ownerId,
      action: "project.delete",
      projectId: params.id,
    });
    return { deleted: true };
  })
  .patch("/:id", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    const payload = body as { name?: string } | null;
    const name = payload?.name?.trim();
    if (!name) {
      set.status = 400;
      return { error: "Name is required" };
    }
    const result = await storage.projects.renameProject(params.id, ownerId, name);
    if (!result) {
      set.status = 404;
      return { error: "Project not found" };
    }
    void auditLog({
      userId: ownerId,
      action: "project.rename",
      projectId: params.id,
      extra: { name },
    });
    return result;
  })
  .patch("/:id/scenes/:sceneId", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    const payload = body as { name?: string } | null;
    const name = payload?.name?.trim();
    if (!name) {
      set.status = 400;
      return { error: "Name is required" };
    }
    const result = await storage.projects.renameScene(
      params.id,
      ownerId,
      params.sceneId,
      name,
    );
    if (!result) {
      set.status = 404;
      return { error: "Project or scene not found" };
    }
    void auditLog({
      userId: ownerId,
      action: "project.rename",
      projectId: params.id,
      extra: { sceneId: params.sceneId, name },
    });
    return result;
  })
  .post("/:id/ops", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const input = applyOpsRequestSchema.parse(body);
      const result = await storage.projects.applyOps(params.id, ownerId, input);
      if (!result) {
        set.status = 404;
        return { error: "Project not found" };
      }
      void auditLog({
        userId: ownerId,
        action: "project.update",
        projectId: params.id,
        extra: { opsCount: result.appliedOps.length },
      });
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
  // ── Graph save (legacy single-field endpoint) ───────────────────────────
  //
  // Prefer POST /:id/state for new clients — it persists board and graph
  // atomically in one read-modify-write cycle. This endpoint stays for
  // sendBeacon flushes and any clients that only need to update one field.
  .post("/:id/graph", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const graph = projectGraphSchema.parse(body);
      const result = await storage.projects.saveGraph(params.id, ownerId, graph);
      if (!result) {
        set.status = 404;
        return { error: "Project not found" };
      }
      return result;
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      throw err;
    }
  })
  // ── Board state save (legacy single-field endpoint) ─────────────────────
  .post("/:id/board", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const boardState = boardStateSchema.parse(body);
      const result = await storage.projects.saveBoardState(
        params.id,
        ownerId,
        boardState,
      );
      if (!result) {
        set.status = 404;
        return { error: "Project not found" };
      }
      return result;
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      throw err;
    }
  })
  // ── Atomic board + graph save ───────────────────────────────────────────
  //
  // Single read-modify-write that updates both `boardState` and `graph` in
  // one pass. Use this for the normal autosave / Cmd+S flow so two
  // concurrent saves can't clobber each other's field.
  .post("/:id/state", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    try {
      const payload = saveStateRequestSchema.parse(body);
      const result = await storage.projects.saveBoardAndGraph(
        params.id,
        ownerId,
        payload,
      );
      if (!result) {
        set.status = 404;
        return { error: "Project not found" };
      }
      return result;
    } catch (err) {
      if (err instanceof ZodError) return badRequest(set, err);
      throw err;
    }
  })
  // ── Asset upload ────────────────────────────────────────────────────────
  .post("/:id/assets", async ({ auth, params, request, set }) => {
    const ownerId = requireOwnerId(auth);
    const project = await storage.projects.readProject(params.id, ownerId);
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

    const ext = file.name.split(".").pop() ?? "bin";
    const buffer = await file.arrayBuffer();
    const sha256 = createHash("sha256").update(Buffer.from(buffer)).digest("hex");

    const dir = await storage.projects.ensureAssetsDir(params.id, ownerId);
    if (!dir) {
      set.status = 404;
      return { error: "Project not found" };
    }

    // Dedup: if the project already stores this exact file, reuse it instead of
    // writing a duplicate — re-importing the same model is common and would
    // otherwise pile identical copies on disk.
    const duplicate = findDuplicateAsset(project.assets, sha256, ext);
    if (duplicate) {
      const dupFilename = duplicate.uri.split("/").pop() ?? "";
      if (dupFilename && (await Bun.file(join(dir, dupFilename)).exists())) {
        return {
          assetId: duplicate.id,
          filename: dupFilename,
          uri: duplicate.uri,
          size:
            typeof duplicate.meta?.size === "number"
              ? duplicate.meta.size
              : buffer.byteLength,
          assetType: duplicate.type,
          deduped: true,
        };
      }
    }

    const assetId = crypto.randomUUID();
    const filename = `${assetId}.${ext}`;
    await Bun.write(join(dir, filename), buffer);

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
        sha256,
      },
    };
    project.project.updatedAt = new Date().toISOString();
    await storage.projects.writeProject(params.id, ownerId, project);

    void auditLog({
      userId: ownerId,
      action: "asset.upload",
      projectId: params.id,
      extra: { assetId, assetType, size: buffer.byteLength },
    });

    return {
      assetId,
      filename,
      uri,
      size: buffer.byteLength,
      assetType,
    };
  })
  // ── Asset list ─────────────────────────────────────────────────────────
  .get("/:id/assets", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    const project = await storage.projects.readProject(params.id, ownerId);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }
    return Object.values(project.assets);
  })
  // ── Asset rename ────────────────────────────────────────────────────────
  .patch("/:id/assets/:assetId", async ({ auth, params, body, set }) => {
    const ownerId = requireOwnerId(auth);
    const project = await storage.projects.readProject(params.id, ownerId);
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
    await storage.projects.writeProject(params.id, ownerId, project);
    return { id: asset.id, name };
  })
  // ── Asset delete ───────────────────────────────────────────────────────
  .delete("/:id/assets/:assetId", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    const project = await storage.projects.readProject(params.id, ownerId);
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
    await storage.projects.writeProject(params.id, ownerId, project);

    // Try to delete the underlying object (best effort — JSON metadata is
    // already detached).
    const filename = asset.uri.split("/").pop();
    if (filename) {
      const filePath = join(
        storage.projects.projectAssetsDir(params.id),
        filename,
      );
      try {
        const { unlink } = await import("fs/promises");
        await unlink(filePath);
      } catch {
        // File may already be gone
      }
    }

    void auditLog({
      userId: ownerId,
      action: "asset.delete",
      projectId: params.id,
      extra: { assetId: params.assetId },
    });

    return { deleted: true };
  })
  // ── Asset sweep ──────────────────────────────────────────────────────────
  // Reclaim imported 3D-model assets no assembly body references anymore
  // (dropped by undo / board reload / apply_design, which don't route through
  // the per-body delete). Safe to run on project open: it reads the persisted
  // board, so the referenced set is complete. Only model assets are touched.
  .post("/:id/assets/sweep", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    const project = await storage.projects.readProject(params.id, ownerId);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }

    const bodies = Object.values(project.boardState?.assembly?.bodies ?? {});
    const orphanIds = findOrphanModelAssets(project.assets, bodies);
    if (orphanIds.length === 0) return { removed: 0, bytesReclaimed: 0 };

    const { unlink } = await import("fs/promises");
    const dir = storage.projects.projectAssetsDir(params.id);
    let bytesReclaimed = 0;
    for (const assetId of orphanIds) {
      const asset = project.assets[assetId];
      if (!asset) continue;
      const size = asset.meta?.size;
      if (typeof size === "number") bytesReclaimed += size;
      const filename = asset.uri.split("/").pop();
      if (filename) {
        try {
          await unlink(join(dir, filename));
        } catch {
          // Already gone — still drop the JSON entry below.
        }
      }
      delete project.assets[assetId];
    }
    project.project.updatedAt = new Date().toISOString();
    await storage.projects.writeProject(params.id, ownerId, project);

    void auditLog({
      userId: ownerId,
      action: "asset.delete",
      projectId: params.id,
      extra: { swept: orphanIds.length, bytesReclaimed },
    });

    return { removed: orphanIds.length, bytesReclaimed };
  })
  // ── Asset serve ─────────────────────────────────────────────────────────
  .get("/:id/assets/:filename", async ({ auth, params, set }) => {
    const ownerId = requireOwnerId(auth);
    // Ownership check first: even though asset filenames are UUIDs, we
    // don't want to leak existence of another user's asset by filename
    // probing. Reading through `readProject` gates the whole endpoint.
    const project = await storage.projects.readProject(params.id, ownerId);
    if (!project) {
      set.status = 404;
      return { error: "Project not found" };
    }

    // Containment check: reject anything that isn't a bare basename —
    // path-traversal defense for the filesystem read below.
    const filename = params.filename;
    if (
      filename.length === 0 ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("\0") ||
      filename === "." ||
      filename === ".."
    ) {
      set.status = 400;
      return { error: "Invalid asset filename" };
    }

    const dir = storage.projects.projectAssetsDir(params.id);
    const dirResolved = resolve(dir);
    const filePath = resolve(join(dir, filename));
    if (filePath !== dirResolved && !filePath.startsWith(dirResolved + sep)) {
      set.status = 400;
      return { error: "Invalid asset filename" };
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Asset not found" };
    }

    set.headers["Cache-Control"] = "public, max-age=31536000, immutable";
    set.headers["Content-Type"] = file.type || "application/octet-stream";
    return file;
  });
