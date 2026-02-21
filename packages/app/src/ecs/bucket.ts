import type { Entity } from "./core";

/**
 * Ordered entity index keyed by `entity.id`.
 *
 * Why this exists:
 * - Fast lookup by ID (`Map`)
 * - Stable insertion-order iteration (`#order`)
 *
 * Compared to using only a `Map`, this makes ordering behavior explicit and
 * controllable for editor lists, deterministic serialization, and playback.
 */
export class Bucket<T extends Entity> {
  /**
   * Primary ID -> entity index for O(1) lookup and overwrite.
   */
  #byId = new Map<string, T>();

  /**
   * Explicit iteration order as entity IDs.
   *
   * We keep this separate from the map so ordering rules are obvious and can
   * be changed independently from storage mechanics.
   */
  #order: string[] = [];

  /**
   * Number of entities currently in the bucket.
   */
  get size(): number {
    return this.#order.length;
  }

  /**
   * Inserts or replaces an entity by ID.
   *
   * Behavior:
   * - New ID: appended to end of order list
   * - Existing ID: entity reference is replaced, order is preserved
   *
   * @returns The provided entity for chaining.
   */
  add(entity: T): T {
    if (!this.#byId.has(entity.id)) {
      this.#order.push(entity.id);
    }
    this.#byId.set(entity.id, entity);
    return entity;
  }

  /**
   * Retrieves an entity by ID.
   */
  get(id: string): T | undefined {
    return this.#byId.get(id);
  }

  /**
   * Returns true when an entity with this ID exists.
   */
  has(id: string): boolean {
    return this.#byId.has(id);
  }

  /**
   * Removes entity by ID from both index and order list.
   *
   * Complexity:
   * - Map delete: O(1)
   * - Order cleanup: O(n) due to array filter
   *
   * This is acceptable for lightweight/editor workloads.
   *
   * @returns `true` when an entity existed and was removed.
   */
  remove(id: string): boolean {
    const existed = this.#byId.delete(id);
    if (!existed) return false;
    this.#order = this.#order.filter((key) => key !== id);
    return true;
  }

  /**
   * Removes all entities and resets iteration order.
   */
  clear() {
    this.#byId.clear();
    this.#order = [];
  }

  /**
   * Materializes entities in current insertion order.
   *
   * Missing IDs (should not happen in normal flow) are filtered defensively.
   */
  values(): T[] {
    return this.#order
      .map((id) => this.#byId.get(id))
      .filter((entity): entity is T => entity !== undefined);
  }

  /**
   * Returns ordered `[id, entity]` pairs.
   */
  entries(): Array<[string, T]> {
    return this.#order
      .map((id) => [id, this.#byId.get(id)] as const)
      .filter((entry): entry is [string, T] => entry[1] !== undefined);
  }

  /**
   * Enables `for...of` iteration over entities in bucket order.
   */
  [Symbol.iterator](): IterableIterator<T> {
    return this.values()[Symbol.iterator]();
  }
}
