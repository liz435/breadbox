import type { GenerationJob } from "@dreamer/schemas";
import type {
  GenerateMotionInput,
  ProviderGenerateResult,
  ProviderJobStatus,
  VideoGenerationProvider,
} from "./types";

export class MockVideoGenerationProvider implements VideoGenerationProvider {
  readonly id = "mock" as const;

  async generate(): Promise<ProviderGenerateResult> {
    return { providerJobId: `mock-${crypto.randomUUID()}` };
  }

  async getStatus(job: GenerationJob, input: GenerateMotionInput): Promise<ProviderJobStatus> {
    const ageMs = Date.now() - Date.parse(job.createdAt);
    if (ageMs < 800) return { status: "running" };
    return {
      status: "succeeded",
      videoUrl: input.sourceSegmentUrl,
    };
  }
}
