import type { FrameTransformEdit, MotionSegment } from "@dreamer/schemas";

export function compileMotionPromptPreview(segment: MotionSegment | null, userPrompt: string): string {
  if (!segment) return "";
  const sourceFrame = segment.frameEdit
    ? segment.keyframes.find((frame) => frame.id === segment.frameEdit?.sourceFrameId)
    : null;
  const targetFrame = segment.frameEdit
    ? segment.keyframes.find((frame) => frame.id === segment.frameEdit?.targetFrameId)
    : null;
  const sourceTime = sourceFrame?.timeSeconds ?? segment.startTimeSeconds;
  const targetTime = targetFrame?.timeSeconds ?? segment.endTimeSeconds;
  return `Regenerate the selected motion segment from ${segment.startTimeSeconds.toFixed(2)}s to ${segment.endTimeSeconds.toFixed(2)}s.

Use the selected source frame at ${sourceTime.toFixed(2)}s as the start guidance and the edited target frame based on ${targetTime.toFixed(2)}s as the intended visual endpoint.

Preserve the original subject identity, clothing, camera angle, lighting, environment, and overall composition.

Motion instruction:
${userPrompt.trim() || "Create a smooth, physically grounded movement from the original start frame to the edited target frame."}

Target-frame edit:
${segment.frameEdit ? formatFrameEdit(segment.frameEdit, sourceFrame ?? undefined, targetFrame ?? undefined) : "Render an edited target frame before generation."}

Important constraints:
- animate the subject toward the edited target-frame position
- preserve continuity with the first frame
- avoid floating, sliding, or detached body parts
- keep background and lighting stable`;
}

function formatFrameEdit(
  edit: FrameTransformEdit,
  sourceFrame: MotionSegment["keyframes"][number] | undefined,
  targetFrame: MotionSegment["keyframes"][number] | undefined,
): string {
  return [
    `- source frame: ${sourceFrame ? `${sourceFrame.timeSeconds.toFixed(2)}s` : edit.sourceFrameId}`,
    `- target frame: ${targetFrame ? `${targetFrame.timeSeconds.toFixed(2)}s` : edit.targetFrameId}`,
    `- selected region: x=${edit.subjectBox.x.toFixed(3)}, y=${edit.subjectBox.y.toFixed(3)}, width=${edit.subjectBox.width.toFixed(3)}, height=${edit.subjectBox.height.toFixed(3)}`,
    `- endpoint move: translateX=${edit.transform.translateX.toFixed(3)}, translateY=${edit.transform.translateY.toFixed(3)}`,
    `- endpoint scale: ${edit.transform.scale.toFixed(2)}`,
    `- endpoint rotation: ${edit.transform.rotateDeg.toFixed(1)} degrees`,
    `- rendered target frame: ${edit.renderedFrameUrl ? "ready" : "not rendered yet"}`,
  ].join("\n");
}
