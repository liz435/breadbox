import { tool } from "ai"
import { z } from "zod"
import { fal } from "@fal-ai/client"
import sharp from "sharp"
import type { GeneratedImage } from "@dreamer/schemas"
import { characterSessionRepo } from "../../db/character-session-repo"
import { createLogger } from "../../logger"

const log = createLogger("character-tools")

export type CharacterToolState = {
  images: GeneratedImage[]
  onImageGenerated: ((image: GeneratedImage) => void) | null
}

export function createCharacterToolState(): CharacterToolState {
  return {
    images: [],
    onImageGenerated: null,
  }
}

function getContentBounds(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): { left: number; top: number; width: number; height: number } | null {
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + (channels - 1)]
      if (alpha > 10) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  if (maxX < minX) return null
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

async function extractFramesFromGrid(
  imageBuffer: Buffer
): Promise<{ buffer: Buffer; width: number; height: number }[]> {
  const meta = await sharp(imageBuffer).metadata()
  const w = meta.width!
  const h = meta.height!
  const halfW = Math.floor(w / 2)
  const halfH = Math.floor(h / 2)

  const quadrants = [
    { left: 0, top: 0 },
    { left: halfW, top: 0 },
    { left: 0, top: halfH },
    { left: halfW, top: halfH },
  ]

  const frames: { buffer: Buffer; width: number; height: number }[] = []

  for (const q of quadrants) {
    const cropped = sharp(imageBuffer).extract({
      left: q.left,
      top: q.top,
      width: halfW,
      height: halfH,
    })
    const { data, info } = await cropped
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const bounds = getContentBounds(data, info.width, info.height, info.channels)

    if (bounds) {
      const trimmed = await sharp(imageBuffer)
        .extract({
          left: q.left + bounds.left,
          top: q.top + bounds.top,
          width: bounds.width,
          height: bounds.height,
        })
        .png()
        .toBuffer()
      const trimMeta = await sharp(trimmed).metadata()
      frames.push({
        buffer: trimmed,
        width: trimMeta.width!,
        height: trimMeta.height!,
      })
    } else {
      const full = await sharp(imageBuffer)
        .extract({ left: q.left, top: q.top, width: halfW, height: halfH })
        .png()
        .toBuffer()
      frames.push({ buffer: full, width: halfW, height: halfH })
    }
  }

  return frames
}

