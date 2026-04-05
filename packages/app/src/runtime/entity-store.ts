import type { GraphNode } from "@dreamer/schemas";

/**
 * Mutable runtime state for a single entity (sprite).
 * Separate from the static graph node data — this is what changes every frame.
 */
export type EntityState = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  tint: string;
  visible: boolean;
  uri: string | null;
};

function defaultEntity(node: GraphNode): EntityState {
  return {
    x: typeof node.data.sceneX === "number" ? (node.data.sceneX as number) : 0,
    y: typeof node.data.sceneY === "number" ? (node.data.sceneY as number) : 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    tint: typeof node.data.tint === "string" ? (node.data.tint as string) : "#4a9eff",
    visible: true,
    uri: typeof node.data.uri === "string" ? (node.data.uri as string) : null,
  };
}

/**
 * Runtime entity store — holds mutable per-entity state.
 * Code nodes write to this via the `entities` API.
 * The viewport reads from this to render sprites.
 */
export class EntityStore {
  readonly entities = new Map<string, EntityState>();
  /** Per-code-node persistent state across frames */
  readonly nodeState = new Map<string, Record<string, unknown>>();

  /**
   * Initialize entities from sprite nodes at runtime start.
   * Only sprites in allowedSpriteIds are included — the output node
   * is the sole gateway to rendering.
   */
  init(nodes: Record<string, GraphNode>, allowedSpriteIds: Set<string>) {
    this.entities.clear();
    this.nodeState.clear();
    for (const node of Object.values(nodes)) {
      if (allowedSpriteIds.has(node.id)) {
        this.entities.set(node.id, defaultEntity(node));
      }
    }
  }

  /**
   * Sync: add/remove sprites each frame.
   * Only sprites in allowedSpriteIds are included.
   */
  sync(nodes: Record<string, GraphNode>, allowedSpriteIds: Set<string>) {
    const activeSpriteIds = new Set<string>();
    for (const node of Object.values(nodes)) {
      // Include all nodes in allowed set
      if (!allowedSpriteIds.has(node.id)) continue;
      activeSpriteIds.add(node.id);
      if (!this.entities.has(node.id)) {
        this.entities.set(node.id, defaultEntity(node));
      }
    }
    for (const id of this.entities.keys()) {
      if (!activeSpriteIds.has(id)) {
        this.entities.delete(id);
      }
    }
  }

  /** Get or create persistent state for a code node */
  getNodeState(nodeId: string): Record<string, unknown> {
    let s = this.nodeState.get(nodeId);
    if (!s) {
      s = {};
      this.nodeState.set(nodeId, s);
    }
    return s;
  }

  /** Build the entities API object exposed to code node scripts */
  buildEntitiesApi(nodes: Record<string, GraphNode>): EntitiesApi {
    const store = this;
    // Build name→id lookup
    const nameToId = new Map<string, string>();
    for (const node of Object.values(nodes)) {
      nameToId.set(node.name, node.id);
    }

    return {
      get(nameOrId: string): EntityHandle | null {
        const id = nameToId.get(nameOrId) ?? nameOrId;
        const entity = store.entities.get(id);
        if (!entity) return null;
        return new EntityHandle(entity);
      },
      list(): string[] {
        return [...nameToId.keys()];
      },
    };
  }

  clear() {
    this.entities.clear();
    this.nodeState.clear();
  }
}

/** Read/write handle for a single entity, exposed to scripts */
export class EntityHandle {
  constructor(private readonly e: EntityState) {}

  get x() { return this.e.x; }
  set x(v: number) { this.e.x = v; }

  get y() { return this.e.y; }
  set y(v: number) { this.e.y = v; }

  get scaleX() { return this.e.scaleX; }
  set scaleX(v: number) { this.e.scaleX = v; }

  get scaleY() { return this.e.scaleY; }
  set scaleY(v: number) { this.e.scaleY = v; }

  get rotation() { return this.e.rotation; }
  set rotation(v: number) { this.e.rotation = v; }

  get tint() { return this.e.tint; }
  set tint(v: string) { this.e.tint = v; }

  get visible() { return this.e.visible; }
  set visible(v: boolean) { this.e.visible = v; }

  setPosition(x: number, y: number) {
    this.e.x = x;
    this.e.y = y;
  }

  setScale(sx: number, sy?: number) {
    this.e.scaleX = sx;
    this.e.scaleY = sy ?? sx;
  }

  translate(dx: number, dy: number) {
    this.e.x += dx;
    this.e.y += dy;
  }
}

export type EntitiesApi = {
  /** Get entity by sprite name or node ID */
  get(nameOrId: string): EntityHandle | null;
  /** List all entity names */
  list(): string[];
};
