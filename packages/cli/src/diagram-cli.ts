// Headless DreamerDiagram CLI handlers.
//
// `dreamer diagram validate <file>`
//   → Parses the JSON at <file>, runs validateDiagram(), prints issues
//     grouped by severity, exits 0 for clean/warnings-only, 1 for errors.
//
// `dreamer diagram apply <file> --project <project-file>`
//   → Parses both files. Converts the diagram to BoardState via
//     diagramToBoardState, replaces the project file's boardState, writes
//     back, prints a one-line summary.
//
// Both commands operate on absolute file paths — no project-id lookups,
// no tracker interaction. They're meant to be scriptable and hermetic.

import { readFile, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { resolve } from "path"
import {
  diagramToBoardState,
  projectFileSchema,
  validateDiagram,
  type DiagramIssue,
  type ProjectFile,
} from "@dreamer/schemas"

export class DiagramCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message)
    this.name = "DiagramCliError"
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  const absolute = resolve(path)
  if (!existsSync(absolute)) {
    throw new DiagramCliError(`File not found: ${absolute}`, 2)
  }
  const raw = await readFile(absolute, "utf8")
  try {
    return JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new DiagramCliError(`Invalid JSON in ${absolute}: ${message}`, 2)
  }
}

function formatIssue(issue: DiagramIssue): string {
  const severity = issue.severity === "error" ? "\x1b[31merror\x1b[0m" : "\x1b[33mwarn \x1b[0m"
  const location = issue.path ? `  at ${issue.path}` : ""
  const suggestion = issue.suggestion ? `\n    suggestion: ${issue.suggestion}` : ""
  return `${severity}  [${issue.code}]${location}\n    ${issue.message}${suggestion}`
}

/**
 * `dreamer diagram validate <file>`
 *
 * Exit 0: structural pass + no errors (warnings are fine).
 * Exit 1: any error-severity issue.
 * Exit 2: file missing / invalid JSON / unusable input.
 */
export async function handleDiagramValidate(file: string): Promise<number> {
  const data = await readJsonFile(file)
  const result = validateDiagram(data)

  const errors = result.issues.filter((i) => i.severity === "error")
  const warnings = result.issues.filter((i) => i.severity === "warning")

  if (result.issues.length === 0) {
    console.log(`\x1b[32mok\x1b[0m  diagram validated — no issues (${resolve(file)})`)
    return 0
  }

  if (errors.length > 0) {
    console.log(`\x1b[31m${errors.length} error(s)\x1b[0m, ${warnings.length} warning(s):`)
  } else {
    console.log(`${warnings.length} warning(s):`)
  }
  for (const issue of result.issues) {
    console.log(formatIssue(issue))
  }

  return errors.length > 0 ? 1 : 0
}

/**
 * `dreamer diagram apply <file> --project <project-file>`
 *
 * Reads a DreamerDiagram, converts it to a BoardState, swaps that into the
 * named project file's `boardState` field, writes the project file back.
 *
 * Exit 0: apply succeeded.
 * Exit 1: diagram failed to convert.
 * Exit 2: file missing / invalid JSON / project file malformed.
 */
export async function handleDiagramApply(
  diagramFile: string,
  projectFile: string,
): Promise<number> {
  const diagramData = await readJsonFile(diagramFile)
  const projectData = await readJsonFile(projectFile)

  const projectParsed = projectFileSchema.safeParse(projectData)
  if (!projectParsed.success) {
    console.error(`\x1b[31merror\x1b[0m  project file is not a valid ProjectFile:`)
    for (const issue of projectParsed.error.issues) {
      console.error(`  at ${issue.path.join(".")}: ${issue.message}`)
    }
    return 2
  }

  const parseResult = diagramToBoardState(diagramData)
  if (!parseResult.ok) {
    console.error(`\x1b[31merror\x1b[0m  diagram conversion failed:`)
    for (const e of parseResult.errors) {
      const suggestion = e.suggestion ? ` (did you mean "${e.suggestion}"?)` : ""
      console.error(`  at ${e.path}: ${e.message}${suggestion}`)
    }
    return 1
  }

  const existingProject: ProjectFile = projectParsed.data
  const nextProject: ProjectFile = {
    ...existingProject,
    boardState: parseResult.boardState,
  }

  const absoluteProject = resolve(projectFile)
  await writeFile(absoluteProject, JSON.stringify(nextProject, null, 2))

  const componentCount = Object.keys(parseResult.boardState.components).length
  const wireCount = Object.keys(parseResult.boardState.wires).length
  const obstacleCount = Object.keys(parseResult.boardState.environment.obstacles).length
  const sketchBytes = parseResult.boardState.sketchCode.length

  console.log(
    `\x1b[32mok\x1b[0m  applied diagram to ${absoluteProject}\n` +
      `    components: ${componentCount}\n` +
      `    wires:      ${wireCount}\n` +
      `    obstacles:  ${obstacleCount}\n` +
      `    sketch:     ${sketchBytes} bytes`,
  )
  return 0
}
