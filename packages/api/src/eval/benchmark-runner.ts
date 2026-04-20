// Side-effect import: must precede agent imports so ANTHROPIC_API_KEY is
// captured before the provider wrapper reads an empty string.
import "../bootstrap-secrets";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { createDefaultBoardState, isBoardComponentType, type BoardOp, type BoardState } from "@dreamer/schemas";
import { getBenchmarkSuite, type BenchmarkScenario } from "./benchmark-suite";
import type { RunEval } from "./types";

const BOARD_OP_KINDS = new Set([
  "place_component", "remove_component", "move_component",
  "update_component", "connect_wire", "remove_wire",
  "set_pin_mode", "update_sketch", "update_board_settings", "load_board",
]);

const GRAPH_OP_KINDS = new Set([
  "create_graph_node", "delete_graph_node", "move_graph_node",
  "update_graph_node_data", "create_edge", "delete_edge",
]);

type BenchmarkTurnResult = {
  turn: number;
  prompt: string;
  runId: string;
  status: string;
  agent: string;
  model: string;
  domain: string;
  category: string;
  latencyMs: number;
  score: number | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  childTokens: number;
  overheadTokens: number;
  estimatedCost: number;
  toolCalls: number;
  toolErrors: number;
  hallucinations: number;
  proposedOps: number;
  appliedOps: number;
  assistantPreview: string;
};

type BenchmarkScenarioResult = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  projectId: string;
  threadId: string;
  turns: BenchmarkTurnResult[];
  summary: {
    runs: number;
    avgScore: number | null;
    avgLatencyMs: number;
    avgTokens: number;
    totalCost: number;
    byDomain: Record<string, number>;
    byModel: Record<string, { runs: number; avgTokens: number; totalCost: number }>;
  };
};

type BenchmarkReport = {
  generatedAt: string;
  suite: string;
  isolatedDataDir: string;
  scenarios: BenchmarkScenarioResult[];
  overall: {
    runs: number;
    scored: number;
    avgScore: number | null;
    avgLatencyMs: number;
    avgTokens: number;
    totalTokens: number;
    totalCost: number;
    byDomain: Record<string, number>;
    byCategory: Record<string, number>;
    byModel: Record<string, { runs: number; avgTokens: number; totalCost: number }>;
  };
};

type RuntimeDeps = {
  projectRepo: typeof import("../db/project-repo").projectRepo;
  agentRunRepo: typeof import("../db/agent-run-repo").agentRunRepo;
  boardTracker: typeof import("../db/board-state-tracker").boardTracker;
  classifyIntent: typeof import("../agents/intent-classifier").classifyIntent;
  CIRCUIT_TEMPLATES: typeof import("../agents/circuit-templates").CIRCUIT_TEMPLATES;
  makeBoardOp: typeof import("../agents/make-op").makeBoardOp;
  buildSummarizedHistory: typeof import("../agents/history-summarizer").buildSummarizedHistory;
  generateThreadSummary: typeof import("../agents/history-summarizer").generateThreadSummary;
  runCoreAgent: typeof import("../agents/core/agent").runCoreAgent;
  evaluateRun: typeof import("./run-evaluator").evaluateRun;
  createLogger: typeof import("../logger").createLogger;
};

function hasArg(name: string): boolean {
  return Bun.argv.includes(name);
}

