import { z } from "zod";
import { nonEmptyStringSchema, timestampSchema } from "./project";

// ── Character Asset ─────────────────────────────────────────────────────────

export const characterAssetTypeSchema = z.enum([
  "concept",
  "sprite-sheet",
  "bg-removed",
  "frame",
]);

export type CharacterAssetType = z.infer<typeof characterAssetTypeSchema>;

export const characterAssetSchema = z.object({
  id: nonEmptyStringSchema,
  sessionId: nonEmptyStringSchema,
  type: characterAssetTypeSchema,
  providerUrl: z.string(),
  localPath: z.string(),
  toolName: z.string(),
  prompt: z.string().optional(),
  animationName: z.string().optional(),
  frameIndex: z.number().int().optional(),
  width: z.number().int(),
  height: z.number().int(),
  createdAt: timestampSchema,
});

export type CharacterAsset = z.infer<typeof characterAssetSchema>;

// ── Character Session File ──────────────────────────────────────────────────

export const characterSessionFileSchema = z.object({
  session: z.object({
    id: nonEmptyStringSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  }),
  messages: z.array(z.unknown()),
  assets: z.array(characterAssetSchema),
});

export type CharacterSessionFile = z.infer<typeof characterSessionFileSchema>;
