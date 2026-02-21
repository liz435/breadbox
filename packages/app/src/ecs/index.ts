/**
 * Lightweight ECS module exports.
 *
 * Typical usage:
 * 1. Define your entity shape with optional "component-like" fields.
 * 2. Create a `World<EntityShape>`.
 * 3. Build queries with `world.with(...)` / `world.where(...)`.
 * 4. Drive systems by iterating query results.
 *
 * Example:
 * ```ts
 * type GameEntity = EntityWith<{
 *   transform?: { x: number; y: number };
 *   velocity?: { x: number; y: number };
 * }>;
 *
 * const world = new World<GameEntity>();
 * const movers = world.with("transform", "velocity");
 *
 * for (const entity of movers) {
 *   entity.transform!.x += entity.velocity!.x;
 *   entity.transform!.y += entity.velocity!.y;
 *   world.refresh(entity); // only needed if predicates depend on changed fields
 * }
 * ```
 */
export { Bucket } from "./bucket";
export { Query, World, type Entity, type EntityWith } from "./core";
