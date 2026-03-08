/**
 * Script sandbox for executing code node scripts in a restricted context.
 *
 * Each script gets a limited API surface:
 * - `dt` (delta time in seconds)
 * - `time` (total elapsed time)
 * - `input` (resolved input port values)
 * - `console.log` (captured, not global)
 *
 * Scripts are compiled once and re-invoked per frame.
 */

export type SandboxApi = {
  dt: number;
  time: number;
  input: Record<string, unknown>;
  console: { log: (...args: unknown[]) => void };
};

export type CompiledScript = {
  run: (api: SandboxApi) => Record<string, unknown>;
};

export type SandboxLog = {
  nodeId: string;
  args: unknown[];
  timestamp: number;
};

/**
 * Compile a code string into a sandboxed function.
 * Returns a run() function that accepts the API and returns output data.
 */
export function compileScript(
  code: string,
  nodeId: string
): CompiledScript | { error: string } {
  try {
    // Wrap in a function that receives the sandbox API
    // The script can export an `update(dt)` function or just run inline
    const wrappedCode = `
      "use strict";
      return (function(__api) {
        const dt = __api.dt;
        const time = __api.time;
        const input = __api.input;
        const console = __api.console;
        const __output = {};

        ${code}

        if (typeof update === 'function') {
          const result = update(dt);
          if (result && typeof result === 'object') {
            Object.assign(__output, result);
          }
        }

        return __output;
      });
    `;

    // eslint-disable-next-line no-new-func
    const factory = new Function(wrappedCode);
    const fn = factory();

    return {
      run(api: SandboxApi): Record<string, unknown> {
        try {
          const result = fn(api);
          return typeof result === "object" && result !== null ? result : {};
        } catch (err) {
          return {
            __error: `Runtime error in node ${nodeId}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    };
  } catch (err) {
    return {
      error: `Compile error in node ${nodeId}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
