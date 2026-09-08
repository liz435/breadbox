import {
  isBoardComponentType,
  isSurfaceBoardType,
  resolveComponentPins,
  type BoardComponent,
  type BoardState,
  type CustomFootprintLookup,
  type Wire,
} from "@dreamer/schemas";

export type ElectricalGridPoint = { row: number; col: number; boardId: string };
export type ElectricalNet = {
  id: string;
  points: ElectricalGridPoint[];
  arduinoPins: number[];
};

export type ElectricalTerminal = {
  componentId: string;
  pinName: string;
  address: ElectricalGridPoint;
  netId: string | null;
};

export type ElectricalTopologyDiagnostic = {
  code: "unconnected_terminal";
  componentId: string;
  pinName: string;
  message: string;
};

export type ElectricalTopology = {
  nets: ElectricalNet[];
  terminals: ElectricalTerminal[];
  terminalToNet: Map<string, string>;
  diagnostics: ElectricalTopologyDiagnostic[];
};

export const LEGACY_SURFACE_BOARD_ID = "__legacy_surface_board__";

export function electricalTerminalKey(componentId: string, pinName: string): string {
  return `${componentId}\u0000${pinName}`;
}

export function terminalAddressKey(point: ElectricalGridPoint): string {
  return `${point.boardId}:${point.row}:${point.col}`;
}

function surfaceBoardIds(components: Record<string, BoardComponent>): string[] {
  return Object.values(components)
    .filter((component) => isSurfaceBoardType(component.type))
    .map((component) => component.id);
}

export function componentSurfaceBoardId(
  component: BoardComponent,
  components: Record<string, BoardComponent>,
): string {
  if (component.parentId) return component.parentId;
  const surfaces = surfaceBoardIds(components);
  return surfaces.length === 1 ? surfaces[0]! : LEGACY_SURFACE_BOARD_ID;
}

function wireBoardId(
  wire: Wire,
  endpoint: "from" | "to",
  components: Record<string, BoardComponent>,
): string {
  const explicit = endpoint === "from" ? wire.fromBoardId : wire.toBoardId;
  if (explicit) return explicit;
  const surfaces = surfaceBoardIds(components);
  return surfaces.length === 1 ? surfaces[0]! : LEGACY_SURFACE_BOARD_ID;
}

class UnionFind {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();

  make(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.make(key);
    let root = this.parent.get(key)!;
    while (root !== this.parent.get(root)!) root = this.parent.get(root)!;
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;
    if (rankA < rankB) this.parent.set(rootA, rootB);
    else if (rankA > rankB) this.parent.set(rootB, rootA);
    else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  groups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const group = groups.get(root) ?? [];
      group.push(key);
      groups.set(root, group);
    }
    return groups;
  }
}

function componentPoints(
  component: BoardComponent,
  customFootprints: CustomFootprintLookup | undefined,
): Array<{ name: string; row: number; col: number }> {
  if (component.type === "power_supply") {
    const railBlockStarts = [2, 8, 14, 20, 26];
    const usableStarts = railBlockStarts.slice(1);
    const target = component.y + 7.5;
    let top = usableStarts[0] ?? 2;
    for (const start of usableStarts) {
      if (Math.abs(start - target) <= Math.abs(top - target)) top = start;
    }
    const bottom = top + 4;
    // The API has no renderer registry. Keep the persisted MB102 rail contract
    // here: both rail pairs and the legacy clicked pin row are accepted. The
    // snapped rows mirror the catalog footprint without importing the app.
    return [
      { name: "leftNegative", row: top, col: -2 },
      { name: "leftPositive", row: top, col: -1 },
      { name: "rightNegative", row: top, col: 10 },
      { name: "rightPositive", row: top, col: 11 },
      { name: "leftNegativeBottom", row: bottom, col: -2 },
      { name: "leftPositiveBottom", row: bottom, col: -1 },
      { name: "rightNegativeBottom", row: bottom, col: 10 },
      { name: "rightPositiveBottom", row: bottom, col: 11 },
      { name: "positive", row: component.y, col: component.x },
      { name: "negative", row: component.y + 1, col: component.x },
    ];
  }

  const pins = resolveComponentPins(
    component.type,
    component.y,
    component.x,
    component.properties,
    customFootprints,
  );
  const entries = Object.entries(pins);
  if (entries.length > 0) {
    return entries.map(([name, point]) => ({ name, ...point }));
  }
  return [{ name: "signal", row: component.y, col: component.x }];
}

/**
 * Compile the board's physical connectivity without importing React, the
 * component registry, or a solver. Both API and browser adapters can consume
 * this contract; rendering/model-specific information stays at the edge.
 */
