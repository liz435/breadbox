import type { SceneOp } from "@dreamer/schemas";
import type { SceneEvent } from "@/store/scene-machine";
import type { Sprite } from "@/types";

/**
 * Collected data for a single entity being created across multiple ops.
 * The agent emits `create_entity` + `add_component(transform)` +
 * `add_component(sprite)` + `create_asset` as separate ops — we group
 * them by entityId so we can build one `Sprite` object.
 */
type PendingEntity = {
  entityId: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  tint: string | undefined;
  width: number;
  height: number;
};

const DEFAULT_SPRITE_SIZE = 64;

/**
 * Generates a solid-color placeholder image on a canvas element.
 * Returns a Promise that resolves to an HTMLImageElement.
 */
function generatePlaceholderImage(
  color: string,
  width: number,
  height: number
): Promise<HTMLImageElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL();
  });
}

/**
 * Translates an array of server-side SceneOps into SceneEvents
 * and dispatches them to the XState scene machine.
 *
 * Strategy:
 * - Pass 1: Walk all ops, accumulate entity creation data and collect
 *   update/delete ops.
 * - Pass 2: Generate placeholder images for new entities (async).
 * - Pass 3: Dispatch ADD_SPRITE, UPDATE, and REMOVE events synchronously.
 */
export async function applyOpsToScene(
  ops: SceneOp[],
  send: (event: SceneEvent) => void
): Promise<void> {
  const pendingEntities = new Map<string, PendingEntity>();
  const updates: Array<{ entityId: string; changes: Partial<Omit<Sprite, "id" | "image">> }> = [];
  const deletes: string[] = [];

  // ── Pass 1: Collect ──────────────────────────────────────────────────────

  for (const op of ops) {
    switch (op.kind) {
      case "create_entity": {
        const { entity } = op.payload;
        pendingEntities.set(entity.id, {
          entityId: entity.id,
          name: entity.name,
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          tint: undefined,
          width: DEFAULT_SPRITE_SIZE,
          height: DEFAULT_SPRITE_SIZE,
        });
        break;
      }

      case "add_component": {
        const { entityId, componentType, value } = op.payload;
        const pending = pendingEntities.get(entityId);
        if (!pending) break;

        if (componentType === "transform") {
          const t = value as Record<string, unknown>;
          if (typeof t.x === "number") pending.x = t.x;
          if (typeof t.y === "number") pending.y = t.y;
          if (typeof t.rotation === "number") pending.rotation = t.rotation;
          if (typeof t.scaleX === "number") pending.scaleX = t.scaleX;
          if (typeof t.scaleY === "number") pending.scaleY = t.scaleY;
        }

        if (componentType === "sprite") {
          const s = value as Record<string, unknown>;
          if (typeof s.tint === "string") pending.tint = s.tint;
        }
        break;
      }

      case "create_asset": {
        const { asset } = op.payload;
        if (asset.type === "sprite" && asset.meta) {
          const w = asset.meta.width;
          const h = asset.meta.height;
          // Find the pending entity that references this asset
          for (const pending of pendingEntities.values()) {
            if (typeof w === "number") pending.width = w;
            if (typeof h === "number") pending.height = h;
          }
        }
        break;
      }

      case "update_transform": {
        const { entityId, patch } = op.payload;
        // If this entity is being created in the same batch, update the pending data
        const pending = pendingEntities.get(entityId);
        if (pending) {
          const p = patch as Record<string, unknown>;
          if (typeof p.x === "number") pending.x = p.x;
          if (typeof p.y === "number") pending.y = p.y;
          if (typeof p.rotation === "number") pending.rotation = p.rotation;
          if (typeof p.scaleX === "number") pending.scaleX = p.scaleX;
          if (typeof p.scaleY === "number") pending.scaleY = p.scaleY;
        } else {
          const changes: Partial<Omit<Sprite, "id" | "image">> = {};
          const p = patch as Record<string, unknown>;
          if (typeof p.x === "number") changes.x = p.x;
          if (typeof p.y === "number") changes.y = p.y;
          if (typeof p.rotation === "number") changes.rotation = p.rotation;
          if (typeof p.scaleX === "number") changes.scaleX = p.scaleX;
          if (typeof p.scaleY === "number") changes.scaleY = p.scaleY;
          if (Object.keys(changes).length > 0) {
            updates.push({ entityId, changes });
          }
        }
        break;
      }

      case "delete_entity": {
        const { entityId } = op.payload;
        // If it was being created in the same batch, just remove it
        if (pendingEntities.has(entityId)) {
          pendingEntities.delete(entityId);
        } else {
          deletes.push(entityId);
        }
        break;
      }

      // Ops we don't translate to canvas events (yet)
      case "reparent_entity":
      case "reorder_children":
      case "update_component":
      case "remove_component":
      case "update_scene_settings":
      case "patch_script":
        break;
    }
  }

  // ── Pass 2: Generate images for new entities ─────────────────────────────

  const sprites: Sprite[] = await Promise.all(
    Array.from(pendingEntities.values()).map(async (pending) => {
      const color = pending.tint ?? "#4a9eff";
      const image = await generatePlaceholderImage(color, pending.width, pending.height);
      return {
        id: pending.entityId,
        name: pending.name,
        image,
        x: pending.x,
        y: pending.y,
        width: pending.width,
        height: pending.height,
        rotation: pending.rotation,
        scaleX: pending.scaleX,
        scaleY: pending.scaleY,
      };
    })
  );

  // ── Pass 3: Dispatch events ──────────────────────────────────────────────

  for (const sprite of sprites) {
    send({ type: "ADD_SPRITE", sprite });
  }

  for (const { entityId, changes } of updates) {
    send({ type: "UPDATE", id: entityId, changes });
  }

  for (const id of deletes) {
    send({ type: "REMOVE", id });
  }
}
