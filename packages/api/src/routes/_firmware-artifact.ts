import { join } from "path";
import { coreFamilyForFqbn } from "../toolchain";

export type FirmwareArtifactFormat = "hex" | "uf2";

export type FirmwareArtifact =
  | { format: "hex"; data: string }
  | { format: "uf2"; data: string };

export type ResolvedFirmwareArtifact = {
  format: FirmwareArtifactFormat;
  path: string;
};

export function firmwareFormatForFqbn(fqbn: string): FirmwareArtifactFormat {
  return coreFamilyForFqbn(fqbn) === "rp2040:rp2040" ? "uf2" : "hex";
}

export function firmwareArtifactCandidates(
  outputDir: string,
  format: FirmwareArtifactFormat,
): string[] {
  if (format === "uf2") {
    return [join(outputDir, "sketch.ino.uf2")];
  }
  return [
    join(outputDir, "sketch.ino.hex"),
    join(outputDir, "sketch.ino.with_bootloader.hex"),
  ];
}

export async function findFirmwareArtifactPath(
  outputDir: string,
  fqbn: string,
): Promise<ResolvedFirmwareArtifact | null> {
  const format = firmwareFormatForFqbn(fqbn);
  for (const path of firmwareArtifactCandidates(outputDir, format)) {
    if (await Bun.file(path).exists()) {
      return { format, path };
    }
  }
  return null;
}

export async function readFirmwareArtifact(
  outputDir: string,
  fqbn: string,
): Promise<FirmwareArtifact | null> {
  const resolved = await findFirmwareArtifactPath(outputDir, fqbn);
  if (!resolved) return null;

  if (resolved.format === "hex") {
    return { format: "hex", data: await Bun.file(resolved.path).text() };
  }

  const bytes = new Uint8Array(await Bun.file(resolved.path).arrayBuffer());
  return { format: "uf2", data: Buffer.from(bytes).toString("base64") };
}

export function expectedFirmwareArtifactNameForFqbn(fqbn: string): string {
  return firmwareFormatForFqbn(fqbn) === "uf2"
    ? "sketch.ino.uf2"
    : "sketch.ino.hex";
}

export function buildFlashUploadArgs(params: {
  arduinoCli: string;
  port: string;
  fqbn: string;
  artifactPath: string;
}): string[] {
  return [
    params.arduinoCli,
    "upload",
    "-p",
    params.port,
    "--fqbn",
    params.fqbn,
    "--input-file",
    params.artifactPath,
  ];
}
