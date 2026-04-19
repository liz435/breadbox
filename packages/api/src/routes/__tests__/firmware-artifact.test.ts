import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  buildFlashUploadArgs,
  expectedFirmwareArtifactNameForFqbn,
  findFirmwareArtifactPath,
  firmwareFormatForFqbn,
} from "../_firmware-artifact";

const TEST_DIR = await mkdtemp(join(tmpdir(), "dreamer-firmware-artifact-"));

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("firmware artifact resolver", () => {
  test("maps fqbn family to expected artifact format", () => {
    expect(firmwareFormatForFqbn("arduino:avr:uno")).toBe("hex");
    expect(firmwareFormatForFqbn("rp2040:rp2040:rpipico")).toBe("uf2");
  });

  test("prefers sketch.ino.hex over with_bootloader fallback", async () => {
    const out = join(TEST_DIR, "avr-primary");
    await mkdir(out, { recursive: true });
    await Bun.write(join(out, "sketch.ino.hex"), ":0100000000FF");
    await Bun.write(join(out, "sketch.ino.with_bootloader.hex"), ":0200000000FF");

    const resolved = await findFirmwareArtifactPath(out, "arduino:avr:uno");
    expect(resolved?.format).toBe("hex");
    expect(resolved?.path.endsWith("sketch.ino.hex")).toBe(true);
  });

  test("uses with_bootloader hex when primary hex is absent", async () => {
    const out = join(TEST_DIR, "avr-fallback");
    await mkdir(out, { recursive: true });
    await Bun.write(join(out, "sketch.ino.with_bootloader.hex"), ":0200000000FF");

    const resolved = await findFirmwareArtifactPath(out, "arduino:avr:uno");
    expect(resolved?.format).toBe("hex");
    expect(resolved?.path.endsWith("sketch.ino.with_bootloader.hex")).toBe(true);
  });

  test("resolves uf2 artifact for RP2040 boards", async () => {
    const out = join(TEST_DIR, "rp2040");
    await mkdir(out, { recursive: true });
    await Bun.write(join(out, "sketch.ino.uf2"), new Uint8Array([0x55, 0x46, 0x32]));

    const resolved = await findFirmwareArtifactPath(out, "rp2040:rp2040:rpipico");
    expect(resolved?.format).toBe("uf2");
    expect(resolved?.path.endsWith("sketch.ino.uf2")).toBe(true);
  });

  test("returns null when expected artifact is missing", async () => {
    const out = join(TEST_DIR, "missing");
    await mkdir(out, { recursive: true });
    const resolved = await findFirmwareArtifactPath(out, "rp2040:rp2040:rpipico");
    expect(resolved).toBeNull();
    expect(expectedFirmwareArtifactNameForFqbn("rp2040:rp2040:rpipico")).toBe("sketch.ino.uf2");
  });
});

describe("flash upload command builder", () => {
  test("constructs upload args from resolved artifact path", () => {
    const args = buildFlashUploadArgs({
      arduinoCli: "/usr/local/bin/arduino-cli",
      port: "/dev/ttyUSB0",
      fqbn: "rp2040:rp2040:rpipico",
      artifactPath: "/tmp/sketch.ino.uf2",
    });

    expect(args).toEqual([
      "/usr/local/bin/arduino-cli",
      "upload",
      "-p",
      "/dev/ttyUSB0",
      "--fqbn",
      "rp2040:rp2040:rpipico",
      "--input-file",
      "/tmp/sketch.ino.uf2",
    ]);
  });
});
