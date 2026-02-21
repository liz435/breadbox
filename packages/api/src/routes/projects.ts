import { Elysia } from "elysia";
import { ZodError } from "zod";
import { applyOpsRequestSchema } from "../db/schemas";
import {
  OpValidationError,
  projectRepo,
  VersionConflictError,
} from "../db/project-repo";

export const projectRoutes = new Elysia({ prefix: "/project" })
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
  });
