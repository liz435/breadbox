import { useCallback, useMemo, useRef } from "react";
import { extend, useApplication, useTick } from "@pixi/react";
import {
  Container,
  Graphics,
  Sprite as PixiSprite,
  Texture,
  Rectangle,
  Circle,
} from "pixi.js";
import type {
  FederatedPointerEvent,
  Container as ContainerType,
  Graphics as GraphicsType,
  Sprite as PixiSpriteType,
} from "pixi.js";

import { useScene } from "@/store/scene-context";
import { computeHandles, ROTATE_HANDLE_OFFSET } from "@/canvas/gizmo";
import { interactionActor } from "@/interaction/interaction-machine";
import { getCamera, worldToScreen, screenToWorld, isSpaceHeld } from "@/canvas/camera";
import {
  onSpritePointerDown,
  onHandlePointerDown,
  onStagePointerDown,
  onStagePointerMove,
  onStagePointerUp,
} from "@/interaction/handlers";
import type { HandleId, Sprite } from "@/types";
import { TILE_TYPES, TILE_FALLBACK_COLOR } from "@/types";

extend({ Container, Graphics, Sprite: PixiSprite });

const HANDLE_SIZE = 8;
const HANDLE_HIT_RADIUS = 12;

const HANDLE_CURSORS: Record<HandleId, string> = {
  tl: "nwse-resize",
  tr: "nesw-resize",
  bl: "nesw-resize",
  br: "nwse-resize",
  t: "ns-resize",
  b: "ns-resize",
  l: "ew-resize",
  r: "ew-resize",
  rotate: "crosshair",
};

const ALL_HANDLE_IDS: HandleId[] = ["tl", "tr", "bl", "br", "t", "r", "b", "l", "rotate"];

