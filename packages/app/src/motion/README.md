# Motion Editor Implementation

This folder contains Dreamer's motion editor frontend. It is served inside the main Dreamer app at:

```text
/motion
```

The Dreamer IDE remains at `/editor`. The motion editor is an adjacent product surface using the same Vite frontend, Bun/Elysia API, auth-aware fetch conventions, Dockerfile, and Railway deployment path.

## Current Product Shape

The editor has pivoted away from skeleton/keypoint editing as the primary workflow. The active MVP now uses frame-to-frame endpoint guidance:

1. Upload a source video.
2. Drag the S/T handles on the timeline to select a source-to-target motion range.
3. The API clips the segment and extracts start, middle, and end frames.
4. The S/T range is capped at 4 seconds to control Veo cost and keep clips tight.
5. Drag a blue source box around the subject/body region in the selected source frame.
6. Drag the orange endpoint box in the selected target frame, with optional scale/rotation.
7. Render an edited target frame locally with `ffmpeg`.
8. Generate a new motion segment with Veo or the mock provider.

This gives Veo a clearer start/end-frame story than raw coordinate keypoints. The old 17-point body keypoint editor code still exists as groundwork, but it is not the main UI path.

## Frontend Files

```text
packages/app/src/motion/
  README.md
  motion-editor-page.tsx
  api-client.ts
  use-motion-editor-state.ts
  prompt-compiler.ts
  components/
    MotionEditorShell.tsx
    VideoUploader.tsx
    VideoPreview.tsx
    TimelineStrip.tsx
    KeyframeStrip.tsx
    FrameTransformEditor.tsx
    MotionPromptPanel.tsx
    CompiledPromptPreview.tsx
    GenerationResultPanel.tsx
    KeypointEditor.tsx
```

`KeyframeStrip.tsx` owns timestamp-based source/target frame extraction. It can add custom frames inside the selected segment and assign them as source or target guidance frames.

`FrameTransformEditor.tsx` is the pivoted editor surface. It owns the drag UI for the selected source region and desired endpoint transform.

`use-motion-editor-state.ts` owns project state, selected segment/keyframe, frame edit state, prompt text, provider choice, rendered target frame state, generation job polling, and API actions.

`prompt-compiler.ts` mirrors the backend prompt shape so the user can preview what will be sent before generation.

## Backend Files

```text
packages/api/src/routes/motion.ts
packages/api/src/motion/
  motion-repo.ts
  video-utils.ts
  prompt-compiler.ts
  body-keypoints.ts
  providers/
    types.ts
    mock-provider.ts
    veo-provider.ts
    index.ts
```

Shared motion schemas live in:

```text
packages/schemas/src/motion.ts
```

The route is mounted from `packages/api/src/index.ts`, and `/motion` is mounted from `packages/app/src/app.tsx`.

## Implemented API Surface

```text
POST  /api/motion/projects
POST  /api/motion/projects/:projectId/segments
POST  /api/motion/segments/:segmentId/keyframes
PATCH /api/motion/segments/:segmentId/keyframes/:keyframeId
PATCH /api/motion/frame-edits/:editId
POST  /api/motion/frame-edits/:editId/render-target-frame
POST  /api/motion/segments/:segmentId/generate
GET   /api/motion/jobs/:jobId
GET   /api/motion/artifacts/:projectId/:filename
```

The keypoint patch route remains for compatibility, but timestamp frame extraction and frame-edit routes are the current primary path.

## Frame Transform Model

Each new segment gets a `frameEdit`:

```ts
type FrameTransformEdit = {
  id: string;
  segmentId: string;
  sourceFrameId: string;
  targetFrameId: string;
  subjectBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  transform: {
    translateX: number;
    translateY: number;
    scale: number;
    rotateDeg: number;
  };
  renderedFrameUrl?: string;
  createdAt: string;
  updatedAt: string;
};
```

Coordinates are normalized image positions from `0` to `1`. The blue box is the selected source region in `sourceFrameId`. The orange box is the desired endpoint position in `targetFrameId`, derived from `subjectBox + transform`.

## Flexible Guidance Frames

The user can now set exact guidance frame times inside the selected segment:

```text
Source frame time: 4.20
Target frame time: 4.50
```

Calling `Set` extracts that exact frame from the original source video using `ffmpeg`. If a frame already exists at the same timestamp, such as the default middle frame, the API reuses it instead of creating a duplicate.

The render step crops the blue source region from the source frame and overlays the transformed crop on top of the target frame. That rendered target frame becomes the `lastFrame` guidance image for Veo 3.1 models.

## Generation Flow

