import { afterEach, describe, expect, test } from "bun:test";
import { resolveMcpServerConfig } from "../mcp-connect";

// The Claude-spawned MCP must read the SAME project store the running app serves.
// We achieve that by registering an MCP command of the same *kind* as the app
// (compiled → compiled, source → source) so it re-derives the identical default
// data home — and by forwarding any EXPLICIT override the spawned binary cannot
// re-derive. We must NOT pin the default home: an absolute path snapshot would
// drift if the home migrates (legacy ~/.dreamer → ~/.breadbox), wrong for a
// distributed/installed app.
describe("resolveMcpServerConfig env", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalHome = process.env.BREADBOX_HOME;

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalHome === undefined) delete process.env.BREADBOX_HOME;
    else process.env.BREADBOX_HOME = originalHome;
  });

  test("forwards an explicit BREADBOX_HOME override", () => {
    delete process.env.DATA_DIR;
    process.env.BREADBOX_HOME = "/tmp/custom-breadbox-home";
    const cfg = resolveMcpServerConfig("proj-123");
    expect(cfg.env?.BREADBOX_HOME).toBe("/tmp/custom-breadbox-home");
    expect(cfg.args.slice(-3)).toEqual(["--project", "proj-123", "mcp"]);
  });

  test("DATA_DIR takes precedence over BREADBOX_HOME (mirrors dreamerHome)", () => {
    process.env.DATA_DIR = "/tmp/data-dir-home";
    process.env.BREADBOX_HOME = "/tmp/custom-breadbox-home";
    const cfg = resolveMcpServerConfig("p");
    expect(cfg.env?.BREADBOX_HOME).toBe("/tmp/data-dir-home");
  });

  test("does NOT pin the default home — leaves env unset for self-resolution", () => {
    delete process.env.DATA_DIR;
    delete process.env.BREADBOX_HOME;
    const cfg = resolveMcpServerConfig("p");
    expect(cfg.env).toBeUndefined();
  });
});