export function PixiScene() {
  const { state, send } = useScene();
  const stateRef = useRef(state);
  stateRef.current = state;
  const { app } = useApplication();

  // Refs for imperative updates
  const worldRef = useRef<ContainerType>(null);
  const spriteRefs = useRef(new Map<string, PixiSpriteType>());
  const bbContainerRef = useRef<ContainerType>(null);
  const bbGfxRef = useRef<GraphicsType>(null);
  const handleContainerRefs = useRef(new Map<string, ContainerType>());

  // Texture cache
  const textureCache = useRef(new WeakMap<HTMLImageElement, Texture>());
  function getTexture(image: HTMLImageElement): Texture {
    let tex = textureCache.current.get(image);
    if (!tex) {
      tex = Texture.from(image);
      tex.source.scaleMode = "linear";
      textureCache.current.set(image, tex);
    }
    return tex;
  }

  // Cache the last pointer event for useTick-driven direct updates
  const lastPointerEvent = useRef<FederatedPointerEvent | null>(null);

  // ── useTick: all imperative updates in one place ──
  useTick(() => {
    const cam = getCamera();
    const st = stateRef.current;

    // 1. World container transform
    const world = worldRef.current;
    if (world) {
      world.position.set(cam.offsetX, cam.offsetY);
      world.scale.set(cam.zoom);
    }

    // 2. Direct Pixi sprite update during active gestures (bypasses React for immediate feedback)
    const snap = interactionActor.getSnapshot();
    const mode = snap.value as string;
    const ictx = snap.context;
    const lastEvt = lastPointerEvent.current;

    if (lastEvt && ictx.spriteId) {
      const pixiSprite = spriteRefs.current.get(ictx.spriteId);
      if (pixiSprite) {
        const w = screenToWorld(lastEvt.global.x, lastEvt.global.y);
        if (mode === "dragging") {
          pixiSprite.x = w.x - ictx.offsetX;
          pixiSprite.y = w.y - ictx.offsetY;
        } else if (mode === "rotating" && ictx.pivot) {
          const angle = Math.atan2(w.y - ictx.pivot.y, w.x - ictx.pivot.x);
          pixiSprite.rotation = ictx.initialRotation + (angle - ictx.startAngle);
        }
      }
    }

    // 3. Gizmo overlay (screen space — always pixel-perfect)
    const sel = st.selectedId
      ? st.sprites.find((s) => s.id === st.selectedId)
      : null;

    const bbContainer = bbContainerRef.current;
    const bbGfx = bbGfxRef.current;

    if (sel && bbContainer && bbGfx) {
      // Use the Pixi sprite's live position (may be ahead of React state during drag)
      const livePixi = spriteRefs.current.get(sel.id);
      const liveX = livePixi ? livePixi.x : sel.x;
      const liveY = livePixi ? livePixi.y : sel.y;
      const liveRot = livePixi ? livePixi.rotation : sel.rotation;

      const screenCenter = worldToScreen(liveX, liveY);
      bbContainer.position.set(screenCenter.x, screenCenter.y);
      bbContainer.rotation = liveRot;
      bbContainer.visible = true;

      // Bounding box in screen pixels
      const hw = (sel.width * Math.abs(sel.scaleX)) / 2 * cam.zoom;
      const hh = (sel.height * Math.abs(sel.scaleY)) / 2 * cam.zoom;
      const rotOffset = ROTATE_HANDLE_OFFSET;

      bbGfx.clear();
      bbGfx.rect(-hw, -hh, hw * 2, hh * 2);
      bbGfx.stroke({ color: 0x4a9eff, width: 2 });
      bbGfx.moveTo(0, -hh);
      bbGfx.lineTo(0, -hh - rotOffset);
      bbGfx.stroke({ color: 0x4a9eff, width: 1.5 });

      // Resize handle scale if needed
      if (livePixi && mode === "resizing" && ictx.spriteId === sel.id && ictx.initialSprite) {
        // During resize, read scale from Pixi sprite
        const tex = textureCache.current.get(sel.image);
        if (tex) {
          const texW = tex.width || 1;
          const texH = tex.height || 1;
          const pixiScaleX = livePixi.scale.x;
          const pixiScaleY = livePixi.scale.y;
          const effectiveScaleX = (pixiScaleX * texW) / sel.width;
          const effectiveScaleY = (pixiScaleY * texH) / sel.height;
          const liveHW = (sel.width * Math.abs(effectiveScaleX)) / 2 * cam.zoom;
          const liveHH = (sel.height * Math.abs(effectiveScaleY)) / 2 * cam.zoom;
          bbGfx.clear();
          bbGfx.rect(-liveHW, -liveHH, liveHW * 2, liveHH * 2);
          bbGfx.stroke({ color: 0x4a9eff, width: 2 });
          bbGfx.moveTo(0, -liveHH);
          bbGfx.lineTo(0, -liveHH - rotOffset);
          bbGfx.stroke({ color: 0x4a9eff, width: 1.5 });
        }
      }

      // 4. Handle positions in screen space
      // Compute from live sprite position
      const liveSel: Sprite = {
        ...sel,
        x: liveX,
        y: liveY,
        rotation: liveRot,
      };
      const handles = computeHandles(liveSel);

      for (const handle of handles) {
        const ref = handleContainerRefs.current.get(handle.id);
        if (ref) {
          const sp = worldToScreen(handle.x, handle.y);
          ref.position.set(sp.x, sp.y);
          ref.visible = true;
        }
      }
    } else {
      if (bbContainer) bbContainer.visible = false;
      for (const ref of handleContainerRefs.current.values()) {
        if (ref) ref.visible = false;
      }
    }
  });

  // ── Hit areas ──
  const stageHitArea = useMemo(() => new Rectangle(0, 0, 10000, 10000), []);
  const resizeHandleHitArea = useMemo(
    () => new Rectangle(-HANDLE_HIT_RADIUS, -HANDLE_HIT_RADIUS, HANDLE_HIT_RADIUS * 2, HANDLE_HIT_RADIUS * 2),
    []
  );
  const rotateHandleHitArea = useMemo(() => new Circle(0, 0, HANDLE_HIT_RADIUS), []);

  // ── Draw callbacks (stable — drawn once) ──
  const drawTilemap = useCallback(
    (g: Graphics) => {
      g.clear();
      const tilemap = state.tilemap;
      if (!tilemap) return;

      const colorMap = new Map(TILE_TYPES.map((t) => [t.id, t.color]));

      for (let r = 0; r < tilemap.height; r++) {
        for (let c = 0; c < tilemap.width; c++) {
          const tileId = tilemap.tiles[r][c];
          const color = colorMap.get(tileId) ?? TILE_FALLBACK_COLOR;
          g.rect(c * tilemap.tileSize, r * tilemap.tileSize, tilemap.tileSize, tilemap.tileSize);
          g.fill(color);
        }
      }

      for (let r = 0; r <= tilemap.height; r++) {
        const y = r * tilemap.tileSize;
        g.moveTo(0, y);
        g.lineTo(tilemap.width * tilemap.tileSize, y);
      }
      for (let c = 0; c <= tilemap.width; c++) {
        const x = c * tilemap.tileSize;
        g.moveTo(x, 0);
        g.lineTo(x, tilemap.height * tilemap.tileSize);
      }
      g.stroke({ color: 0x000000, alpha: 0.15, width: 1 });
    },
    [state.tilemap]
  );

  const drawResizeHandle = useCallback((g: Graphics) => {
    g.clear();
    g.rect(-HANDLE_SIZE / 2, -HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    g.fill(0xffffff);
    g.rect(-HANDLE_SIZE / 2, -HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    g.stroke({ color: 0x4a9eff, width: 2 });
  }, []);

  const drawRotateHandle = useCallback((g: Graphics) => {
    g.clear();
    g.circle(0, 0, HANDLE_SIZE);
    g.fill(0x4a9eff);
    g.circle(0, 0, HANDLE_SIZE);
    g.stroke({ color: 0xffffff, width: 2 });
  }, []);

  // ── Event handlers ──
  const handleStagePointerDown = useCallback(
    (e: FederatedPointerEvent) => {
      onStagePointerDown(e, stateRef.current, send);
    },
    [send]
  );

  const handleStagePointerMove = useCallback(
    (e: FederatedPointerEvent) => {
      // Cache pointer event for useTick direct updates
      lastPointerEvent.current = e;

      onStagePointerMove(e, stateRef.current, send);

      // Cursor
      const snapshot = interactionActor.getSnapshot();
      const mode = snapshot.value as string;
      if (app.canvas instanceof HTMLCanvasElement) {
        switch (mode) {
          case "dragging":
            app.canvas.style.cursor = "grabbing";
            break;
          case "rotating":
          case "painting":
            app.canvas.style.cursor = "crosshair";
            break;
          case "resizing":
            app.canvas.style.cursor = "nwse-resize";
            break;
          case "panning":
            app.canvas.style.cursor = "grabbing";
            break;
          default:
            app.canvas.style.cursor = isSpaceHeld() ? "grab" : "";
            break;
        }
      }
    },
    [send, app]
  );

  const handleStagePointerUp = useCallback(() => {
    lastPointerEvent.current = null;
    onStagePointerUp();
    if (app.canvas instanceof HTMLCanvasElement) {
      app.canvas.style.cursor = isSpaceHeld() ? "grab" : "";
    }
  }, [app]);

  // ── Render ──
  return (
    <pixiContainer
      eventMode="static"
      hitArea={stageHitArea}
      cursor="default"
      onPointerDown={handleStagePointerDown}
      onGlobalPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerUpOutside={handleStagePointerUp}
    >
      {/* World container — camera transform applied in useTick */}
      <pixiContainer ref={worldRef}>
        {state.tilemap && <pixiGraphics draw={drawTilemap} />}

        {state.sprites.map((s) => {
          const texture = getTexture(s.image);
          const texW = texture.width || 1;
          const texH = texture.height || 1;
          return (
            <pixiSprite
              key={s.id}
              ref={(el: PixiSpriteType | null) => {
                if (el) spriteRefs.current.set(s.id, el);
                else spriteRefs.current.delete(s.id);
              }}
              texture={texture}
              x={s.x}
              y={s.y}
              rotation={s.rotation}
              anchor={0.5}
              scale={{ x: (s.width * s.scaleX) / texW, y: (s.height * s.scaleY) / texH }}
              eventMode="static"
              cursor="grab"
              onPointerDown={(e: FederatedPointerEvent) => {
                onSpritePointerDown(s, e, send);
              }}
            />
          );
        })}
      </pixiContainer>

      {/* Gizmo overlay — screen space, always pixel-perfect */}
      <pixiContainer ref={bbContainerRef}>
        <pixiGraphics ref={bbGfxRef} draw={() => {}} />
      </pixiContainer>

      {/* Handles — screen space, positioned in useTick */}
      {ALL_HANDLE_IDS.map((id) => (
        <pixiContainer
          key={id}
          ref={(el: ContainerType | null) => {
            if (el) handleContainerRefs.current.set(id, el);
            else handleContainerRefs.current.delete(id);
          }}
        >
          <pixiGraphics
            draw={id === "rotate" ? drawRotateHandle : drawResizeHandle}
            eventMode="static"
            hitArea={id === "rotate" ? rotateHandleHitArea : resizeHandleHitArea}
            cursor={HANDLE_CURSORS[id]}
            onPointerDown={(e: FederatedPointerEvent) => {
              const sel = stateRef.current.selectedId
                ? stateRef.current.sprites.find((s) => s.id === stateRef.current.selectedId)
                : null;
              if (sel) onHandlePointerDown(sel, id, e, send);
            }}
          />
        </pixiContainer>
      ))}
    </pixiContainer>
  );
}
