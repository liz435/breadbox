// ── Unique project name generator ──────────────────────────────────────────
//
// Generates memorable names like "cyan-dog-pants" from three word lists.
// Checks existing project names to avoid collisions.

const ADJECTIVES = [
  "amber", "aqua", "azure", "bold", "brave", "bright", "calm", "chrome",
  "clear", "cobalt", "cool", "coral", "cosmic", "crisp", "crystal", "cyan",
  "dark", "deep", "dusty", "echo", "ember", "faint", "fast", "fierce",
  "foggy", "fresh", "frost", "gentle", "glass", "gold", "grand", "green",
  "grey", "hazy", "hot", "icy", "iron", "jade", "keen", "laser", "light",
  "lime", "lunar", "maple", "matte", "mint", "misty", "navy", "neon",
  "noble", "nova", "olive", "opal", "pale", "pearl", "pine", "pink",
  "plum", "polar", "pure", "quiet", "rapid", "red", "rich", "rocky",
  "rose", "royal", "ruby", "rust", "sage", "sand", "sharp", "silk",
  "silver", "slate", "sleek", "slow", "soft", "solar", "stark", "steel",
  "stone", "storm", "sunny", "swift", "teal", "thin", "tidy", "tiny",
  "turbo", "ultra", "vast", "vivid", "warm", "white", "wild", "zinc",
]

const NOUNS = [
  "ant", "ape", "bat", "bear", "bee", "bird", "boar", "cat", "cod",
  "cow", "crab", "crow", "deer", "dog", "dove", "duck", "eel", "elk",
  "emu", "fish", "frog", "goat", "gull", "hare", "hawk", "hen", "hog",
  "ibis", "jay", "koi", "lark", "lion", "lynx", "mink", "mole", "moth",
  "newt", "oryx", "orca", "owl", "ox", "pug", "ram", "rat", "ray",
  "seal", "slug", "swan", "toad", "vole", "wasp", "wolf", "wren", "yak",
]

const OBJECTS = [
  "arch", "axle", "band", "bell", "bolt", "bone", "book", "boot", "bowl",
  "cape", "card", "chip", "clip", "coat", "coin", "cone", "cord", "cube",
  "dart", "desk", "disc", "door", "drum", "dust", "edge", "fern", "flag",
  "fork", "gear", "gift", "harp", "helm", "hook", "horn", "hose", "iron",
  "jade", "kite", "knob", "lamp", "leaf", "lens", "lock", "loop", "loom",
  "mask", "maze", "mill", "moon", "nail", "nest", "note", "oven", "palm",
  "pane", "pipe", "pole", "pump", "ramp", "reed", "ring", "rope", "sail",
  "seed", "sign", "slab", "sock", "star", "stem", "tarp", "tile", "tray",
  "tube", "vane", "vest", "vine", "wand", "wick", "wing", "yarn", "zinc",
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a random name like "cyan-dog-pants". */
export function generateProjectName(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${pick(OBJECTS)}`;
}

/** Generate a unique name that doesn't collide with existing names. */
export function generateUniqueProjectName(existingNames: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const name = generateProjectName();
    if (!existingNames.has(name)) return name;
  }
  // Extremely unlikely fallback — append a random suffix
  return `${generateProjectName()}-${Date.now().toString(36).slice(-4)}`;
}
