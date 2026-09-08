// ── Scene post-processing ────────────────────────────────────────────────────
//
// A light grade over the whole 3D scene so it reads as a lit product shot
// rather than a flat CAD viewport. Renders on the demand frameloop like
// everything else — the composer draws on each frame r3f already schedules.

import {
  EffectComposer,
  N8AO,
  HueSaturation,
  BrightnessContrast,
  SMAA,
} from "@react-three/postprocessing"

export function PostEffects() {
  return (
    <EffectComposer multisampling={0}>
      {/* Contact shading: darkens the crevices where parts meet the board.
          No normal pass — N8AO reconstructs normals from depth, which skips a
          full extra geometry render each frame (cheaper in WKWebView) and looks
          all but identical at halfRes. `performance` quality trims the AO
          sample count, the priciest part of the effect. */}
      <N8AO quality="performance" aoRadius={10} distanceFalloff={5} intensity={3} halfRes />
      {/* Take the wash out — richer colour, a touch more contrast. */}
      <HueSaturation saturation={0.18} />
      <BrightnessContrast brightness={-0.02} contrast={0.12} />
      <SMAA />
    </EffectComposer>
  )
}
