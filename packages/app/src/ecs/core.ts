/**
 * Minimal ECS entity identity contract.
 *
 * Internally, `World` only requires an `id` to track membership and
 * synchronize query sets. Every other field is treated as component data.
 */
export type Entity = {
  id: string;
};

/**
 * Helper type for "entity + component bag" shapes.
 *
 * Example:
 * `type SceneEntity = EntityWith<{ transform?: Transform; sprite?: Sprite }>`
 */
export type EntityWith<T extends object> = Entity & T;

type Predicate<T extends Entity> = (entity: T) => boolean;

let nextEntityId = 1;

/**
 * Creates monotonically increasing entity IDs for local/editor use.
 *
 * Notes:
 * - This is intentionally simple and deterministic within one process.
 * - For multiplayer/persistence, server-generated IDs are still preferred.
 */
function createEntityId(): string {
  return `e-${nextEntityId++}`;
}

/**
 * Live query view over a world's entities.
 *
 * A `Query` does not scan the world every iteration. Instead, the owning
 * `World` pushes membership updates into the query whenever entities are
 * added/updated/removed.
 */
export class Query<T extends Entity> {
  /**
   * Membership set for this query.
   *
   * The set gives O(1) add/delete/has and preserves insertion order for
   * iteration, which is enough for a lightweight ECS runtime.
   */
  #items = new Set<T>();

  /**
   * Predicate chain that defines this query's matching rules.
   *
   * Query match is `AND` semantics across predicates.
   */
  #predicates: Predicate<T>[];

  /**
   * @param predicates Match functions evaluated with AND semantics.
   */
  constructor(predicates: Predicate<T>[]) {
    this.#predicates = predicates;
  }

  /**
   * Returns true when the entity is currently part of the query result.
   */
  has(entity: T): boolean {
    return this.#items.has(entity);
  }

  /**
   * Materializes query members into an array snapshot.
   *
   * Use this if you need array methods. For zero-allocation iteration in
   * hot paths, prefer `for (const entity of query)`.
   */
  values(): T[] {
    return [...this.#items];
  }

  /**
   * Iterates current query members in insertion order.
   */
  [Symbol.iterator](): IterableIterator<T> {
    return this.#items.values();
  }

  /**
   * Checks whether an entity matches this query's predicates.
   *
   * This is called by `World` during synchronization.
   */
  test(entity: T): boolean {
    return this.#predicates.every((predicate) => predicate(entity));
  }

  /**
   * Internal: adds entity to query membership.
   *
   * This does not validate predicates; `World` decides membership and then
   * calls `add`/`delete`.
   */
  add(entity: T) {
    this.#items.add(entity);
  }

  /**
   * Internal: removes entity from query membership.
   */
  delete(entity: T) {
    this.#items.delete(entity);
  }
}

/**
 * Lightweight ECS world:
 * - stores entity objects
 * - tracks queries
 * - incrementally maintains query membership
 *
 * Design goal: predictable behavior and simple internals over maximal
 * optimization. This is intentionally "small ECS", suitable for v0 editor
 * and runtime loops.
 */
export class World<T extends Entity> {
  /**
   * Canonical in-memory entity set.
   */
  #entities = new Set<T>();

  /**
   * All active queries created from this world.
   *
   * World owns query synchronization and updates each query whenever entity
   * membership may have changed.
   */
  #queries = new Set<Query<T>>();

  /**
   * Number of entities currently in the world.
   */
  get size(): number {
    return this.#entities.size;
  }

  /**
   * Creates and inserts a new entity into the world.
   *
   * @param data Entity fields. If `id` is omitted, a local ID is generated.
   * @returns The inserted entity object (same reference stored by world).
   */
  create(data: Omit<T, "id"> & Partial<Pick<T, "id">>): T {
    const entity = {
      id: data.id ?? createEntityId(),
      ...data,
    } as T;

    this.add(entity);
    return entity;
  }

  /**
   * Adds an existing entity object to the world.
   *
   * Query membership is synchronized immediately.
   */
  add(entity: T): T {
    this.#entities.add(entity);
    this.#syncEntity(entity);
    return entity;
  }

  /**
   * Removes an entity from world and all query memberships.
   *
   * @returns `true` if entity existed and was removed.
   */
  remove(entity: T): boolean {
    if (!this.#entities.delete(entity)) return false;
    for (const query of this.#queries) {
      query.delete(entity);
    }
    return true;
  }

  /**
   * Clears all entities and all query memberships.
   */
  clear() {
    this.#entities.clear();
    for (const query of this.#queries) {
      for (const entity of query) {
        query.delete(entity);
      }
    }
  }

  /**
   * Applies a shallow patch to an entity, then re-evaluates query membership.
   *
   * Important:
   * - This mutates the existing entity object (stable reference).
   * - Because query predicates may depend on patched fields, the world runs
   *   synchronization afterward.
   */
  update(entity: T, patch: Partial<Omit<T, "id">>): T {
    Object.assign(entity, patch);
    this.#syncEntity(entity);
    return entity;
  }

  /**
   * Returns a snapshot array of all entities.
   */
  entities(): T[] {
    return [...this.#entities];
  }

  /**
   * Builds a query that matches entities where the listed keys are present
   * (not `undefined` and not `null`).
   *
   * This is a convenient "component presence" query for ECS-like usage.
   *
   * Example:
   * `world.with("transform", "velocity")`
   */
  with<K extends keyof T>(...keys: K[]): Query<T> {
    return this.where((entity) =>
      keys.every((key) => entity[key] !== undefined && entity[key] !== null)
    );
  }

  /**
   * Builds a query from one or more predicates.
   *
   * The query is:
   * - registered into the world
   * - immediately hydrated from current entities
   * - kept up to date incrementally afterward
   */
  where(...predicates: Predicate<T>[]): Query<T> {
    const query = new Query<T>(predicates);
    this.#queries.add(query);

    for (const entity of this.#entities) {
      if (query.test(entity)) {
        query.add(entity);
      }
    }

    return query;
  }

  /**
   * Forces re-evaluation of a specific entity against all queries.
   *
   * Use this when component data was mutated outside `world.update(...)`.
   * If you always patch through `update`, you normally do not need this.
   */
  refresh(entity: T) {
    if (!this.#entities.has(entity)) return;
    this.#syncEntity(entity);
  }

  /**
   * Internal synchronization algorithm.
   *
   * For each query:
   * 1. Evaluate predicates
   * 2. Add entity if it now matches and is absent
   * 3. Remove entity if it no longer matches and is present
   *
   * Complexity:
   * O(number_of_queries) per synced entity update.
   * This is acceptable for lightweight ECS/editor workloads.
   */
  #syncEntity(entity: T) {
    for (const query of this.#queries) {
      const matches = query.test(entity);
      if (matches && !query.has(entity)) {
        query.add(entity);
      } else if (!matches && query.has(entity)) {
        query.delete(entity);
      }
    }
  }
}