function round(value: number, digits: number = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function preview(text: string | undefined, max: number = 160): string {
  const compact = (text ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function currentExpectedVersion(project: { project: { version: number } }): number {
  return project.project.version;
}

async function loadRuntimeDeps(): Promise<RuntimeDeps> {
  const [
    { projectRepo },
    { agentRunRepo },
    { boardTracker },
    { classifyIntent },
    { CIRCUIT_TEMPLATES },
    { makeBoardOp },
    { buildSummarizedHistory, generateThreadSummary },
    { runCoreAgent },
    { evaluateRun },
    { createLogger },
  ] = await Promise.all([
    import("../db/project-repo"),
    import("../db/agent-run-repo"),
    import("../db/board-state-tracker"),
    import("../agents/intent-classifier"),
    import("../agents/circuit-templates"),
    import("../agents/make-op"),
    import("../agents/history-summarizer"),
    import("../agents/core/agent"),
    import("./run-evaluator"),
    import("../logger"),
  ]);

  return {
    projectRepo,
    agentRunRepo,
    boardTracker,
    classifyIntent,
    CIRCUIT_TEMPLATES,
    makeBoardOp,
    buildSummarizedHistory,
    generateThreadSummary,
    runCoreAgent,
    evaluateRun,
    createLogger,
  };
}

const BENCHMARK_OWNER_ID = "benchmark";

async function persistGraphOps(
  projectId: string,
  graphOps: BoardOp[],
  deps: RuntimeDeps,
): Promise<void> {
  if (graphOps.length === 0) return;

  const currentProject = await deps.projectRepo.readProject(projectId, BENCHMARK_OWNER_ID);
  if (!currentProject) return;

  const graph = currentProject.graph ?? { nodes: {}, edges: {} };
  for (const rawOp of graphOps) {
    const op = rawOp as unknown as { kind: string; payload: Record<string, unknown> };
    switch (op.kind) {
      case "create_graph_node": {
        const node = op.payload.node as { id: string };
        graph.nodes[node.id] = node as typeof graph.nodes[string];
        break;
      }
      case "delete_graph_node": {
        const nodeId = op.payload.nodeId as string;
        delete graph.nodes[nodeId];
        for (const [edgeId, edge] of Object.entries(graph.edges)) {
          if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
            delete graph.edges[edgeId];
          }
        }
        break;
      }
      case "move_graph_node": {
        const nodeId = op.payload.nodeId as string;
        if (graph.nodes[nodeId]) {
          graph.nodes[nodeId].x = op.payload.x as number;
          graph.nodes[nodeId].y = op.payload.y as number;
        }
        break;
      }
      case "update_graph_node_data": {
        const nodeId = op.payload.nodeId as string;
        const patch = op.payload.patch as Record<string, unknown>;
        if (graph.nodes[nodeId]) {
          graph.nodes[nodeId].data = { ...graph.nodes[nodeId].data, ...patch };
        }
        break;
      }
      case "create_edge": {
        const edge = op.payload.edge as { id: string };
        graph.edges[edge.id] = edge as typeof graph.edges[string];
        break;
      }
      case "delete_edge":
        delete graph.edges[op.payload.edgeId as string];
        break;
    }
  }

  await deps.projectRepo.saveGraph(projectId, BENCHMARK_OWNER_ID, graph);
}

async function seedProjectBoard(
  projectId: string,
  deps: RuntimeDeps,
): Promise<BoardState> {
  const boardState = createDefaultBoardState();
  await deps.projectRepo.saveBoardState(projectId, BENCHMARK_OWNER_ID, boardState);
  deps.boardTracker.set(projectId, boardState);
  return boardState;
}

async function completeTemplateTurn(params: {
  scenario: BenchmarkScenario;
  turn: number;
  prompt: string;
  runId: string;
  threadId: string;
  projectId: string;
  sceneId: string;
  sessionId: string;
  deps: RuntimeDeps;
}): Promise<BenchmarkTurnResult> {
  const { prompt, runId, projectId, sceneId, deps } = params;
  const startedAt = performance.now();
  const project = await deps.projectRepo.readProject(projectId, BENCHMARK_OWNER_ID);
  if (!project?.boardState) {
    throw new Error(`Project ${projectId} missing board state for template benchmark`);
  }

  const intent = deps.classifyIntent(prompt);
  if (intent.type !== "template") {
    throw new Error(`Expected template intent for prompt: ${prompt}`);
  }

  const templateFn = deps.CIRCUIT_TEMPLATES[intent.template];
  if (!templateFn) {
    throw new Error(`Unknown template: ${intent.template}`);
  }

  const opCtx = {
    projectId,
    sceneId,
    expectedVersion: currentExpectedVersion(project),
  };

  const clearOps: BoardOp[] = [];
  if (!intent.additive) {
    for (const wireId of Object.keys(project.boardState.wires)) {
      clearOps.push(deps.makeBoardOp(opCtx, {
        kind: "remove_wire",
        payload: { wireId },
      }));
    }
    for (const component of Object.values(project.boardState.components)) {
      if (isBoardComponentType(component.type)) continue;
      clearOps.push(deps.makeBoardOp(opCtx, {
        kind: "remove_component",
        payload: { componentId: component.id },
      }));
    }
  }

  const result = templateFn(opCtx, project.boardState, intent.params);
  const templateOps = [...clearOps, ...result.ops];

  await deps.projectRepo.applyBoardOps(projectId, BENCHMARK_OWNER_ID, {
    expectedVersion: currentExpectedVersion(project),
    ops: templateOps,
  });
  await deps.boardTracker.applyOps(projectId, templateOps, project.boardState);

  await deps.agentRunRepo.completeRun({
    runId,
    assistantText: result.description,
    messages: [{ role: "assistant" as const, content: result.description }],
    proposedOps: templateOps,
    appliedOps: templateOps,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: "template",
    },
  });

  const storedRun = await deps.agentRunRepo.readRun(runId);
  if (!storedRun) throw new Error(`Missing stored benchmark run: ${runId}`);
  const evalResult = deps.evaluateRun(storedRun as never);
  const latencyMs = performance.now() - startedAt;

  return {
    turn: params.turn,
    prompt,
    runId,
    status: storedRun.run.status,
    agent: storedRun.run.agent,
    model: evalResult.tokens.model,
    domain: evalResult.domain,
    category: evalResult.category,
    latencyMs: round(latencyMs),
    score: evalResult.score?.total ?? null,
    totalTokens: evalResult.tokens.totalTokens,
    inputTokens: evalResult.tokens.inputTokens,
    outputTokens: evalResult.tokens.outputTokens,
    childTokens: evalResult.tokens.childTokens,
    overheadTokens: evalResult.tokens.overheadTokens,
    estimatedCost: evalResult.tokens.estimatedCost,
    toolCalls: evalResult.tools.totalCalls,
    toolErrors: evalResult.tools.errors,
    hallucinations: evalResult.path.hallucinations.length,
    proposedOps: storedRun.proposedOps.length,
    appliedOps: storedRun.appliedOps.length,
    assistantPreview: preview(storedRun.assistantText),
  };
}

async function completeAgentTurn(params: {
  turn: number;
  prompt: string;
  runId: string;
  threadId: string;
  projectId: string;
  sceneId: string;
  sessionId: string;
  deps: RuntimeDeps;
}): Promise<BenchmarkTurnResult> {
  const { turn, prompt, runId, threadId, projectId, sceneId, sessionId, deps } = params;
  const startedAt = performance.now();
  const reqLog = deps.createLogger("benchmark").child(`turn-${turn}`);

  const project = await deps.projectRepo.readProject(projectId, BENCHMARK_OWNER_ID);
  if (!project) throw new Error(`Project not found during benchmark turn: ${projectId}`);
  if (!project.boardState) {
    const boardState = await seedProjectBoard(projectId, deps);
    project.boardState = boardState;
  }
  if (!deps.boardTracker.get(projectId) && project.boardState) {
    deps.boardTracker.set(projectId, project.boardState);
  }

  const priorRuns = await deps.agentRunRepo.listRunsForThread(threadId);
  const cachedSummary = await deps.agentRunRepo.readThreadSummary(threadId);
  const completedRuns = priorRuns.filter(
    (candidate) => candidate.run.id !== runId && candidate.run.status === "completed"
  );
  const historyResult = await deps.buildSummarizedHistory(completedRuns, cachedSummary);

  const result = await deps.runCoreAgent({
    prompt,
    project,
    sceneId,
    runId,
    threadId,
    projectId,
    sessionId,
    parentLog: reqLog,
    history: historyResult.messages,
    priorRuns: completedRuns,
  });

  const boardOps = result.proposedOps.filter((op) => BOARD_OP_KINDS.has(op.kind));
  const graphOps = result.proposedOps.filter((op) => GRAPH_OP_KINDS.has(op.kind));

  let appliedOps: BoardOp[] = [];
  if (boardOps.length > 0) {
    const applyResult = await deps.projectRepo.applyBoardOps(projectId, BENCHMARK_OWNER_ID, {
      expectedVersion: currentExpectedVersion(project),
      ops: boardOps,
    });
    if (applyResult) {
      appliedOps = applyResult.appliedOps;
      await deps.boardTracker.applyOps(projectId, appliedOps, project.boardState);
    }
  }

  await persistGraphOps(projectId, graphOps, deps);

  const liveOverhead = historyResult.usage
    ? [{
        kind: "summarizer_live" as const,
        inputTokens: historyResult.usage.inputTokens,
        outputTokens: historyResult.usage.outputTokens,
        totalTokens: historyResult.usage.totalTokens,
        model: historyResult.usage.model,
      }]
    : undefined;
  const liveOverheadTotal = liveOverhead
    ? liveOverhead.reduce((sum, item) => sum + item.totalTokens, 0)
    : 0;

  await deps.agentRunRepo.completeRun({
    runId,
    assistantText: result.assistantText,
    messages: result.messages,
    proposedOps: result.proposedOps,
    appliedOps,
    tokenUsage: {
      ...result.tokenUsage,
      totalTokens: result.tokenUsage.totalTokens + liveOverheadTotal,
      overhead: liveOverhead,
    },
  });

  const allThreadRuns = await deps.agentRunRepo.listRunsForThread(threadId);
  const allCompleted = allThreadRuns.filter((candidate) => candidate.run.status === "completed");
  const summaryResult = await deps.generateThreadSummary(allCompleted);
  if (summaryResult) {
    await deps.agentRunRepo.updateThreadSummary(threadId, summaryResult.summary);
    await deps.agentRunRepo.appendOverhead(runId, {
      kind: "summarizer_background",
      inputTokens: summaryResult.usage.inputTokens,
      outputTokens: summaryResult.usage.outputTokens,
      totalTokens: summaryResult.usage.totalTokens,
      model: summaryResult.usage.model,
    });
  }

  const storedRun = await deps.agentRunRepo.readRun(runId);
  if (!storedRun) throw new Error(`Missing stored benchmark run: ${runId}`);
  const evalResult = deps.evaluateRun(storedRun as never);
  const latencyMs = performance.now() - startedAt;

  return {
    turn,
    prompt,
    runId,
    status: storedRun.run.status,
    agent: storedRun.run.agent,
    model: evalResult.tokens.model,
    domain: evalResult.domain,
    category: evalResult.category,
    latencyMs: round(latencyMs),
    score: evalResult.score?.total ?? null,
    totalTokens: evalResult.tokens.totalTokens,
    inputTokens: evalResult.tokens.inputTokens,
    outputTokens: evalResult.tokens.outputTokens,
    childTokens: evalResult.tokens.childTokens,
    overheadTokens: evalResult.tokens.overheadTokens,
    estimatedCost: evalResult.tokens.estimatedCost,
    toolCalls: evalResult.tools.totalCalls,
    toolErrors: evalResult.tools.errors,
    hallucinations: evalResult.path.hallucinations.length,
    proposedOps: storedRun.proposedOps.length,
    appliedOps: storedRun.appliedOps.length,
    assistantPreview: preview(storedRun.assistantText),
  };
}

function summarizeScenario(result: BenchmarkScenarioResult["turns"]): BenchmarkScenarioResult["summary"] {
  const scored = result.filter((turn) => turn.score != null).map((turn) => turn.score as number);
  const byDomain: Record<string, number> = {};
  const byModel: Record<string, { runs: number; avgTokens: number; totalCost: number }> = {};

  for (const turn of result) {
    byDomain[turn.domain] = (byDomain[turn.domain] ?? 0) + 1;
    if (!byModel[turn.model]) {
      byModel[turn.model] = { runs: 0, avgTokens: 0, totalCost: 0 };
    }
    byModel[turn.model].runs++;
    byModel[turn.model].avgTokens += turn.totalTokens;
    byModel[turn.model].totalCost += turn.estimatedCost;
  }

  for (const stats of Object.values(byModel)) {
    stats.avgTokens = Math.round(stats.avgTokens / Math.max(1, stats.runs));
    stats.totalCost = round(stats.totalCost, 4);
  }

  return {
    runs: result.length,
    avgScore: scored.length > 0 ? Math.round(average(scored)) : null,
    avgLatencyMs: round(average(result.map((turn) => turn.latencyMs))),
    avgTokens: Math.round(average(result.map((turn) => turn.totalTokens))),
    totalCost: round(result.reduce((sum, turn) => sum + turn.estimatedCost, 0), 4),
    byDomain,
    byModel,
  };
}

async function runScenario(
  scenario: BenchmarkScenario,
  deps: RuntimeDeps,
): Promise<BenchmarkScenarioResult> {
  const project = await deps.projectRepo.createProject({
    ownerId: BENCHMARK_OWNER_ID,
    name: `Benchmark ${scenario.title}`,
  });
  const projectId = project.project.id;
  const threadId = project.project.threadId;
  const sceneId = project.project.activeSceneId;
  const sessionId = `benchmark-${scenario.id}`;

  await deps.agentRunRepo.getOrCreateThread(threadId, projectId);
  await seedProjectBoard(projectId, deps);

  const turns: BenchmarkTurnResult[] = [];

  for (let index = 0; index < scenario.turns.length; index++) {
    const turn = scenario.turns[index]!;
    const runFile = await deps.agentRunRepo.createRun({
      threadId,
      projectId,
      sceneId,
      sessionId,
      prompt: turn.prompt,
      agent: "core",
    });
    await deps.agentRunRepo.attachRunToThread(threadId, runFile.run.id);

    const intent = deps.classifyIntent(turn.prompt);
    const result = intent.type === "template"
      ? await completeTemplateTurn({
          scenario,
          turn: index + 1,
          prompt: turn.prompt,
          runId: runFile.run.id,
          threadId,
          projectId,
          sceneId,
          sessionId,
          deps,
        })
      : await completeAgentTurn({
          turn: index + 1,
          prompt: turn.prompt,
          runId: runFile.run.id,
          threadId,
          projectId,
          sceneId,
          sessionId,
          deps,
        });
    turns.push(result);
  }

  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    tags: scenario.tags,
    projectId,
    threadId,
    turns,
    summary: summarizeScenario(turns),
  };
}

