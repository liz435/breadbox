import type { BodyKeypoint, BodyKeypointName, KeyframePose } from "@dreamer/schemas";

export const bodyKeypointNames: BodyKeypointName[] = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
];

const defaultPose: Record<BodyKeypointName, { x: number; y: number }> = {
  nose: { x: 0.5, y: 0.18 },
  left_eye: { x: 0.47, y: 0.16 },
  right_eye: { x: 0.53, y: 0.16 },
  left_ear: { x: 0.43, y: 0.18 },
  right_ear: { x: 0.57, y: 0.18 },
  left_shoulder: { x: 0.39, y: 0.32 },
  right_shoulder: { x: 0.61, y: 0.32 },
  left_elbow: { x: 0.32, y: 0.48 },
  right_elbow: { x: 0.68, y: 0.48 },
  left_wrist: { x: 0.28, y: 0.64 },
  right_wrist: { x: 0.72, y: 0.64 },
  left_hip: { x: 0.43, y: 0.58 },
  right_hip: { x: 0.57, y: 0.58 },
  left_knee: { x: 0.39, y: 0.77 },
  right_knee: { x: 0.61, y: 0.77 },
  left_ankle: { x: 0.36, y: 0.93 },
  right_ankle: { x: 0.64, y: 0.93 },
};

export function createDefaultBodyKeypoints(): BodyKeypoint[] {
  return bodyKeypointNames.map((name) => ({
    name,
    x: defaultPose[name].x,
    y: defaultPose[name].y,
    confidence: 0.5,
    visible: true,
  }));
}

export const poseSummaryKeypoints: BodyKeypointName[] = [
  "left_wrist",
  "right_wrist",
  "left_elbow",
  "right_elbow",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
];

export function getKeypoint(frame: KeyframePose, name: BodyKeypointName): BodyKeypoint | undefined {
  return frame.keypoints.find((point) => point.name === name);
}