export function compileElectricalTopology(
  board: Pick<BoardState, "components" | "wires">,
  customFootprints?: CustomFootprintLookup,
): ElectricalTopology {
  const components = board.components;
  const wires = board.wires;
  const uf = new UnionFind();
  const addresses = new Map<string, ElectricalGridPoint>();
  const componentAddressKeys = new Set<string>();
  const boards = [
    ...surfaceBoardIds(components),
    ...Object.values(components)
      .map((component) => component.parentId)
      .filter((parentId): parentId is string => Boolean(parentId)),
  ].filter((id, index, all) => all.indexOf(id) === index);
  if (boards.length === 0) boards.push(LEGACY_SURFACE_BOARD_ID);

  const key = (point: ElectricalGridPoint): string => {
    const addressKey = terminalAddressKey(point);
    addresses.set(addressKey, point);
    return addressKey;
  };

  for (const boardId of boards) {
    for (let row = 0; row < 30; row++) {
      for (let col = 1; col <= 4; col++) {
        uf.union(key({ boardId, row, col: 0 }), key({ boardId, row, col }));
      }
      for (let col = 6; col <= 9; col++) {
        uf.union(key({ boardId, row, col: 5 }), key({ boardId, row, col }));
      }
    }
    for (let row = 1; row < 30; row++) {
      for (const col of [-2, -1, 10, 11]) {
        uf.union(key({ boardId, row: 0, col }), key({ boardId, row, col }));
      }
    }
  }

  const arduinoPinsByVirtualKey = new Map<string, number>();
  for (const wire of Object.values(wires)) {
    if (wire.fromRow === -999) {
      const pin = wire.fromCol;
      const virtualKey = `arduino-pin:${wire.fromBoardId ?? "default"}:${pin}`;
      const target = key({
        boardId: wireBoardId(wire, "to", components),
        row: wire.toRow,
        col: wire.toCol,
      });
      uf.union(virtualKey, target);
      arduinoPinsByVirtualKey.set(virtualKey, pin);
    } else {
      uf.union(
        key({ boardId: wireBoardId(wire, "from", components), row: wire.fromRow, col: wire.fromCol }),
        key({ boardId: wireBoardId(wire, "to", components), row: wire.toRow, col: wire.toCol }),
      );
    }
  }

  for (const component of Object.values(components)) {
    if (isBoardComponentType(component.type) || component.type === "wire") continue;
    const boardId = componentSurfaceBoardId(component, components);
    for (const point of componentPoints(component, customFootprints)) {
      const address = { boardId, row: point.row, col: point.col };
      const addressKey = key(address);
      uf.make(addressKey);
      componentAddressKeys.add(addressKey);
    }
  }

  const nets: ElectricalNet[] = [];
  for (const [root, members] of uf.groups()) {
    const points = members
      .filter((member) => !member.startsWith("arduino-pin:"))
      .map((member) => addresses.get(member))
      .filter((point): point is ElectricalGridPoint => point !== undefined);
    const arduinoPins = members
      .map((member) => arduinoPinsByVirtualKey.get(member))
      .filter((pin): pin is number => pin !== undefined);
    const touchesComponent = points.some((point) => componentAddressKeys.has(terminalAddressKey(point)));
    if (arduinoPins.length === 0 && !touchesComponent) continue;
    const id = `net-${nets.length}`;
    // Preserve first-seen wire order for compatibility with diagnostics while
    // still removing duplicate aliases of the same physical pin.
    nets.push({ id, points, arduinoPins: [...new Set(arduinoPins)] });
  }

  const terminals: ElectricalTerminal[] = [];
  const terminalToNet = new Map<string, string>();
  const diagnostics: ElectricalTopologyDiagnostic[] = [];
  const netForAddress = (address: ElectricalGridPoint): ElectricalNet | undefined =>
    nets.find((net) => net.points.some((point) => terminalAddressKey(point) === terminalAddressKey(address)));

  for (const component of Object.values(components)) {
    if (isBoardComponentType(component.type) || component.type === "wire") continue;
    const boardId = componentSurfaceBoardId(component, components);
    for (const point of componentPoints(component, customFootprints)) {
      const address = { boardId, row: point.row, col: point.col };
      const net = netForAddress(address);
      const terminal = { componentId: component.id, pinName: point.name, address, netId: net?.id ?? null };
      terminals.push(terminal);
      if (net) terminalToNet.set(electricalTerminalKey(component.id, point.name), net.id);
      else diagnostics.push({
        code: "unconnected_terminal",
        componentId: component.id,
        pinName: point.name,
        message: `${component.name} pin ${point.name} is not connected to a resolved net`,
      });
    }
  }

  return { nets, terminals, terminalToNet, diagnostics };
}