function buildOverallReport(scenarios: BenchmarkScenarioResult[]): BenchmarkReport["overall"] {
  const turns = scenarios.flatMap((scenario) => scenario.turns);
  const scored = turns.filter((turn) => turn.score != null).map((turn) => turn.score as number);
  const byDomain: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byModel: Record<string, { runs: number; avgTokens: number; totalCost: number }> = {};

  for (const turn of turns) {
    byDomain[turn.domain] = (byDomain[turn.domain] ?? 0) + 1;
    byCategory[turn.category] = (byCategory[turn.category] ?? 0) + 1;
    if (!byModel[turn.model]) {
      byModel[turn.model] = { runs: 0, avgTokens: 0, totalCost: 0 };
    }
    byModel[turn.model].runs++;
    byModel[turn.model].avgTokens += turn.totalTokens;
    byModel[turn.model].totalCost += turn.estimatedCost;
  }

  for (const stats of Object.values(byModel)) {
    stats.avgTokens = Math.round(stats.avgTokens / Math.max(1, stats.runs));
    stats.totalCost = round(stats.totalCost, 4);
  }

  const totalTokens = turns.reduce((sum, turn) => sum + turn.totalTokens, 0);

  return {
    runs: turns.length,
    scored: scored.length,
    avgScore: scored.length > 0 ? Math.round(average(scored)) : null,
    avgLatencyMs: round(average(turns.map((turn) => turn.latencyMs))),
    avgTokens: Math.round(average(turns.map((turn) => turn.totalTokens))),
    totalTokens,
    totalCost: round(turns.reduce((sum, turn) => sum + turn.estimatedCost, 0), 4),
    byDomain,
    byCategory,
    byModel,
  };
}

