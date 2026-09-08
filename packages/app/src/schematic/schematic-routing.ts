import type {
  SchematicEdge,
  SchematicLayout,
  SchematicNode,
  SchematicTerminalSide,
} from "./schematic-layout"

export type SchematicPoint = { x: number; y: number }

export type SchematicSegment = {
  edgeId: string
  netId: string
  from: SchematicPoint
  to: SchematicPoint
}

export type SchematicRoute = {
  edgeId: string
  netId: string
  from: SchematicPoint
  to: SchematicPoint
  segments: SchematicSegment[]
  pathD: string
}

export type SchematicRoutingIssue = {
  code:
    | "missing_route_endpoint"
    | "wire_through_symbol"
    | "net_crossing_without_junction"
  severity: "error" | "warning"
  message: string
  edgeId?: string
  netId?: string
  x?: number
  y?: number
}

const TERMINAL_OFFSET: Record<SchematicTerminalSide, { dx: number; dy: number }> = {
  left: { dx: 0, dy: 0 },
  "left-top": { dx: 0, dy: -14 },
  "left-bottom": { dx: 0, dy: 14 },
  right: { dx: 60, dy: 0 },
  "right-top": { dx: 60, dy: -14 },
  "right-bottom": { dx: 60, dy: 14 },
  top: { dx: 30, dy: -20 },
  bottom: { dx: 30, dy: 20 },
  "bottom-left": { dx: 18, dy: 25 },
  "bottom-center": { dx: 30, dy: 25 },
  "bottom-right": { dx: 42, dy: 25 },
}

/** This is the end of the Arduino pin stub, not the IC label edge. */
const ARDUINO_PIN_TERMINAL_OFFSET = 88

export function getSchematicTerminalPos(
  node: Pick<SchematicNode, "x" | "y" | "type">,
  side: SchematicTerminalSide,
): SchematicPoint {
  const offset = TERMINAL_OFFSET[side]

  if (node.type === "arduino_pin" && side === "right") {
    return { x: node.x + ARDUINO_PIN_TERMINAL_OFFSET, y: node.y }
  }
  if (node.type === "voltage_source" && side === "right") {
    return { x: node.x + 60, y: node.y }
  }
  if (node.type === "ground" && side === "left") {
    return { x: node.x, y: node.y }
  }
  if (node.type === "servo" || node.type === "temperature_sensor") {
    if (side === "left-top") return { x: node.x, y: node.y - 14 }
    if (side === "left-bottom") return { x: node.x, y: node.y + 14 }
    if (side === "right") return { x: node.x + 64, y: node.y }
  }
  if (node.type === "transistor") {
    if (side === "right-top") return { x: node.x + 38, y: node.y - 24 }
    if (side === "right-bottom") return { x: node.x + 38, y: node.y + 24 }
  }
  if (node.type === "mosfet") {
    if (side === "right-top") return { x: node.x + 40, y: node.y - 24 }
    if (side === "right-bottom") return { x: node.x + 40, y: node.y + 24 }
  }
  if (node.type === "ic_pin") return { x: node.x, y: node.y }

  return { x: node.x + offset.dx, y: node.y + offset.dy }
}

/**
 * The electrically meaningful part of a two-terminal symbol. Labels and
 * annotation are deliberately excluded: a route may pass behind those, but
 * never through a resistor, LED bar, or other electrical body.
 */
export function schematicSymbolBodyBounds(node: SchematicNode) {
  switch (node.type) {
    case "led":
      return { left: node.x + 12, right: node.x + 48, top: node.y - 22, bottom: node.y + 10 }
    case "resistor":
    case "photoresistor":
      return { left: node.x + 4, right: node.x + 56, top: node.y - 14, bottom: node.y + 14 }
    case "capacitor":
    case "button":
    case "buzzer":
    case "dc_motor":
      return { left: node.x + 8, right: node.x + 52, top: node.y - 20, bottom: node.y + 20 }
    default:
      return null
  }
}

function midpointRouteCrossesSymbol(from: SchematicPoint, to: SchematicPoint, layout: SchematicLayout): boolean {
  const midX = (from.x + to.x) / 2
  const top = Math.min(from.y, to.y)
  const bottom = Math.max(from.y, to.y)
  return layout.nodes.some((node) => {
    const body = schematicSymbolBodyBounds(node)
    return body != null && midX > body.left && midX < body.right && bottom > body.top && top < body.bottom
  })
}

function isEndpointBody(node: SchematicNode, edge: SchematicEdge): boolean {
  return node.id === edge.fromNodeId || node.id === edge.toNodeId
}

function horizontalChannelCrossesBody(
  y: number,
  fromX: number,
  toX: number,
  edge: SchematicEdge,
  layout: SchematicLayout,
): boolean {
  return layout.nodes.some((node) => {
    if (isEndpointBody(node, edge)) return false
    const body = schematicSymbolBodyBounds(node)
    return body != null && y > body.top && y < body.bottom && Math.max(fromX, toX) > body.left && Math.min(fromX, toX) < body.right
  })
}

