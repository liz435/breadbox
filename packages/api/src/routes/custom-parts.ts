// ── Custom Parts Routes ─────────────────────────────────────────────────────
//
// GET    /api/custom-parts                 List part ids
// GET    /api/custom-parts/:id/source      Source TS (for the editor)
// GET    /api/custom-parts/:id/module.js   Transpiled ES module (for import())
// POST   /api/custom-parts                 { id, source } — save (validates)
// DELETE /api/custom-parts/:id             Remove
//
// Desktop-only: serving and executing user-authored code is unsafe in the
// multi-tenant hosted deployment, so every endpoint is gated behind !IS_HOSTED
// (list returns empty there so the frontend loader degrades to a no-op).
//
// NOTE: also registered in packages/cli/src/headed.ts — the desktop sidecar
// runs the CLI's headed server, and routes only mounted in api/index.ts 404 there.

import { Elysia } from "elysia";
import { z } from "zod";
import {
  deleteCustomPart,
  getCustomPart,
  getCustomPartModule,
  listCustomParts,
  saveCustomPart,
} from "../custom-parts";
import { createLogger } from "../logger";
import { IS_HOSTED } from "../env";

const log = createLogger("custom-parts");

const saveBodySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be kebab-case"),
  format: z.enum(["code", "dsl"]).default("code"),
  source: z.string().min(1),
});

export const customPartsRoutes = new Elysia()

  .get("/api/custom-parts", async () => {
    if (IS_HOSTED) return { parts: [] };
    return { parts: await listCustomParts() };
  })

  .get("/api/custom-parts/:id/source", async ({ params, set }) => {
    if (IS_HOSTED) {
      set.status = 403;
      return { error: "Custom parts are desktop-only" };
    }
    const part = await getCustomPart(params.id);
    if (part == null) {
      set.status = 404;
      return { error: "not found" };
    }
    return { id: params.id, source: part.source, format: part.format };
  })

  .get("/api/custom-parts/:id/module.js", async ({ params, set }) => {
    set.headers["content-type"] = "text/javascript; charset=utf-8";
    if (IS_HOSTED) {
      set.status = 403;
      return "/* custom parts are desktop-only */";
    }
    try {
      const js = await getCustomPartModule(params.id);
      if (js == null) {
        set.status = 404;
        return "/* not found */";
      }
      return js;
    } catch (err) {
      log.warn(`transpile failed for ${params.id}: ${String(err)}`);
      set.status = 422;
      return `/* transpile error: ${err instanceof Error ? err.message : String(err)} */`;
    }
  })

  .post("/api/custom-parts", async ({ body, set }) => {
    if (IS_HOSTED) {
      set.status = 403;
      return { ok: false, error: "Custom parts are desktop-only" };
    }
    const parsed = saveBodySchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { ok: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
    }
    try {
      await saveCustomPart(parsed.data.id, parsed.data.format, parsed.data.source);
      log.info(`saved custom part ${parsed.data.id} (${parsed.data.format})`);
      return { ok: true, id: parsed.data.id };
    } catch (err) {
      set.status = 422;
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })

  .delete("/api/custom-parts/:id", async ({ params, set }) => {
    if (IS_HOSTED) {
      set.status = 403;
      return { ok: false, error: "Custom parts are desktop-only" };
    }
    const removed = await deleteCustomPart(params.id);
    if (!removed) {
      set.status = 404;
      return { ok: false, error: "not found" };
    }
    return { ok: true };
  });