export function createCharacterTools(state: CharacterToolState, sessionId: string) {
  return {
    generate_image: tool({
      description:
        "Generate a character image based on a text description. " +
        "Always include 'pixel art' in the prompt for consistency. " +
        "Returns a URL to the generated image.",
      inputSchema: z.object({
        prompt: z
          .string()
          .min(3)
          .describe(
            "Detailed description of the character to generate. Always include 'pixel art' styling."
          ),
        aspect_ratio: z
          .enum([
            "1:1",
            "4:3",
            "3:4",
            "16:9",
            "9:16",
            "3:2",
            "2:3",
            "5:4",
            "4:5",
            "21:9",
          ])
          .optional()
          .describe("Aspect ratio (default 1:1)"),
        num_images: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("Number of images to generate (default 1)"),
      }),
      execute: async (input) => {
        log.info("generate_image called", { prompt: input.prompt.slice(0, 80), aspect_ratio: input.aspect_ratio })
        try {
          const result = await fal.subscribe("fal-ai/nano-banana-pro", {
            input: {
              prompt: input.prompt,
              aspect_ratio: input.aspect_ratio ?? "1:1",
              num_images: input.num_images ?? 1,
              output_format: "png",
            },
          })

          const generated: GeneratedImage[] = result.data.images.map(
            (img) => ({
              url: img.url,
              prompt: input.prompt,
              width: img.width ?? 1024,
              height: img.height ?? 1024,
            })
          )

          for (const image of generated) {
            state.images.push(image)
            state.onImageGenerated?.(image)
          }

          // Persist assets in background (don't block tool result)
          for (const image of generated) {
            characterSessionRepo.saveAsset(sessionId, {
              type: "concept",
              providerUrl: image.url,
              toolName: "generate_image",
              prompt: image.prompt,
              width: image.width,
              height: image.height,
            }).catch((err) => log.error("failed to save concept asset", err))
          }

          log.info(`generate_image success — ${generated.length} image(s)`, generated.map(g => g.url))
          return {
            images: generated.map((g) => ({
              url: g.url,
              width: g.width,
              height: g.height,
            })),
            message: `Generated ${generated.length} image(s).`,
          }
        } catch (err) {
          log.error("generate_image failed", err)
          const message = err instanceof Error ? err.message : String(err)
          return { error: `Image generation failed: ${message}` }
        }
      },
    }),

    generate_sprite_sheet: tool({
      description:
        "Generate a 2x2 sprite sheet from a concept image. " +
        "Uses the concept image as a reference to create 4 animation frames in a grid layout.",
      inputSchema: z.object({
        source_image_url: z
          .string()
          .describe("URL of the concept image to use as reference"),
        animation_name: z
          .string()
          .describe("Name of the animation (e.g. walk, idle, jump, attack, run)"),
        prompt: z
          .string()
          .describe("Description of the sprite sheet to generate"),
      }),
      execute: async (input) => {
        log.info("generate_sprite_sheet called", { animation: input.animation_name, source: input.source_image_url.slice(0, 80) })
        try {
          const spritePrompt =
            `Create a 2x2 grid sprite sheet showing this exact character in 4 ${input.animation_name} animation frames. ` +
            `Each frame should be clearly separated, showing progressive ${input.animation_name} motion. ` +
            `The character should maintain consistent proportions, colors, and style across all frames. ` +
            `pixel art style, clean lines, solid color background. ${input.prompt}`

          log.info("generate_sprite_sheet prompt", spritePrompt.slice(0, 120))

          const result = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
            input: {
              image_urls: [input.source_image_url],
              prompt: spritePrompt,
              aspect_ratio: "1:1",
              output_format: "png",
              num_images: 1,
            },
          })

          const img = result.data.images[0]
          log.info("generate_sprite_sheet success", img.url)

          characterSessionRepo.saveAsset(sessionId, {
            type: "sprite-sheet",
            providerUrl: img.url,
            toolName: "generate_sprite_sheet",
            prompt: spritePrompt,
            animationName: input.animation_name,
            width: img.width ?? 1024,
            height: img.height ?? 1024,
          }).catch((err) => log.error("failed to save sprite-sheet asset", err))

          return {
            url: img.url,
            sourceImageUrl: input.source_image_url,
            animationName: input.animation_name,
            prompt: spritePrompt,
            width: img.width ?? 1024,
            height: img.height ?? 1024,
            message: `Generated ${input.animation_name} sprite sheet.`,
          }
        } catch (err) {
          log.error("generate_sprite_sheet failed", err)
          const message = err instanceof Error ? err.message : String(err)
          return { error: `Sprite sheet generation failed: ${message}` }
        }
      },
    }),

    remove_background: tool({
      description:
        "Remove the background from an image, making it transparent. " +
        "Use this on sprite sheets before extracting frames.",
      inputSchema: z.object({
        image_url: z
          .string()
          .describe("URL of the image to remove the background from"),
      }),
      execute: async (input) => {
        log.info("remove_background called", input.image_url.slice(0, 80))
        try {
          const result = await fal.subscribe("fal-ai/bria/background/remove", {
            input: {
              image_url: input.image_url,
            },
          })

          const bgRemovedUrl = result.data.image.url
          log.info("remove_background success", bgRemovedUrl)

          const bgImage = result.data.image as { url: string; width?: number; height?: number }
          characterSessionRepo.saveAsset(sessionId, {
            type: "bg-removed",
            providerUrl: bgRemovedUrl,
            toolName: "remove_background",
            width: bgImage.width ?? 1024,
            height: bgImage.height ?? 1024,
          }).catch((err) => log.error("failed to save bg-removed asset", err))

          return {
            url: bgRemovedUrl,
            message: "Background removed successfully.",
          }
        } catch (err) {
          log.error("remove_background failed", err)
          const message = err instanceof Error ? err.message : String(err)
          return { error: `Background removal failed: ${message}` }
        }
      },
    }),

    extract_frames: tool({
      description:
        "Extract individual frames from a 2x2 sprite sheet. " +
        "Splits the image into 4 quadrants, trims each to content bounds, " +
        "and returns base64 PNG data URIs for each frame.",
      inputSchema: z.object({
        image_url: z
          .string()
          .describe("URL of the sprite sheet image to split"),
        animation_name: z
          .string()
          .describe("Name of the animation these frames belong to"),
      }),
      execute: async (input) => {
        log.info("extract_frames called", { animation: input.animation_name, url: input.image_url.slice(0, 80) })
        try {
          const response = await fetch(input.image_url)
          if (!response.ok) {
            log.error(`extract_frames download failed — HTTP ${response.status}`)
            return { error: `Failed to download image: ${response.status}` }
          }
          const arrayBuffer = await response.arrayBuffer()
          const imageBuffer = Buffer.from(arrayBuffer)
          log.info(`extract_frames downloaded ${imageBuffer.length} bytes`)

          const rawFrames = await extractFramesFromGrid(imageBuffer)
          log.info(`extract_frames split into ${rawFrames.length} frames`, rawFrames.map(f => ({ w: f.width, h: f.height })))

          const frames: { url: string; index: number; width: number; height: number }[] = []

          for (let i = 0; i < rawFrames.length; i++) {
            const frame = rawFrames[i]
            const dataUri = `data:image/png;base64,${frame.buffer.toString("base64")}`

            try {
              const asset = await characterSessionRepo.saveAsset(sessionId, {
                type: "frame",
                providerUrl: dataUri,
                toolName: "extract_frames",
                animationName: input.animation_name,
                frameIndex: i,
                width: frame.width,
                height: frame.height,
              })
              frames.push({
                url: `/api/character-assets/${asset.localPath}`,
                index: i,
                width: frame.width,
                height: frame.height,
              })
            } catch (err) {
              log.error(`failed to save frame ${i} asset`, err)
              // Fallback to data URI if save fails
              frames.push({
                url: dataUri,
                index: i,
                width: frame.width,
                height: frame.height,
              })
            }
          }

          log.info(`extract_frames success — ${frames.length} frames for ${input.animation_name}`)
          return {
            spriteSheetUrl: input.image_url,
            animationName: input.animation_name,
            frames,
            message: `Extracted ${frames.length} frames for ${input.animation_name}.`,
          }
        } catch (err) {
          log.error("extract_frames failed", err)
          const message = err instanceof Error ? err.message : String(err)
          return { error: `Frame extraction failed: ${message}` }
        }
      },
    }),
  }
}