async function main() {
  const suiteName = process.env.BENCHMARK_SUITE ?? "default";
  const keepData = hasArg("--keep-data");
  const dataDir = process.env.BENCHMARK_DATA_DIR
    ? resolve(process.env.BENCHMARK_DATA_DIR)
    : await mkdtemp(join(tmpdir(), "dreamer-agent-benchmark-"));
  const outputPath = resolve(
    process.env.BENCHMARK_OUTPUT ??
      join(import.meta.dir, "../../data/benchmarks/latest.json"),
  );

  process.env.DATA_DIR = dataDir;

  const deps = await loadRuntimeDeps();
  const log = deps.createLogger("benchmark-runner");
  const suite = getBenchmarkSuite(suiteName);

  log.info(`running suite "${suiteName}" with ${suite.length} scenario(s)`);
  log.info(`isolated DATA_DIR: ${dataDir}`);

  const scenarios: BenchmarkScenarioResult[] = [];
  for (const scenario of suite) {
    log.info(`scenario ${scenario.id}: ${scenario.title}`);
    scenarios.push(await runScenario(scenario, deps));
  }

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    suite: suiteName,
    isolatedDataDir: dataDir,
    scenarios,
    overall: buildOverallReport(scenarios),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));

  log.info(`wrote benchmark report to ${outputPath}`);
  if (!keepData && !process.env.BENCHMARK_DATA_DIR) {
    log.info("temporary benchmark DATA_DIR left on disk for inspection; rerun with BENCHMARK_DATA_DIR to control the location");
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
