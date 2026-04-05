import type { ModelMessage } from "ai";
import type { ProjectFile } from "../db/schemas";
import type { BoardOp } from "@dreamer/schemas";
import type { Logger } from "../logger";

export type AgentContext = {
  prompt: string;
  project: ProjectFile;
  sceneId: string;
  runId: string;
  threadId: string;
  projectId: string;
  sessionId: string;
  parentLog: Logger;
  /** Pre-built conversation history for the agent (core agent only). */
  history?: ModelMessage[];
};

export type AgentResult = {
  assistantText: string;
  proposedOps: BoardOp[];
  /** Full model messages from the agent conversation, for persistence/replay. */
  messages: ModelMessage[];
};

/**
 * Signature shared by all agent runner functions.
 * Core, circuit, and graph agents all conform to this interface.
 */
export type AgentRunner = (ctx: AgentContext) => Promise<AgentResult>;

/**
 * Context passed to delegation tools so they can spawn child agent runs.
 */
export type DelegationContext = {
  project: ProjectFile;
  sceneId: string;
  threadId: string;
  projectId: string;
  sessionId: string;
  parentRunId: string;
  parentLog: Logger;
};
