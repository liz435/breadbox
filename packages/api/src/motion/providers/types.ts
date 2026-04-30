import type { GenerationJob, KeyframePose } from "@dreamer/schemas";

export type GenerateMotionInput = {
  projectId: string;
  segmentId: string;
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceImageUrls: string[];
  sourceSegmentUrl?: string;
  durationSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  keyframes: KeyframePose[];
};

export type ProviderGenerateResult = {
  providerJobId: string;
};

export type ProviderJobStatus = {
  status: "running" | "succeeded" | "failed";
  videoUrl?: string;
  error?: string;
};

export interface VideoGenerationProvider {
  id: GenerationJob["provider"];
  generate(input: GenerateMotionInput): Promise<ProviderGenerateResult>;
  getStatus(job: GenerationJob, input: GenerateMotionInput): Promise<ProviderJobStatus>;
}
