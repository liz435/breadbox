/**
 * Integration tests for the ownership migration runner.
 *
 * Each test uses a freshly-minted temp DATA_DIR and passes `hosted`
 * explicitly to the migration entry point — the runner reads the hosted
 * flag at call time, so tests don't need to juggle env vars or poke the
 * module cache.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile, mkdir, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { migrateOwnership } from "../migrate-ownership";

type AnyProject = Record<string, unknown>;

function legacyProjectJson(id: string, name: string): AnyProject {
  const now = new Date().toISOString();
  return {
    project: {
      id,
      name,
      version: 0,
      createdAt: now,
      updatedAt: now,
      threadId: crypto.randomUUID(),
      activeSceneId: crypto.randomUUID(),
    },
    scenes: {},
    entities: {},
    sceneEntityIds: {},
    components: {
      transform: {}, sprite: {}, tilemap: {},
      physicsBody: {}, script: {}, camera: {},
    },
    assets: {},
  };
}

function ownedProjectJson(
  id: string,
  name: string,
  ownerId: string,
): AnyProject {
  const p = legacyProjectJson(id, name) as { project: AnyProject } & AnyProject;
  (p.project as AnyProject).ownerId = ownerId;
  return p;
}

async function freshDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "dreamer-migrate-ownership-"));
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Cleanup across tests
const allDirs: string[] = [];
afterAll(async () => {
  for (const d of allDirs) {
    await rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

// Routes DATA_DIR to the test's temp dir. The repo's `paths.ts` reads
// `process.env.DATA_DIR` on each call, so flipping it before each test
// run is enough — no module cache surgery needed.
function scopeDataDir(dir: string): void {
  process.env.DATA_DIR = dir;
}

async function seedProjectsDir(dataDir: string): Promise<{
  legacyId: string;
  ownedId: string;
  alreadyLegacyId: string;
}> {
  const projectsRoot = join(dataDir, "projects");
  const legacyDir = join(projectsRoot, "_legacy");
  await mkdir(legacyDir, { recursive: true });

  const legacyId = crypto.randomUUID();
  const ownedId = crypto.randomUUID();
  const alreadyLegacyId = crypto.randomUUID();

  await writeFile(
    join(projectsRoot, `${legacyId}.json`),
    JSON.stringify(legacyProjectJson(legacyId, "Legacy"), null, 2),
  );
  await writeFile(
    join(projectsRoot, `${ownedId}.json`),
    JSON.stringify(ownedProjectJson(ownedId, "Owned", "some-user"), null, 2),
  );
  await writeFile(
    join(legacyDir, `${alreadyLegacyId}.json`),
    JSON.stringify(legacyProjectJson(alreadyLegacyId, "Already moved"), null, 2),
  );

  return { legacyId, ownedId, alreadyLegacyId };
}

// ── hosted migration ────────────────────────────────────────────────────

describe("migrateOwnership — hosted mode", () => {
  test("moves legacy project to _legacy/, leaves owned and already-moved alone", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);
    const { legacyId, ownedId, alreadyLegacyId } = await seedProjectsDir(dataDir);

    scopeDataDir(dataDir);
    const result = await migrateOwnership({ hosted: true });

    expect(result.mode).toBe("hosted");
    expect(result.migrated).toBe(1);
    expect(result.stamped).toBe(0);

    const projectsRoot = join(dataDir, "projects");
    // Legacy moved
    expect(await exists(join(projectsRoot, `${legacyId}.json`))).toBe(false);
    expect(await exists(join(projectsRoot, "_legacy", `${legacyId}.json`))).toBe(true);
    // Owned untouched
    expect(await exists(join(projectsRoot, `${ownedId}.json`))).toBe(true);
    // Already in _legacy stayed put
    expect(await exists(join(projectsRoot, "_legacy", `${alreadyLegacyId}.json`))).toBe(true);
  });

  test("re-run is idempotent (no additional migrations, no errors)", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);
    await seedProjectsDir(dataDir);

    scopeDataDir(dataDir);
    await migrateOwnership({ hosted: true });
    const second = await migrateOwnership({ hosted: true });

    expect(second.migrated).toBe(0);
    expect(second.errors).toBe(0);
  });
});

// ── local migration ─────────────────────────────────────────────────────

describe("migrateOwnership — local mode", () => {
  test("stamps ownerId: 'local' in place on legacy project, skips owned", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);
    const { legacyId, ownedId } = await seedProjectsDir(dataDir);

    scopeDataDir(dataDir);
    const result = await migrateOwnership({ hosted: false });

    expect(result.mode).toBe("local");
    expect(result.stamped).toBe(1);
    expect(result.migrated).toBe(0);

    const projectsRoot = join(dataDir, "projects");

    // Legacy file still in place, but now stamped
    const stamped = await Bun.file(join(projectsRoot, `${legacyId}.json`)).json();
    expect(stamped.project.ownerId).toBe("local");

    // Owned project untouched — ownerId preserved
    const owned = await Bun.file(join(projectsRoot, `${ownedId}.json`)).json();
    expect(owned.project.ownerId).toBe("some-user");
  });

  test("re-run is idempotent (already-stamped project is skipped)", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);
    await seedProjectsDir(dataDir);

    scopeDataDir(dataDir);
    await migrateOwnership({ hosted: false });
    const second = await migrateOwnership({ hosted: false });

    expect(second.stamped).toBe(0);
    expect(second.errors).toBe(0);
  });

  test("leaves `_legacy/` subdirectory alone in either mode", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);
    const { alreadyLegacyId } = await seedProjectsDir(dataDir);

    scopeDataDir(dataDir);
    await migrateOwnership({ hosted: false });

    // The file is in `_legacy/`, not the top-level projects dir, so
    // readdir shouldn't even see it at scan time.
    const projectsRoot = join(dataDir, "projects");
    const files = await readdir(projectsRoot);
    expect(files).toContain("_legacy");
    const legacyDirEntries = await readdir(join(projectsRoot, "_legacy"));
    expect(legacyDirEntries).toContain(`${alreadyLegacyId}.json`);
  });
});

// ── empty / missing projects dir ────────────────────────────────────────

describe("migrateOwnership — edge cases", () => {
  test("empty projects dir runs cleanly with zero counts", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);

    scopeDataDir(dataDir);
    const result = await migrateOwnership({ hosted: false });
    expect(result.scanned).toBe(0);
    expect(result.stamped).toBe(0);
    expect(result.migrated).toBe(0);
    expect(result.errors).toBe(0);
  });

  test("custom ownerIdForLocal override", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);
    const { legacyId } = await seedProjectsDir(dataDir);

    scopeDataDir(dataDir);
    await migrateOwnership({ hosted: false, ownerIdForLocal: "cli-user" });

    const stamped = await Bun.file(
      join(dataDir, "projects", `${legacyId}.json`),
    ).json();
    expect(stamped.project.ownerId).toBe("cli-user");
  });

  test("rewrites pre-Supabase 'local' ownerId to the canonical UUID", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);
    const projectsRoot = join(dataDir, "projects");
    await mkdir(projectsRoot, { recursive: true });

    const legacyLocalId = crypto.randomUUID();
    await writeFile(
      join(projectsRoot, `${legacyLocalId}.json`),
      JSON.stringify(
        ownedProjectJson(legacyLocalId, "Pre-Supabase CLI", "local"),
        null,
        2,
      ),
    );

    scopeDataDir(dataDir);
    const result = await migrateOwnership({
      hosted: false,
      ownerIdForLocal: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.rewritten).toBe(1);
    expect(result.stamped).toBe(0);

    const rewritten = await Bun.file(
      join(projectsRoot, `${legacyLocalId}.json`),
    ).json();
    expect(rewritten.project.ownerId).toBe(
      "00000000-0000-0000-0000-000000000001",
    );
  });

  test("does NOT rewrite 'local' in hosted mode (avoid tenant-takeover)", async () => {
    const dataDir = await freshDataDir();
    allDirs.push(dataDir);
    const projectsRoot = join(dataDir, "projects");
    await mkdir(projectsRoot, { recursive: true });

    const legacyLocalId = crypto.randomUUID();
    await writeFile(
      join(projectsRoot, `${legacyLocalId}.json`),
      JSON.stringify(
        ownedProjectJson(legacyLocalId, "Pre-Supabase CLI", "local"),
        null,
        2,
      ),
    );

    scopeDataDir(dataDir);
    const result = await migrateOwnership({
      hosted: true,
      ownerIdForLocal: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.rewritten).toBe(0);
    const still = await Bun.file(
      join(projectsRoot, `${legacyLocalId}.json`),
    ).json();
    expect(still.project.ownerId).toBe("local");
  });
});
