// ── Graph Analyzer ───────────────────────────────────────────────────────
//
// Replays proposed graph ops to reconstruct the node/edge state, then checks
// graph-specific quality signals:
//   - dangling edges (reference nodes that don't exist)
//   - orphan nodes (no connected edges)
//   - setup/loop presence
//   - setup/loop reachability to an action node
//
// Used for runs whose domain is "graph" or "mixed" — those where the agent
// added nodes/edges to the visual node-block programming surface.

import type { RunFile, GraphAnalysis, PlacedGraphNode, PlacedGraphEdge } from "../types"

type SimpleNode = {
  id: string
  type: string
  name: string
  x: number
  y: number
}

type SimpleEdge = {
  id: string
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
}

/** Node types that represent "doing something" — if setup/loop reach one of
 * these (directly or transitively via edges) we consider the graph runnable. */
const ACTION_NODE_TYPES = new Set([
  "digital_write",
  "analog_write",
  "pin_mode",
  "delay",
  "serial_begin",
  "serial_print",
  "servo_write",
  "tone",
  "lcd_print",
  "code_block",
  "if_else",
  "digital_read",
  "analog_read",
])

export function analyzeGraph(run: RunFile): GraphAnalysis {
  const ops = run.proposedOps
  if (ops.length === 0) return null

  const nodes = new Map<string, SimpleNode>()
  const edges = new Map<string, SimpleEdge>()

  // Replay graph ops to build final state
  for (const op of ops) {
    switch (op.kind) {
      case "create_graph_node": {
        const n = op.payload.node as SimpleNode | undefined
        if (n) nodes.set(n.id, n)
        break
      }
      case "delete_graph_node": {
        const id = op.payload.nodeId as string | undefined
        if (id) {
          nodes.delete(id)
          // Cascade delete edges touching the node
          for (const [eid, edge] of edges) {
            if (edge.sourceNodeId === id || edge.targetNodeId === id) {
              edges.delete(eid)
            }
          }
        }
        break
      }
      case "move_graph_node": {
        const id = op.payload.nodeId as string | undefined
        if (id && nodes.has(id)) {
          const existing = nodes.get(id)!
          nodes.set(id, {
            ...existing,
            x: (op.payload.x as number) ?? existing.x,
            y: (op.payload.y as number) ?? existing.y,
          })
        }
        break
      }
      case "create_edge": {
        const e = op.payload.edge as SimpleEdge | undefined
        if (e) edges.set(e.id, e)
        break
      }
      case "delete_edge": {
        const eid = op.payload.edgeId as string | undefined
        if (eid) edges.delete(eid)
        break
      }
      // update_graph_node_data doesn't affect topology; ignore for analysis
    }
  }

  if (nodes.size === 0 && edges.size === 0) return null

  const issues: string[] = []

  // Dangling edges — edges that reference nodes not in the final node set
  let danglingEdges = 0
  for (const edge of edges.values()) {
    if (!nodes.has(edge.sourceNodeId) || !nodes.has(edge.targetNodeId)) {
      danglingEdges++
      issues.push(
        `Edge ${edge.id} references missing node(s): ${edge.sourceNodeId} → ${edge.targetNodeId}`
      )
    }
  }

  // Orphan nodes — nodes with no edges touching them
  const connectedNodeIds = new Set<string>()
  for (const edge of edges.values()) {
    connectedNodeIds.add(edge.sourceNodeId)
    connectedNodeIds.add(edge.targetNodeId)
  }
  let orphanNodes = 0
  for (const node of nodes.values()) {
    if (!connectedNodeIds.has(node.id)) {
      // Constants and variables are legitimately edge-less until used
      if (node.type === "constant" || node.type === "variable") continue
      orphanNodes++
      issues.push(`Orphan node: ${node.name} (${node.type}) has no connections`)
    }
  }

  // Setup / loop presence
  const setupNodes = [...nodes.values()].filter((n) => n.type === "setup")
  const loopNodes = [...nodes.values()].filter((n) => n.type === "loop")
  const hasSetup = setupNodes.length > 0
  const hasLoop = loopNodes.length > 0

  if (!hasSetup && nodes.size >= 2) {
    issues.push("Missing setup node — required for a runnable Arduino graph")
  }
  if (!hasLoop && nodes.size >= 2) {
    issues.push("Missing loop node — Arduino programs need a loop() entry")
  }

  // Reachability: BFS from setup/loop via flow edges only (we approximate
  // "flow" as any edge since we don't know port types from ops alone).
  function reachesAction(startIds: string[]): boolean {
    if (startIds.length === 0) return false
    const visited = new Set<string>()
    const queue = [...startIds]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const node = nodes.get(id)
      if (!node) continue
      if (ACTION_NODE_TYPES.has(node.type)) return true
      // Follow outgoing edges
      for (const edge of edges.values()) {
        if (edge.sourceNodeId === id && nodes.has(edge.targetNodeId)) {
          queue.push(edge.targetNodeId)
        }
      }
    }
    return false
  }

  const setupReachesAction = hasSetup && reachesAction(setupNodes.map((n) => n.id))
  const loopReachesAction = hasLoop && reachesAction(loopNodes.map((n) => n.id))

  if (hasSetup && !setupReachesAction) {
    issues.push("Setup node is not connected to any action node")
  }
  if (hasLoop && !loopReachesAction) {
    issues.push("Loop node is not connected to any action node")
  }

  const placedNodes: PlacedGraphNode[] = [...nodes.values()].map((n) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    x: n.x,
    y: n.y,
  }))

  const placedEdges: PlacedGraphEdge[] = [...edges.values()]

  return {
    nodesPlaced: nodes.size,
    edgesCreated: edges.size,
    danglingEdges,
    orphanNodes,
    hasSetup,
    hasLoop,
    setupReachesAction,
    loopReachesAction,
    issues,
    nodes: placedNodes,
    edges: placedEdges,
  }
}