function verticalChannelCrossesBody(
  x: number,
  fromY: number,
  toY: number,
  edge: SchematicEdge,
  layout: SchematicLayout,
): boolean {
  return layout.nodes.some((node) => {
    if (isEndpointBody(node, edge)) return false
    const body = schematicSymbolBodyBounds(node)
    return body != null && x > body.left && x < body.right && Math.max(fromY, toY) > body.top && Math.min(fromY, toY) < body.bottom
  })
}

function segment(edgeId: string, netId: string, from: SchematicPoint, to: SchematicPoint): SchematicSegment | null {
  if (from.x === to.x && from.y === to.y) return null
  return { edgeId, netId, from, to }
}

function routeSegments(edge: SchematicEdge, from: SchematicPoint, to: SchematicPoint, layout: SchematicLayout): { pathD: string; segments: SchematicSegment[] } {
  const parts: SchematicPoint[] = [from]
  let pathD: string

  if (edge.toSide === "right" && from.x < to.x) {
    const clearance = 20
    const channelY = Math.max(from.y, to.y) + clearance
    const firstX = verticalChannelCrossesBody(from.x + clearance, from.y, channelY, edge, layout)
      ? from.x - clearance
      : from.x + clearance
    parts.push({ x: firstX, y: from.y }, { x: firstX, y: channelY }, { x: to.x + clearance, y: channelY }, { x: to.x + clearance, y: to.y }, to)
    pathD = `M ${from.x} ${from.y} H ${firstX} V ${channelY} H ${to.x + clearance} V ${to.y} H ${to.x}`
  } else if (Math.abs(from.y - to.y) < 2 && !horizontalChannelCrossesBody(from.y, from.x, to.x, edge, layout)) {
    parts.push(to)
    pathD = `M ${from.x} ${from.y} H ${to.x}`
  } else if (Math.abs(from.y - to.y) < 2) {
    const channelY = Math.max(...layout.nodes.map((node) => schematicSymbolBodyBounds(node)?.bottom ?? -Infinity).filter((value) => Number.isFinite(value)), from.y) + 20
    parts.push({ x: from.x, y: channelY }, { x: to.x, y: channelY }, to)
    pathD = `M ${from.x} ${from.y} V ${channelY} H ${to.x} V ${to.y}`
  } else if (edge.fromSide === "right" && edge.toSide === "left" && midpointRouteCrossesSymbol(from, to, layout)) {
    const clearance = 20
    const channelY = Math.max(from.y, to.y) + clearance
    parts.push({ x: from.x + clearance, y: from.y }, { x: from.x + clearance, y: channelY }, { x: to.x - clearance, y: channelY }, { x: to.x - clearance, y: to.y }, to)
    pathD = `M ${from.x} ${from.y} H ${from.x + clearance} V ${channelY} H ${to.x - clearance} V ${to.y} H ${to.x}`
  } else {
    const midX = (from.x + to.x) / 2
    parts.push({ x: midX, y: from.y }, { x: midX, y: to.y }, to)
    pathD = `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x}`
  }

  const segments = parts.slice(0, -1)
    .map((point, index) => segment(edge.id, edge.netId, point, parts[index + 1]!))
    .filter((value): value is SchematicSegment => value != null)
  return { pathD, segments }
}

export function routeSchematicEdge(edge: SchematicEdge, layout: SchematicLayout): SchematicRoute | null {
  const fromNode = layout.nodes.find((node) => node.id === edge.fromNodeId)
  const toNode = layout.nodes.find((node) => node.id === edge.toNodeId)
  if (!fromNode || !toNode) return null
  const from = getSchematicTerminalPos(fromNode, edge.fromSide)
  const to = getSchematicTerminalPos(toNode, edge.toSide)
  const routed = routeSegments(edge, from, to, layout)
  return { edgeId: edge.id, netId: edge.netId, from, to, ...routed }
}

function between(value: number, a: number, b: number): boolean {
  return value >= Math.min(a, b) && value <= Math.max(a, b)
}

function intersection(a: SchematicSegment, b: SchematicSegment): SchematicPoint | null {
  const aHorizontal = a.from.y === a.to.y
  const bHorizontal = b.from.y === b.to.y
  if (aHorizontal === bHorizontal) {
    if (!aHorizontal && a.from.x !== b.from.x) return null
    if (aHorizontal && a.from.y !== b.from.y) return null
    // Collinear overlap is represented by the first shared endpoint when one
    // exists. The generated router does not intentionally create overlaps.
    const candidates = [a.from, a.to, b.from, b.to]
    return candidates.find((point) => pointOnSegment(point, a) && pointOnSegment(point, b)) ?? null
  }
  const horizontal = aHorizontal ? a : b
  const vertical = aHorizontal ? b : a
  const point = { x: vertical.from.x, y: horizontal.from.y }
  return between(point.x, horizontal.from.x, horizontal.to.x) && between(point.y, vertical.from.y, vertical.to.y)
    ? point
    : null
}

