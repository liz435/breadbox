// ── Scene post-processing ────────────────────────────────────────────────────
//
// A light grade over the whole 3D scene so it reads as a lit product shot
// rather than a flat CAD viewport: ambient occlusion sinks the parts into the
// board, bloom lets lit LEDs actually glow, and a small saturation/contrast
// lift takes the paleness off. Renders on the demand frameloop like everything
// else — the composer draws on each frame r3f already schedules.

import {
  EffectComposer,
  N8AO,
  Bloom,
  HueSaturation,
  BrightnessContrast,
  Vignette,
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
      {/* Only emissive material (LEDs > 1.0) crosses the threshold and blooms. */}
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.3} intensity={0.7} mipmapBlur />
      {/* Take the wash out — richer colour, a touch more contrast. */}
      <HueSaturation saturation={0.18} />
      <BrightnessContrast brightness={-0.02} contrast={0.12} />
      <Vignette darkness={0.42} offset={0.32} />
      <SMAA />
    </EffectComposer>
  )
}
