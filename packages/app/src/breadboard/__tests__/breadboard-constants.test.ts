// The MCP authoring guide and WIRING_GUIDE_TEXT describe the board using the
// @dreamer/schemas constants. The renderer draws it from these local ones.
// If either side changes, the guides agents rely on would silently lie about
// the grid — so pin the two sources of truth together here.

import { describe, expect, test } from 'bun:test'
import {
  BREADBOARD_FULL_ROWS,
  BREADBOARD_TERMINAL_HALF_WIDTH,
} from '@dreamer/schemas'

import { COLS, ROWS } from '../breadboard-constants'

describe('breadboard dimensions', () => {
  test('renderer grid matches the schemas-level board model', () => {
    expect(ROWS).toBe(BREADBOARD_FULL_ROWS)
    expect(COLS).toBe(BREADBOARD_TERMINAL_HALF_WIDTH * 2)
  })
})
