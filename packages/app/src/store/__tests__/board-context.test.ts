import { describe, expect, test } from "bun:test"
import { createActor } from "xstate"
import { boardMachine } from "../board-machine"
import { boardEqual } from "../board-context"
import { EPHEMERAL_BOARD_FIELDS } from "@/project/board-slice"
import { boardStateSchema } from "@dreamer/schemas"
import type { BoardMachineContext } from "../board-machine"

/**
 * `useBoard()` subscribes via `useSelector(snap => snap.context, boardEqual)`.
 * xstate/react keeps the PREVIOUS selected value whenever the comparator says
 * the new one is equal. This reproduces that caching without React, so we can
 * assert what a `useBoard()` consumer would actually observe.
 */
function memoizedSelector() {
  let current: BoardMachineContext | undefined
  return (next: BoardMachineContext): BoardMachineContext => {
    if (current !== undefined && boardEqual(current, next)) return current
    current = next
    return current
  }
}

function startBoard() {
  const actor = createActor(boardMachine)
  actor.start()
  return actor
}

const ASSEMBLY_A = {
  bodies: {
    a: {
      id: "a",
      name: "a",
      assetId: "asset-a",
      uri: "/a.glb",
      format: "glb" as const,
      parent: { kind: "world" as const },
      transform: { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 1 },
      importScale: 1,
      upAxis: "y" as const,
    },
  },
  bindings: [],
}

describe("boardEqual", () => {
  // The regression this guards: boardEqual omitted `assembly` and
  // `customLibraries`. Any field the machine mutates but boardEqual ignores is
  // invisible to useBoard() — subscribers read stale values forever and
  // effects keyed on them never re-run.
  test("observes every persisted board field", () => {
    const ephemeral: readonly string[] = EPHEMERAL_BOARD_FIELDS
    const persisted = Object.keys(boardStateSchema.shape).filter(
      (field) => !ephemeral.includes(field),
    )

    const base = startBoard().getSnapshot().context
    for (const field of persisted) {
      const mutated = { ...base, [field]: Symbol(field) } as unknown as BoardMachineContext
      expect(
        boardEqual(base, mutated),
        `boardEqual ignores "${field}" — useBoard() consumers will never see it change`,
      ).toBe(false)
    }
  })

  test("treats an identical context as equal", () => {
    const ctx = startBoard().getSnapshot().context
    expect(boardEqual(ctx, { ...ctx })).toBe(true)
  })
})

describe("useBoard() staleness", () => {
  // Before the fix, a SET_ASSEMBLY dispatch produced a new context object that
  // boardEqual declared equal, so the memoized selector kept returning the old
  // one. Two consecutive assembly edits would each spread that stale document,
  // and the first edit would be silently lost.
  test("a SET_ASSEMBLY dispatch is visible to a useBoard() subscriber", () => {
    const actor = startBoard()
    const select = memoizedSelector()

    const before = select(actor.getSnapshot().context)
    expect(before.assembly?.bodies.a).toBeUndefined()

    actor.send({ type: "SET_ASSEMBLY", assembly: ASSEMBLY_A })
    const after = select(actor.getSnapshot().context)

    expect(after).not.toBe(before)
    expect(after.assembly?.bodies.a).toBeDefined()
  })

  test("consecutive assembly edits compose instead of clobbering", () => {
    const actor = startBoard()
    const select = memoizedSelector()

    select(actor.getSnapshot().context)
    actor.send({ type: "SET_ASSEMBLY", assembly: ASSEMBLY_A })

    // What useAssemblyActions does: read the doc a subscriber can see, then
    // spread it. A stale read here drops body "a".
    const seen = select(actor.getSnapshot().context)
    const bodyA = seen.assembly?.bodies.a
    if (!bodyA) throw new Error("body 'a' was not visible to the subscriber")

    const withB = {
      bodies: { ...seen.assembly?.bodies, b: { ...bodyA, id: "b", assetId: "asset-b" } },
      bindings: [],
    }
    actor.send({ type: "SET_ASSEMBLY", assembly: withB })

    const final = select(actor.getSnapshot().context)
    expect(Object.keys(final.assembly?.bodies ?? {}).sort()).toEqual(["a", "b"])
  })

  test("a customLibraries change is visible to a useBoard() subscriber", () => {
    const actor = startBoard()
    const select = memoizedSelector()
    const before = select(actor.getSnapshot().context)

    actor.send({
      type: "ADD_CUSTOM_LIBRARY",
      name: "MyLib",
      library: { name: "MyLib", code: "// x", description: "" },
    })
    const after = select(actor.getSnapshot().context)

    expect(after).not.toBe(before)
    expect(after.customLibraries.MyLib).toBeDefined()
  })
})