function pointOnSegment(point: SchematicPoint, segmentValue: SchematicSegment): boolean {
  return segmentValue.from.x === segmentValue.to.x
    ? point.x === segmentValue.from.x && between(point.y, segmentValue.from.y, segmentValue.to.y)
    : point.y === segmentValue.from.y && between(point.x, segmentValue.from.x, segmentValue.to.x)
}

function isInterior(point: SchematicPoint, segmentValue: SchematicSegment): boolean {
  return pointOnSegment(point, segmentValue)
    && !(point.x === segmentValue.from.x && point.y === segmentValue.from.y)
    && !(point.x === segmentValue.to.x && point.y === segmentValue.to.y)
}

function key(point: SchematicPoint): string {
  return `${Math.round(point.x)},${Math.round(point.y)}`
}

export function findSchematicJunctions(layout: SchematicLayout): SchematicPoint[] {
  const routes = layout.edges.map((edge) => routeSchematicEdge(edge, layout)).filter((route): route is SchematicRoute => route != null)
  const incident = new Map<string, { point: SchematicPoint; count: number }>()
  const add = (point: SchematicPoint, amount = 1) => {
    const existing = incident.get(key(point))
    if (existing) existing.count += amount
    else incident.set(key(point), { point, count: amount })
  }
  for (const route of routes) {
    for (const segmentValue of route.segments) {
      add(segmentValue.from)
      add(segmentValue.to)
    }
  }
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      if (routes[i]!.netId !== routes[j]!.netId) continue
      for (const a of routes[i]!.segments) {
        for (const b of routes[j]!.segments) {
          const point = intersection(a, b)
          if (point && isInterior(point, a) && isInterior(point, b)) add(point, 4)
        }
      }
    }
  }
  return [...incident.values()].filter((entry) => entry.count > 2).map((entry) => entry.point)
}

function routeHitsBody(route: SchematicRoute, layout: SchematicLayout): SchematicNode | undefined {
  const edge = layout.edges.find((candidate) => candidate.id === route.edgeId)
  return layout.nodes.find((node) => {
    // The route is expected to arrive at the terminal of its two endpoint
    // symbols. Their body is therefore not an accidental crossing; only a
    // third symbol can make this route visually lie through an electrical
    // body.
    if (node.id === edge?.fromNodeId || node.id === edge?.toNodeId) return false
    const body = schematicSymbolBodyBounds(node)
    if (!body) return false
    return route.segments.some((segmentValue) => {
      const horizontal = segmentValue.from.y === segmentValue.to.y
      if (horizontal) {
        return segmentValue.from.y > body.top && segmentValue.from.y < body.bottom && Math.max(segmentValue.from.x, segmentValue.to.x) > body.left && Math.min(segmentValue.from.x, segmentValue.to.x) < body.right
      }
      return segmentValue.from.x > body.left && segmentValue.from.x < body.right && Math.max(segmentValue.from.y, segmentValue.to.y) > body.top && Math.min(segmentValue.from.y, segmentValue.to.y) < body.bottom
    })
  })
}

export function validateSchematicRouting(layout: SchematicLayout): SchematicRoutingIssue[] {
  const issues: SchematicRoutingIssue[] = []
  const routes = layout.edges.map((edge) => routeSchematicEdge(edge, layout))
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]
    if (!route) {
      issues.push({ code: "missing_route_endpoint", severity: "error", message: `Edge ${layout.edges[i]!.id} has no routable endpoints`, edgeId: layout.edges[i]!.id })
      continue
    }
    const hit = routeHitsBody(route, layout)
    if (hit) {
      issues.push({ code: "wire_through_symbol", severity: "error", message: `Edge ${route.edgeId} crosses the electrical body of ${hit.id}`, edgeId: route.edgeId, netId: route.netId })
    }
  }
  const validRoutes = routes.filter((route): route is SchematicRoute => route != null)
  const crossings = new Set<string>()
  for (let i = 0; i < validRoutes.length; i++) {
    for (let j = i + 1; j < validRoutes.length; j++) {
      const left = validRoutes[i]!
      const right = validRoutes[j]!
      if (left.netId === right.netId) continue
      for (const a of left.segments) {
        for (const b of right.segments) {
          const point = intersection(a, b)
          if (!point || !isInterior(point, a) || !isInterior(point, b)) continue
          const crossingKey = `${left.edgeId}:${right.edgeId}:${key(point)}`
          if (crossings.has(crossingKey)) continue
          crossings.add(crossingKey)
          issues.push({ code: "net_crossing_without_junction", severity: "warning", message: `Nets ${left.netId} and ${right.netId} cross at ${key(point)}; crossing is visually separate but should be reviewed`, edgeId: left.edgeId, netId: left.netId, x: point.x, y: point.y })
        }
      }
    }
  }
  return issues
}
