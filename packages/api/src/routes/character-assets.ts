import { join } from "path";
import { Elysia } from "elysia";

const ASSETS_DIR = join(import.meta.dir, "../../data/character-assets");

export const characterAssetRoutes = new Elysia().get(
  "/api/character-assets/:sessionId/:filename",
  async ({ params, set }) => {
    const filePath = join(ASSETS_DIR, params.sessionId, params.filename);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      set.status = 404;
      return { error: "Asset not found" };
    }

    set.headers["Content-Type"] = "image/png";
    set.headers["Cache-Control"] = "public, max-age=31536000, immutable";
    return file;
  }
);
