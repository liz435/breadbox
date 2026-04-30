import type {
  AnimationCurve,
  FrameTransformEdit,
  KeyframePose,
  SpringCurve,
} from "@dreamer/schemas";

const CURVE_DESCRIPTIONS: Record<AnimationCurve, string> = {
  linear: "",
  easeIn: "Motion pacing: start slow and controlled, then gradually build speed toward the peak.",
  easeOut: "Motion pacing: begin at full speed and ease into a smooth, gradual deceleration.",
  easeInOut: "Motion pacing: ease in gently, reach peak speed in the middle, ease out smoothly.",
  sharp: "Motion pacing: brief setup, then an explosive snap of maximum speed, then settle.",
};

function describeSpringCurve(tension: number, bounce: number): string {
  if (tension < 0.3 && bounce < 0.2) return "Motion pacing: ease in gently, reach peak speed in the middle, ease out smoothly.";
  if (tension > 0.7 && bounce < 0.2) return "Motion pacing: move at a steady, even pace throughout.";
  if (tension < 0.3 && bounce > 0.6) return "Motion pacing: ease in, overshoot the endpoint with a bouncy spring, then settle.";
  if (tension > 0.7 && bounce > 0.6) return "Motion pacing: snap quickly to the target then spring back with a sharp oscillation before settling.";
  if (bounce > 0.4) return "Motion pacing: move toward the endpoint with a spring that slightly overshoots then settles.";
  if (tension > 0.5) return "Motion pacing: start slow and controlled, then accelerate sharply toward the endpoint.";
  return "Motion pacing: smooth, fluid movement from start to endpoint.";
}

export function compileMotionPrompt(input: {
  userPrompt: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  generationDurationSeconds?: number;
  frameEdit?: FrameTransformEdit;
  sourceFrame?: KeyframePose;
  targetFrame?: KeyframePose;
  animationCurve?: AnimationCurve;
  springCurve?: SpringCurve;
  subjectDescription?: string;
}): string {
  const editSummary = input.frameEdit
    ? compileFrameEditSummary(input.frameEdit, input.sourceFrame, input.targetFrame)
    : "No target-frame transform was provided.";
  const sourceTime = input.sourceFrame?.timeSeconds ?? input.startTimeSeconds;
  const targetTime = input.targetFrame?.timeSeconds ?? input.endTimeSeconds;
  const promptText =
    input.userPrompt.trim() ||
    "Create a smooth, physically grounded movement from the original start frame to the edited target frame.";
  const subject = input.subjectDescription?.trim();
  const baseInstruction = subject ? `Subject: ${subject}\n${promptText}` : promptText;
  const curveDescription = input.springCurve
    ? describeSpringCurve(input.springCurve.tension, input.springCurve.bounce)
    : input.animationCurve
      ? CURVE_DESCRIPTIONS[input.animationCurve]
      : "";
  const temporalGuidance = compileTemporalGuidance({
    sourceTime,
    targetTime,
    generationDurationSeconds: input.generationDurationSeconds,
  });
  const motionInstructionBlock = curveDescription
    ? [baseInstruction, temporalGuidance, curveDescription].filter(Boolean).join("\n")
    : [baseInstruction, temporalGuidance].filter(Boolean).join("\n");
  return `Regenerate the selected motion segment from ${input.startTimeSeconds.toFixed(2)}s to ${input.endTimeSeconds.toFixed(2)}s.

Use the selected source frame at ${sourceTime.toFixed(2)}s as the start guidance and the edited target frame based on ${targetTime.toFixed(2)}s as the intended visual endpoint.

Preserve the original subject identity, clothing, camera angle, lighting, environment, and overall composition. Keep the camera stable unless the user's instruction explicitly asks for camera movement.

Motion instruction:
${motionInstructionBlock}

Target-frame edit:
${editSummary}

Important constraints:
- animate the subject toward the edited target-frame position
- preserve continuity with the first frame
- avoid floating, sliding, or detached body parts
- keep background and lighting stable
- treat the edited target frame as visual endpoint guidance, not as a new subject`;
}

function compileTemporalGuidance(input: {
  sourceTime: number;
  targetTime: number;
  generationDurationSeconds?: number;
}): string {
  if (!input.generationDurationSeconds) return "";
  const sourceToTargetDuration = Math.abs(input.targetTime - input.sourceTime);
  if (sourceToTargetDuration <= 0.05) return "";

  const generationDuration = input.generationDurationSeconds;
  const speedRatio = generationDuration / sourceToTargetDuration;
  if (speedRatio <= 1.2) return "";

  return [
    `Temporal guidance: the source-to-target action spans about ${sourceToTargetDuration.toFixed(2)}s in the original clip, but this generated clip lasts ${generationDuration.toFixed(2)}s.`,
    `Expand that same action across the full ${generationDuration.toFixed(2)}s as slow-motion / timing-expanded movement, about ${speedRatio.toFixed(1)}x slower than the original action.`,
    "Do not complete the action at normal speed and fill the remaining time with idle movement or unrelated motion.",
  ].join("\n");
}

function compileFrameEditSummary(
  edit: FrameTransformEdit,
  sourceFrame: KeyframePose | undefined,
  targetFrame: KeyframePose | undefined,
): string {
  return [
    `- source frame: ${sourceFrame ? `${sourceFrame.timeSeconds.toFixed(2)}s` : edit.sourceFrameId}`,
    `- target frame: ${targetFrame ? `${targetFrame.timeSeconds.toFixed(2)}s` : edit.targetFrameId}`,
    `- selected region: x=${edit.subjectBox.x.toFixed(3)}, y=${edit.subjectBox.y.toFixed(3)}, width=${edit.subjectBox.width.toFixed(3)}, height=${edit.subjectBox.height.toFixed(3)}`,
    `- endpoint move: translateX=${edit.transform.translateX.toFixed(3)}, translateY=${edit.transform.translateY.toFixed(3)}`,
    `- endpoint scale: ${edit.transform.scale.toFixed(2)}`,
    `- endpoint rotation: ${edit.transform.rotateDeg.toFixed(1)} degrees`,
  ].join("\n");
}
