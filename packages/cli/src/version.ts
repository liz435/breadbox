// Version is injected at build time via Bun's `--define` flag.
// Fallback reads package.json at dev time.
import pkg from "../package.json" with { type: "json" }

declare const __BREADBOX_VERSION__: string | undefined

export const CLI_VERSION: string =
  typeof __BREADBOX_VERSION__ === "string" && __BREADBOX_VERSION__.length > 0
    ? __BREADBOX_VERSION__
    : (pkg as { version?: string }).version ?? "0.0.0-dev"

export const PLATFORM: string = `${process.platform}-${process.arch}`
