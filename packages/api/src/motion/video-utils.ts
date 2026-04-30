import { join, resolve, sep } from "path";
import { mkdir, unlink } from "fs/promises";
import { motionArtifactsDir } from "../paths";
import {
  comfyRifeFrameCount,
  type ComfyImageRef,
  uploadImageToComfyUI,
  queueRifeWorkflow,
  pollRifeResult,
  downloadComfyFrame,
} from "./comfyui-client";

const SUPPORTED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
]);

const SUPPORTED_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);

export function extensionFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

export function isSupportedVideoUpload(file: File): boolean {
  const ext = extensionFromName(file.name);
  return SUPPORTED_VIDEO_TYPES.has(file.type) || SUPPORTED_VIDEO_EXTENSIONS.has(ext);
}

export function artifactUrl(projectId: string, filename: string): string {
  return `/api/motion/artifacts/${encodeURIComponent(projectId)}/${encodeURIComponent(filename)}`;
}

export function artifactPath(projectId: string, filename: string): string {
  const dir = join(motionArtifactsDir(), projectId);
  const dirResolved = resolve(dir);
  const filePath = resolve(join(dir, filename));
  if (filePath !== dirResolved && !filePath.startsWith(dirResolved + sep)) {
    throw new Error("Invalid artifact path");
  }
  return filePath;
}

export function filenameFromArtifactUrl(url: string): string | null {
  const marker = "/api/motion/artifacts/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const rest = url.slice(index + marker.length);
  const parts = rest.split("/");
  if (parts.length !== 2) return null;
  return decodeURIComponent(parts[1]);
}

export function artifactPathFromUrl(projectId: string, url: string): string | null {
  const filename = filenameFromArtifactUrl(url);
  if (!filename) return null;
  return artifactPath(projectId, filename);
}

