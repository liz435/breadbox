// ── Collision groups ─────────────────────────────────────────────────────────
//
// Rapier collides two colliders only when each one's filter includes the
// other's membership. We use that to stop a sim-driven "driver" proxy (a servo
// horn / motor shaft) from shoving the very part it lives inside — which
// otherwise makes an animated part bounce forever, since its own driver proxy
// overlaps its body collider every frame.
//
// Memberships:
//   PART    breadboard parts (dynamic, plug into holes)
//   PROP    imported free-standing props (dynamic, loose objects)
//   DRIVER  kinematic proxies for sim-driven moving nodes
//   STATIC  boards, Arduino, desk floor
//   WIRE    jumper-wire rope nodes
//
// A DRIVER collides ONLY with PROP: a spinning motor can knock a loose prop
// across the desk, but never disturbs the breadboard parts (including its own
// host part). Everything else collides as you'd expect.

import { interactionGroups } from "@react-three/rapier"

const PART = 0
const PROP = 1
const DRIVER = 2
const STATIC = 3
const WIRE = 4

export const GROUP_PART = interactionGroups(PART, [PART, PROP, STATIC, WIRE])
export const GROUP_PROP = interactionGroups(PROP, [PART, PROP, DRIVER, STATIC, WIRE])
export const GROUP_DRIVER = interactionGroups(DRIVER, [PROP])
export const GROUP_STATIC = interactionGroups(STATIC, [PART, PROP, WIRE])
export const GROUP_WIRE = interactionGroups(WIRE, [PART, PROP, STATIC, WIRE])
