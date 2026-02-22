import { z } from "zod"

export const generatedImageSchema = z.object({
  url: z.string(),
  prompt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
})

export type GeneratedImage = z.infer<typeof generatedImageSchema>

export const spriteSheetSchema = z.object({
  url: z.string(),
  sourceImageUrl: z.string(),
  animationName: z.string(),
  prompt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
})
export type SpriteSheet = z.infer<typeof spriteSheetSchema>

export const extractedFrameSchema = z.object({
  url: z.string(),
  index: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
})
export type ExtractedFrame = z.infer<typeof extractedFrameSchema>

export const extractedSpriteSheetSchema = z.object({
  spriteSheetUrl: z.string(),
  animationName: z.string(),
  frames: z.array(extractedFrameSchema),
})
export type ExtractedSpriteSheet = z.infer<typeof extractedSpriteSheetSchema>