export async function ensureMotionArtifactDir(projectId: string): Promise<string> {
  const dir = join(motionArtifactsDir(), projectId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cutVideoSegment(input: {
  sourcePath: string;
  outputPath: string;
  startTimeSeconds: number;
  durationSeconds: number;
}): Promise<void> {
  await runMediaCommand("ffmpeg", [
    "-y",
    "-ss",
    String(input.startTimeSeconds),
    "-i",
    input.sourcePath,
    "-t",
    String(input.durationSeconds),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    input.outputPath,
  ]);
}

export async function extractVideoFrame(input: {
  sourcePath: string;
  outputPath: string;
  timeSeconds: number;
}): Promise<void> {
  await runMediaCommand("ffmpeg", [
    "-y",
    "-ss",
    String(input.timeSeconds),
    "-i",
    input.sourcePath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    input.outputPath,
  ]);
}

export async function renderTransformedFrame(input: {
  sourceFramePath: string;
  targetFramePath?: string;
  outputPath: string;
  subjectBox: { x: number; y: number; width: number; height: number };
  transform: { translateX: number; translateY: number; scale: number; rotateDeg: number };
}): Promise<void> {
  const { subjectBox, transform } = input;
  const cropW = `iw*${subjectBox.width}`;
  const cropH = `ih*${subjectBox.height}`;
  const cropX = `iw*${subjectBox.x}`;
  const cropY = `ih*${subjectBox.y}`;
  const overlayX = `W*${subjectBox.x + transform.translateX}`;
  const overlayY = `H*${subjectBox.y + transform.translateY}`;
  const radians = `${transform.rotateDeg}*PI/180`;
  const hasTargetFrame = Boolean(input.targetFramePath);
  const filter = hasTargetFrame
    ? `[1:v]null[base];[0:v]crop=w=${cropW}:h=${cropH}:x=${cropX}:y=${cropY},` +
      `scale=iw*${transform.scale}:ih*${transform.scale},` +
      `rotate=${radians}:c=none:ow=rotw(iw):oh=roth(ih)[moved];` +
      `[base][moved]overlay=x=${overlayX}:y=${overlayY}:format=auto`
    : `[0:v]split=2[base][src];` +
      `[src]crop=w=${cropW}:h=${cropH}:x=${cropX}:y=${cropY},` +
    `scale=iw*${transform.scale}:ih*${transform.scale},` +
    `rotate=${radians}:c=none:ow=rotw(iw):oh=roth(ih)[moved];` +
    `[base][moved]overlay=x=${overlayX}:y=${overlayY}:format=auto`;

  const args = [
    "-y",
    "-i",
    input.sourceFramePath,
  ];
  if (input.targetFramePath) {
    args.push("-i", input.targetFramePath);
  }
  args.push(
    "-filter_complex",
    filter,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    input.outputPath,
  );
  await runMediaCommand("ffmpeg", args);
}

export async function renderSubjectBoxMask(input: {
  framePath: string;
  outputPath: string;
  subjectBox: { x: number; y: number; width: number; height: number };
}): Promise<void> {
  const { subjectBox } = input;
  const filter =
    "format=gray,lut=y=0," +
    `drawbox=x=iw*${subjectBox.x}:y=ih*${subjectBox.y}:` +
    `w=iw*${subjectBox.width}:h=ih*${subjectBox.height}:color=white:t=fill,` +
    "format=yuvj420p";

  await runMediaCommand("ffmpeg", [
    "-y",
    "-i",
    input.framePath,
    "-vf",
    filter,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    input.outputPath,
  ]);
}

export async function getVideoInfo(
  path: string,
): Promise<{ duration: number; hasAudio: boolean; fps: number; width: number; height: number }> {
  const ffprobePath = process.env.FFPROBE_PATH ?? "ffprobe";
  const proc = Bun.spawn(
    [
      ffprobePath,
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      path,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    const detail = stderr.trim() || stdout.trim() || `ffprobe exited with ${code}`;
    throw new Error(detail.slice(0, 1200));
  }
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; avg_frame_rate?: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const durationStr = parsed.format?.duration;
  const duration = durationStr ? parseFloat(durationStr) : 0;
  const hasAudio = (parsed.streams ?? []).some((stream) => stream.codec_type === "audio");
  const videoStream = (parsed.streams ?? []).find((s) => s.codec_type === "video");
  const fpsStr = videoStream?.avg_frame_rate ?? "30/1";
  const fpsParts = fpsStr.split("/").map(Number);
  const fps =
    fpsParts.length === 2 && fpsParts[1] > 0 ? fpsParts[0] / fpsParts[1] : 30;
  return {
    duration: Number.isFinite(duration) ? duration : 0,
    hasAudio,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 30,
    width: videoStream?.width && videoStream.width > 0 ? videoStream.width : 1280,
    height: videoStream?.height && videoStream.height > 0 ? videoStream.height : 720,
  };
}

type AnimationCurve = "linear" | "easeIn" | "easeOut" | "easeInOut" | "sharp";

type CurveSeg = { inputFraction: number; outputFraction: number };

const CURVE_SEGS: Record<AnimationCurve, CurveSeg[]> = {
  linear:     [{ inputFraction: 1,    outputFraction: 1    }],
  easeIn:     [{ inputFraction: 0.5,  outputFraction: 0.67 }, { inputFraction: 0.5,  outputFraction: 0.33 }],
  easeOut:    [{ inputFraction: 0.5,  outputFraction: 0.33 }, { inputFraction: 0.5,  outputFraction: 0.67 }],
  easeInOut:  [{ inputFraction: 0.33, outputFraction: 0.4  }, { inputFraction: 0.34, outputFraction: 0.2  }, { inputFraction: 0.33, outputFraction: 0.4  }],
  sharp:      [{ inputFraction: 0.25, outputFraction: 0.35 }, { inputFraction: 0.5,  outputFraction: 0.3  }, { inputFraction: 0.25, outputFraction: 0.35 }],
};

export async function retimeGeneratedSegment(input: {
  sourcePath: string;
  generatedPath: string;
  targetDurationSeconds: number;
  outputPath: string;
  tempDir: string;
  animationCurve?: AnimationCurve;
}): Promise<void> {
  const sourceInfo = await getVideoInfo(input.sourcePath);
  const generatedInfo = await getVideoInfo(input.generatedPath);
  const sourceFps = Math.round(sourceInfo.fps) || 30;
  const normalizeVideoFilter = `scale=${sourceInfo.width}:${sourceInfo.height}:force_original_aspect_ratio=decrease,pad=${sourceInfo.width}:${sourceInfo.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${sourceFps},format=yuv420p`;
  const curve = input.animationCurve ?? "linear";
  const curveSegs = CURVE_SEGS[curve];
  const targetDuration = Math.max(0.05, input.targetDurationSeconds);
  const sourceDuration = Math.max(0.05, generatedInfo.duration);
  const uniquePrefix = `retime-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempFiles: string[] = [];

  type Piece = {
    startSeconds?: number;
    durationSeconds?: number;
    vfFilter: string;
    outputDurationSeconds: number;
  };

  const pieces: Piece[] = [];
  if (curveSegs.length === 1) {
    pieces.push({
      vfFilter: `setpts=${(targetDuration / sourceDuration).toFixed(6)}*PTS`,
      outputDurationSeconds: targetDuration,
    });
  } else {
    let inputOffset = 0;
    for (const seg of curveSegs) {
      const segInputDuration = sourceDuration * seg.inputFraction;
      const segOutputDuration = targetDuration * seg.outputFraction;
      pieces.push({
        startSeconds: inputOffset,
        durationSeconds: segInputDuration,
        vfFilter: `setpts=${(segOutputDuration / segInputDuration).toFixed(6)}*PTS`,
        outputDurationSeconds: segOutputDuration,
      });
      inputOffset += segInputDuration;
    }
  }

  try {
    const normalizedPaths: string[] = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const piecePath =
        pieces.length === 1 ? input.outputPath : join(input.tempDir, `${uniquePrefix}-piece-${index}.mp4`);
      if (pieces.length > 1) tempFiles.push(piecePath);

      const args: string[] = ["-y"];
      if (piece.startSeconds !== undefined) args.push("-ss", String(piece.startSeconds));
      if (piece.durationSeconds !== undefined) args.push("-t", String(piece.durationSeconds));
      args.push("-i", input.generatedPath);
      if (!generatedInfo.hasAudio) {
        args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
        args.push("-map", "0:v", "-map", "1:a", "-shortest");
      } else {
        args.push("-map", "0:v", "-map", "0:a");
      }
      args.push(
        "-vf",
        `${piece.vfFilter},${normalizeVideoFilter}`,
        "-t",
        String(piece.outputDurationSeconds),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        piecePath,
      );
      await runMediaCommand("ffmpeg", args);
      normalizedPaths.push(piecePath);
    }

    if (normalizedPaths.length > 1) {
      const concatListPath = join(input.tempDir, `${uniquePrefix}-concat.txt`);
      tempFiles.push(concatListPath);
      const listContents = normalizedPaths
        .map((piecePath) => `file '${piecePath.replaceAll("'", "'\\''")}'`)
        .join("\n");
      await Bun.write(concatListPath, listContents);
      await runMediaCommand("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        input.outputPath,
      ]);
    }
  } finally {
    for (const tempPath of tempFiles) {
      try {
        if (await Bun.file(tempPath).exists()) {
          await unlink(tempPath);
        }
      } catch {
        // best-effort cleanup; ignore deletion errors
      }
    }
  }
}

export async function stitchVideoSegment(input: {
  sourcePath: string;
  generatedPath: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  outputPath: string;
  tempDir: string;
  animationCurve?: AnimationCurve;
}): Promise<void> {
  const sourceInfo = await getVideoInfo(input.sourcePath);
  const generatedInfo = await getVideoInfo(input.generatedPath);

  const segmentDuration = input.endTimeSeconds - input.startTimeSeconds;
  const hasBefore = input.startTimeSeconds > 0.05;
  const hasAfter =
    sourceInfo.duration > 0 && input.endTimeSeconds < sourceInfo.duration - 0.05;

  // When Veo generates longer than the target segment (4x slow-mo hack), speed up
  // the generated clip to fit. Re-sample fps to match source so concat is seamless.
  const needsSpeedup = generatedInfo.duration > segmentDuration + 0.1;
  const ptsFactor = needsSpeedup ? segmentDuration / generatedInfo.duration : 1;
  const sourceFps = Math.round(sourceInfo.fps) || 30;
  const normalizeVideoFilter = `scale=${sourceInfo.width}:${sourceInfo.height}:force_original_aspect_ratio=decrease,pad=${sourceInfo.width}:${sourceInfo.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${sourceFps},format=yuv420p`;

  const uniquePrefix = `stitch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempFiles: string[] = [];

  type Piece = {
    inputPath: string;
    hasAudio: boolean;
    startSeconds?: number;
    durationSeconds?: number;
    vfFilter?: string;
    trimOutputSeconds?: number;
  };

  const pieces: Piece[] = [];
  if (hasBefore) {
    pieces.push({
      inputPath: input.sourcePath,
      hasAudio: sourceInfo.hasAudio,
      startSeconds: 0,
      durationSeconds: input.startTimeSeconds,
    });
  }
  const curve = input.animationCurve ?? "linear";
  const curveSegs = CURVE_SEGS[curve];
  if (!needsSpeedup || curveSegs.length === 1) {
    // linear or no speedup needed — single piece
    pieces.push({
      inputPath: input.generatedPath,
      hasAudio: generatedInfo.hasAudio,
      ...(needsSpeedup && {
        vfFilter: `setpts=${ptsFactor.toFixed(6)}*PTS`,
        trimOutputSeconds: segmentDuration,
      }),
    });
  } else {
    // multi-segment speed ramp
    let inputOffset = 0;
    for (const seg of curveSegs) {
      const segInputDuration = generatedInfo.duration * seg.inputFraction;
      const segOutputDuration = segmentDuration * seg.outputFraction;
      const segPtsFactor = segOutputDuration / segInputDuration;
      pieces.push({
        inputPath: input.generatedPath,
        hasAudio: generatedInfo.hasAudio,
        startSeconds: inputOffset,
        durationSeconds: segInputDuration,
        vfFilter: `setpts=${segPtsFactor.toFixed(6)}*PTS`,
        trimOutputSeconds: segOutputDuration,
      });
      inputOffset += segInputDuration;
    }
  }
  if (hasAfter) {
    pieces.push({
      inputPath: input.sourcePath,
      hasAudio: sourceInfo.hasAudio,
      startSeconds: input.endTimeSeconds,
      durationSeconds: Math.max(0, sourceInfo.duration - input.endTimeSeconds),
    });
  }

  try {
    const normalizedPaths: string[] = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const pieceFilename = `${uniquePrefix}-piece-${index}.mp4`;
      const piecePath = join(input.tempDir, pieceFilename);
      tempFiles.push(piecePath);

      const args: string[] = ["-y"];
      if (piece.startSeconds !== undefined) {
        args.push("-ss", String(piece.startSeconds));
      }
      if (piece.durationSeconds !== undefined) {
        args.push("-t", String(piece.durationSeconds));
      }
      args.push("-i", piece.inputPath);

      if (!piece.hasAudio) {
        args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
        args.push("-map", "0:v", "-map", "1:a", "-shortest");
      } else {
        args.push("-map", "0:v", "-map", "0:a");
      }
      if (piece.vfFilter) {
        args.push("-vf", `${piece.vfFilter},${normalizeVideoFilter}`);
      } else {
        args.push("-vf", normalizeVideoFilter);
      }
      if (piece.trimOutputSeconds !== undefined) {
        args.push("-t", String(piece.trimOutputSeconds));
      }
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        piecePath,
      );
      await runMediaCommand("ffmpeg", args);
      normalizedPaths.push(piecePath);
    }

    const concatListPath = join(input.tempDir, `${uniquePrefix}-concat.txt`);
    tempFiles.push(concatListPath);
    const listContents = normalizedPaths
      .map((piecePath) => `file '${piecePath.replaceAll("'", "'\\''")}'`)
      .join("\n");
    await Bun.write(concatListPath, listContents);

    await runMediaCommand("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      input.outputPath,
    ]);
  } finally {
    for (const tempPath of tempFiles) {
      try {
        if (await Bun.file(tempPath).exists()) {
          await unlink(tempPath);
        }
      } catch {
        // best-effort cleanup; ignore deletion errors
      }
    }
  }
}

async function runMediaCommand(command: string, args: string[]): Promise<void> {
  const executable = command === "ffmpeg"
    ? process.env.FFMPEG_PATH ?? "ffmpeg"
    : command;
  const proc = Bun.spawn([executable, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    const detail = stderr.trim() || stdout.trim() || `${command} exited with ${code}`;
    throw new Error(detail.slice(0, 1200));
  }
}

export function createPlaceholderKeyframeSvg(input: {
  label: string;
  timeSeconds: number;
  projectName: string;
}): string {
  const label = escapeHtml(input.label);
  const projectName = escapeHtml(input.projectName);
  const time = input.timeSeconds.toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#121212"/>
  <rect x="36" y="36" width="1208" height="648" fill="#1f1f1f" stroke="#555" stroke-width="2"/>
  <text x="64" y="96" fill="#f5f5f5" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="34" font-weight="700">${label} keyframe</text>
  <text x="64" y="144" fill="#bdbdbd" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="24">${projectName}</text>
  <text x="64" y="188" fill="#8f8f8f" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="22">Placeholder frame at ${time}s. Replace with ffmpeg extraction in Phase 3.</text>
  <line x1="496" y1="230" x2="784" y2="230" stroke="#71717a" stroke-width="8" stroke-linecap="round"/>
  <line x1="496" y1="230" x2="432" y2="350" stroke="#71717a" stroke-width="8" stroke-linecap="round"/>
  <line x1="784" y1="230" x2="848" y2="350" stroke="#71717a" stroke-width="8" stroke-linecap="round"/>
  <line x1="560" y1="430" x2="720" y2="430" stroke="#71717a" stroke-width="8" stroke-linecap="round"/>
  <line x1="560" y1="430" x2="512" y2="602" stroke="#71717a" stroke-width="8" stroke-linecap="round"/>
  <line x1="720" y1="430" x2="768" y2="602" stroke="#71717a" stroke-width="8" stroke-linecap="round"/>
  <line x1="560" y1="230" x2="560" y2="430" stroke="#71717a" stroke-width="8" stroke-linecap="round"/>
  <line x1="720" y1="230" x2="720" y2="430" stroke="#71717a" stroke-width="8" stroke-linecap="round"/>
  <circle cx="640" cy="150" r="52" fill="#303030" stroke="#a1a1aa" stroke-width="8"/>
</svg>`;
}

export async function writeComfyFramesToVideo(input: {
  frameRefs: ComfyImageRef[];
  outputPath: string;
  tempDir: string;
  fps: number;
  startIndex?: number;
  maxFrames?: number;
}): Promise<number> {
  const startIndex = Math.max(0, input.startIndex ?? 0);
  const maxFrames = input.maxFrames ?? input.frameRefs.length;
  const selectedRefs = input.frameRefs.slice(startIndex, startIndex + maxFrames);
  if (selectedRefs.length === 0) {
    throw new Error("No ComfyUI frames were available to encode");
  }

  const uniquePrefix = `comfy-frames-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempFiles: string[] = [];
  try {
    for (let i = 0; i < selectedRefs.length; i += 1) {
      const framePath = join(
        input.tempDir,
        `${uniquePrefix}-${String(i).padStart(4, "0")}.jpg`,
      );
      tempFiles.push(framePath);
      const bytes = await downloadComfyFrame(selectedRefs[i]);
      await Bun.write(framePath, bytes);
    }

    const sequencePattern = join(input.tempDir, `${uniquePrefix}-%04d.jpg`);
    const videoFilter =
      "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1," +
      `fps=${Math.max(1, Math.round(input.fps))},format=yuv420p`;
    await runMediaCommand("ffmpeg", [
      "-y",
      "-framerate",
      String(Math.max(1, Math.round(input.fps))),
      "-start_number",
      "0",
      "-i",
      sequencePattern,
      "-frames:v",
      String(selectedRefs.length),
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-shortest",
      "-vf",
      videoFilter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      input.outputPath,
    ]);
    return selectedRefs.length;
  } finally {
    for (const tempPath of tempFiles) {
      try {
        if (await Bun.file(tempPath).exists()) {
          await unlink(tempPath);
        }
      } catch {
        // best-effort cleanup; ignore deletion errors
      }
    }
  }
}

export async function renderRifeInterpolationClip(input: {
  frameAPath: string;
  frameBPath: string;
  outputPath: string;
  tempDir: string;
  durationSeconds: number;
  fps?: number;
  frameCount?: number;
}): Promise<void> {
  const fps = Math.max(1, Math.round(input.fps ?? 12));
  const frameCount = Math.max(
    2,
    input.frameCount ?? Math.ceil(Math.max(0.25, input.durationSeconds) * fps),
  );
  const uniquePrefix = `rife-preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const frameARef = await uploadImageToComfyUI(input.frameAPath, `${uniquePrefix}-a.jpg`);
  const frameBRef = await uploadImageToComfyUI(input.frameBPath, `${uniquePrefix}-b.jpg`);
  const promptId = await queueRifeWorkflow(frameARef, frameBRef, frameCount);
  const outputRefs = await pollRifeResult(promptId, 120_000);
  await writeComfyFramesToVideo({
    frameRefs: outputRefs,
    outputPath: input.outputPath,
    tempDir: input.tempDir,
    fps,
    startIndex: 0,
    maxFrames: Math.min(outputRefs.length, frameCount),
  });
}

export async function applyRifeTailTransition(input: {
  videoPath: string;
  targetFramePath: string;
  fps: number;
  outputPath: string;
  tempDir: string;
  transitionFrameCount?: number;
}): Promise<void> {
  const frameCount = Math.max(2, input.transitionFrameCount ?? comfyRifeFrameCount());
  const transitionDuration = frameCount / input.fps;

  const info = await getVideoInfo(input.videoPath);
  const totalDuration = info.duration;
  const trimmedDuration = totalDuration - transitionDuration;

  if (trimmedDuration < 0.05) {
    // Clip is too short to carve a tail off — pass it through unchanged.
    await runMediaCommand("ffmpeg", [
      "-y",
      "-i",
      input.videoPath,
      "-c",
      "copy",
      input.outputPath,
    ]);
    return;
  }

  const uniquePrefix = `rife-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempFiles: string[] = [];

  try {
    // Frame A: the last "real" Veo frame before the transition begins.
    const frameAPath = join(input.tempDir, `${uniquePrefix}-rife-a.jpg`);
    tempFiles.push(frameAPath);
    await extractVideoFrame({
      sourcePath: input.videoPath,
      outputPath: frameAPath,
      timeSeconds: Math.max(0, trimmedDuration - 1 / input.fps),
    });

    // Upload both anchor frames to ComfyUI and queue a RIFE interpolation.
    const frameARef = await uploadImageToComfyUI(frameAPath, `${uniquePrefix}-a.jpg`);
    const frameBRef = await uploadImageToComfyUI(
      input.targetFramePath,
      `${uniquePrefix}-b.jpg`,
    );
    const promptId = await queueRifeWorkflow(frameARef, frameBRef, frameCount);
    const outputRefs = await pollRifeResult(promptId, 120_000);

    if (outputRefs.length === 0) {
      throw new Error("ComfyUI returned no RIFE frames");
    }

    // Build the RIFE tail segment. Skip frame 0 when possible because it is
    // usually a near-duplicate of frame A, but keep frameCount frames after
    // that so the transition can still land on frame B.
    const tailPath = join(input.tempDir, `${uniquePrefix}-rife-tail.mp4`);
    tempFiles.push(tailPath);
    await writeComfyFramesToVideo({
      frameRefs: outputRefs,
      outputPath: tailPath,
      tempDir: input.tempDir,
      fps: input.fps,
      startIndex: outputRefs.length > 1 ? 1 : 0,
      maxFrames: frameCount,
    });

    // Trim the original retimed clip to trimmedDuration. Re-encode rather than
    // -c copy so we land on a clean I-frame boundary for the concat seam.
    const trimmedPath = join(input.tempDir, `${uniquePrefix}-trimmed.mp4`);
    tempFiles.push(trimmedPath);
    await runMediaCommand("ffmpeg", [
      "-y",
      "-i",
      input.videoPath,
      "-t",
      String(trimmedDuration),
      "-map",
      "0:v",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      trimmedPath,
    ]);

    // Concat trimmed body + RIFE tail.
    const concatListPath = join(input.tempDir, `${uniquePrefix}-concat.txt`);
    tempFiles.push(concatListPath);
    const listContents = [trimmedPath, tailPath]
      .map((piecePath) => `file '${piecePath.replaceAll("'", "'\\''")}'`)
      .join("\n");
    await Bun.write(concatListPath, listContents);
    await runMediaCommand("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      input.outputPath,
    ]);
  } finally {
    for (const tempPath of tempFiles) {
      try {
        if (await Bun.file(tempPath).exists()) {
          await unlink(tempPath);
        }
      } catch {
        // best-effort cleanup; ignore deletion errors
      }
    }
  }
}

export async function applyRifeHeadTransition(input: {
  videoPath: string;
  sourceFramePath: string;
  fps: number;
  outputPath: string;
  tempDir: string;
  transitionFrameCount?: number;
}): Promise<void> {
  const frameCount = Math.max(2, input.transitionFrameCount ?? comfyRifeFrameCount());
  const transitionDuration = frameCount / input.fps;
  const info = await getVideoInfo(input.videoPath);
  const totalDuration = info.duration;

  if (totalDuration - transitionDuration < 0.05) {
    await runMediaCommand("ffmpeg", [
      "-y",
      "-i",
      input.videoPath,
      "-c",
      "copy",
      input.outputPath,
    ]);
    return;
  }

  const uniquePrefix = `rife-head-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempFiles: string[] = [];

  try {
    const frameBPath = join(input.tempDir, `${uniquePrefix}-rife-b.jpg`);
    tempFiles.push(frameBPath);
    await extractVideoFrame({
      sourcePath: input.videoPath,
      outputPath: frameBPath,
      timeSeconds: Math.min(totalDuration, transitionDuration),
    });

    const frameARef = await uploadImageToComfyUI(input.sourceFramePath, `${uniquePrefix}-a.jpg`);
    const frameBRef = await uploadImageToComfyUI(frameBPath, `${uniquePrefix}-b.jpg`);
    const promptId = await queueRifeWorkflow(frameARef, frameBRef, frameCount);
    const outputRefs = await pollRifeResult(promptId, 120_000);

    if (outputRefs.length === 0) {
      throw new Error("ComfyUI returned no RIFE frames");
    }

    const headPath = join(input.tempDir, `${uniquePrefix}-rife-head.mp4`);
    tempFiles.push(headPath);
    await writeComfyFramesToVideo({
      frameRefs: outputRefs,
      outputPath: headPath,
      tempDir: input.tempDir,
      fps: input.fps,
      startIndex: 0,
      maxFrames: frameCount,
    });

    const trimmedPath = join(input.tempDir, `${uniquePrefix}-trimmed.mp4`);
    tempFiles.push(trimmedPath);
    await runMediaCommand("ffmpeg", [
      "-y",
      "-ss",
      String(transitionDuration),
      "-i",
      input.videoPath,
      "-map",
      "0:v",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      trimmedPath,
    ]);

    const concatListPath = join(input.tempDir, `${uniquePrefix}-concat.txt`);
    tempFiles.push(concatListPath);
    const listContents = [headPath, trimmedPath]
      .map((piecePath) => `file '${piecePath.replaceAll("'", "'\\''")}'`)
      .join("\n");
    await Bun.write(concatListPath, listContents);
    await runMediaCommand("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      input.outputPath,
    ]);
  } finally {
    for (const tempPath of tempFiles) {
      try {
        if (await Bun.file(tempPath).exists()) {
          await unlink(tempPath);
        }
      } catch {
        // best-effort cleanup; ignore deletion errors
      }
    }
  }
}

export async function applyRifeBookendTransitions(input: {
  videoPath: string;
  sourceFramePath?: string;
  targetFramePath?: string;
  fps: number;
  outputPath: string;
  tempDir: string;
  transitionFrameCount?: number;
}): Promise<void> {
  if (!input.sourceFramePath && !input.targetFramePath) {
    await runMediaCommand("ffmpeg", [
      "-y",
      "-i",
      input.videoPath,
      "-c",
      "copy",
      input.outputPath,
    ]);
    return;
  }

  const uniquePrefix = `rife-bookend-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempFiles: string[] = [];
  let workingPath = input.videoPath;

  try {
    if (input.sourceFramePath) {
      const headOutputPath = input.targetFramePath
        ? join(input.tempDir, `${uniquePrefix}-head.mp4`)
        : input.outputPath;
      if (input.targetFramePath) tempFiles.push(headOutputPath);
      await applyRifeHeadTransition({
        videoPath: workingPath,
        sourceFramePath: input.sourceFramePath,
        fps: input.fps,
        outputPath: headOutputPath,
        tempDir: input.tempDir,
        transitionFrameCount: input.transitionFrameCount,
      });
      workingPath = headOutputPath;
    }

    if (input.targetFramePath) {
      await applyRifeTailTransition({
        videoPath: workingPath,
        targetFramePath: input.targetFramePath,
        fps: input.fps,
        outputPath: input.outputPath,
        tempDir: input.tempDir,
        transitionFrameCount: input.transitionFrameCount,
      });
    }
  } finally {
    for (const tempPath of tempFiles) {
      try {
        if (await Bun.file(tempPath).exists()) {
          await unlink(tempPath);
        }
      } catch {
        // best-effort cleanup; ignore deletion errors
      }
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