```text
upload video
  -> create motion project
  -> create segment
  -> ffmpeg clips segment
  -> ffmpeg extracts start/middle/end frames
  -> optional exact source/target frame extraction
  -> user edits source region and endpoint transform
  -> ffmpeg renders edited target frame
  -> prompt compiler describes the requested motion
  -> provider starts generation job
  -> UI polls job
  -> generated mp4 is stored as a local artifact
  -> generated mp4 is retimed to the selected S/T interval
  -> retimed insert is stitched back into the original source video
```

The local target-frame render duplicates/transforms the selected source region over the target frame. It does not remove or inpaint the original subject position yet, so the rendered image is guidance, not a polished final composite.

## Veo Configuration

Set these on the API server:

```text
GEMINI_API_KEY=...
VEO_MODEL=veo-3.1-lite-generate-preview
VEO_RESOLUTION=720p
```

Optional:

```text
GOOGLE_API_KEY=...
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
FFMPEG_PATH=/usr/bin/ffmpeg
VEO_ALLOW_TEXT_ONLY_FALLBACK=1
VEO_GUIDANCE_MODE=first-frame
VEO_IMAGE_PAYLOAD_FORMAT=bytesBase64Encoded
```

`GEMINI_API_KEY` and `GOOGLE_API_KEY` are interchangeable; the code checks `GEMINI_API_KEY` first. The provider chooses `personGeneration` automatically: `allow_all` for text-to-video fallback and `allow_adult` for image-guided requests.

Use `veo-3.1-lite-generate-preview` while developing to keep iteration costs low. Switch to `veo-3.1-generate-preview` only for higher-quality final attempts.

`VEO_IMAGE_PAYLOAD_FORMAT` is an escape hatch for Google preview request-shape changes. Supported values are `inlineData`, `imageBytes`, and `bytesBase64Encoded`. The provider defaults to `bytesBase64Encoded` for `veo-3.1-lite-generate-preview` because Lite can reject the public REST `inlineData` shape, and defaults to `inlineData` for the other Veo models.

`VEO_GUIDANCE_MODE` controls which visual inputs are sent. Supported values are `auto`, `first-last`, `first-frame`, and `text-only`. The default is `first-frame` for `veo-3.1-lite-generate-preview` because some Lite/API-key combinations reject first-frame plus last-frame interpolation as an unsupported use case. The default is `first-last` for non-Lite Veo 3.1 models.

Text-only fallback is off by default because the motion editor needs source/target frame guidance. If Veo rejects image-guided generation, the provider fails instead of spending money on an unrelated prompt-only clip. Set `VEO_ALLOW_TEXT_ONLY_FALLBACK=1` only when you deliberately want prompt-only Veo output.

## Storage

Motion data uses Dreamer's existing data-home pattern in `packages/api/src/paths.ts`.

In local source mode, files are written under:

```text
packages/api/data/
  motion-projects/
  motion-artifacts/
  motion-jobs/
```

In hosted/Railway mode, they resolve under `DREAMER_HOME`, usually:

```text
/data/
  motion-projects/
  motion-artifacts/
  motion-jobs/
```

Attach a persistent Railway volume to `/data` if uploaded videos and generated artifacts should survive redeploys.

## Railway Notes

Serve this as part of the existing Dreamer deployment:

```text
https://app.cyx.solutions/motion
```

The Dockerfile installs `ffmpeg` because `/motion` needs it for segment clipping, keyframe extraction, and target-frame rendering.

## Known Limitations

- The edited target frame is a fast `ffmpeg` composite, not a semantic inpaint.
- True first+last-frame guidance requires a Veo 3.1 model.
- Exact guidance frames must be inside the selected segment.
- No automatic subject detection yet; the user manually places the source box.
- No full-video stitching/export yet.
- No cloud object storage yet; artifacts are local to `DREAMER_HOME`.
- Veo can reject generations because of safety settings, people generation policy, model access, quota, or prompt constraints.
- Veo duration is normalized to 4, 6, or 8 seconds.
- API typecheck may still be blocked by unrelated existing board test fixtures missing `libraryState.neopixels`.

## Verification Used

The implementation has been checked with:

```text
bun run --cwd packages/schemas typecheck
bun run --cwd packages/app typecheck
bun run --cwd packages/app build
```

The frame pipeline was also smoke-tested with a synthetic mp4:

```text
project creation -> segment clipping -> keyframe extraction -> exact 4.20s/4.50s guidance frames -> rendered target frame
```

`packages/api` typecheck currently reaches unrelated existing board fixture errors before completion.

## Good Next Steps

1. Add a mask/inpaint path so the source subject is removed before the transformed endpoint overlay.
2. Add automatic subject box detection for the first selected frame.
3. Add generated segment stitching with `ffmpeg`.
4. Store artifacts in R2 or S3 for durable hosted storage.
5. Add focused route tests for upload, segment creation, frame-edit rendering, mock generation, and Veo job polling.
