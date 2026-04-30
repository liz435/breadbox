import type { GenerationProvider } from "@dreamer/schemas";
import { ComfyUiProvider } from "./comfyui-provider";
import { MockVideoGenerationProvider } from "./mock-provider";
import { VeoProvider } from "./veo-provider";
import type { VideoGenerationProvider } from "./types";

export function getVideoGenerationProvider(provider: GenerationProvider): VideoGenerationProvider {
  if (provider === "mock") return new MockVideoGenerationProvider();
  if (provider === "veo") return new VeoProvider();
  if (provider === "comfyui") return new ComfyUiProvider();
  throw new Error(`Provider "${provider}" is not implemented yet. Use "mock" for the MVP.`);
}
