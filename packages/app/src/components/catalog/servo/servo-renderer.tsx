import React, { useEffect, useRef } from "react";
import type { BoardComponent, PinState, LibraryState } from "@dreamer/schemas";
import { gridToPixel } from "@/breadboard/breadboard-grid";
import { LABEL_FONT_SIZE, PX_PER_MM } from "@/breadboard/breadboard-constants";
import { useBoardSelector } from "@/store/board-context";
import { PinLabel } from "@/breadboard/component-renderers/pin-label";

type ServoRendererProps = {
  component: BoardComponent;
  pinStates: PinState[];
  isSelected: boolean;
  libraryState?: LibraryState;
};

/**
 * Slews the servo horn toward its commanded angle instead of snapping there.
 *
 * A real hobby servo can't teleport — it drives the output shaft at a bounded
 * speed (~0.1–0.2 s per 60°), so a `write(180)` after `write(0)` takes the better
 * part of a second to arrive. We model that by easing a *displayed* angle toward
 * the commanded *target* every animation frame, capped at a max angular speed,
 * and writing the rotation straight to the DOM so we don't re-render React 60×/s.
 *
 * The horn group is authored pointing right (= 90°, the servo centre); the
 * transform rotates it about the shaft so 0° points up and 180° points down.
 */
function useServoSlew(targetAngle: number, pivotX: number, pivotY: number) {
  const hornRef = useRef<SVGGElement>(null);
  const displayed = useRef(targetAngle);
  // Latest target + pivot live in refs so the rAF loop never has to restart
  // (restarting on every render would reset dt and stall a sweep sketch).
  const target = useRef(targetAngle);
  const pivot = useRef({ x: pivotX, y: pivotY });
  target.current = targetAngle;
  pivot.current = { x: pivotX, y: pivotY };

  useEffect(() => {
    const MAX_DEG_PER_S = 320; // ~0.19 s per 60° — typical hobby-servo slew
    const EASE = 9; // soft settle as it nears the target
    const write = () =>
      hornRef.current?.setAttribute(
        "transform",
        `rotate(${(displayed.current - 90).toFixed(2)} ${pivot.current.x} ${pivot.current.y})`,
      );
    write(); // seed the correct angle on mount (no opening sweep)

    let raf = 0;
    let last: number | null = null;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (last == null) {
        last = t;
        return;
      }
      const dt = Math.min(0.05, (t - last) / 1000); // clamp after a hidden tab
      last = t;
      const diff = target.current - displayed.current;
      if (Math.abs(diff) < 0.1) {
        displayed.current = target.current;
      } else {
        const maxStep = MAX_DEG_PER_S * dt;
        let step = diff * Math.min(1, dt * EASE); // exponential approach
        if (Math.abs(step) > maxStep) step = Math.sign(diff) * maxStep; // speed cap
        displayed.current += step;
      }
      write();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return hornRef;
}

function ServoRendererInner({ component, isSelected, libraryState }: ServoRendererProps) {
  const wires = useBoardSelector((s) => s.wires);

  // Find which Arduino pin connects to the servo's signal row via wire topology
  let connectedPin: number | null = component.pins.signal ?? null;
  if (connectedPin == null) {
    // Check wires: any Arduino pin wire (fromRow=-999) that lands on the signal row
    const signalRow = component.y;
    const signalCol = component.x;
    for (const w of Object.values(wires)) {
      if (w.fromRow === -999 && w.toRow === signalRow && w.toCol >= 0 && w.toCol <= 4 && signalCol >= 0 && signalCol <= 4) {
        connectedPin = w.fromCol;
        break;
      }
      if (w.fromRow === -999 && w.toRow === signalRow && w.toCol >= 5 && w.toCol <= 9 && signalCol >= 5 && signalCol <= 9) {
        connectedPin = w.fromCol;
        break;
      }
    }
  }

  let angle = (component.properties.angle as number) ?? 90;

  if (libraryState && connectedPin != null) {
    for (const entry of Object.values(libraryState.servos)) {
      if (entry.pin === connectedPin) {
        angle = entry.angle;
        break;
      }
    }
  }

  // The 3 footprint holes — these MUST match getComponentFootprint("servo", y, x)
  // Footprint: (y,x), (y+1,x), (y+2,x) — vertical
  const p0 = gridToPixel({ row: component.y, col: component.x });       // signal
  const p1 = gridToPixel({ row: component.y + 1, col: component.x });   // vcc
  const p2 = gridToPixel({ row: component.y + 2, col: component.x });   // gnd

  // ── SG90 micro-servo, drawn at true physical size (14px = 2.54mm pitch) ──
  const CASE_LEN = 22.8 * PX_PER_MM;           // case length — long axis, vertical along the pins
  const CASE_WID = 12.2 * PX_PER_MM;           // case width
  const EAR_LEN = 4.7 * PX_PER_MM;             // each mounting ear (extends the long axis to 32.2mm)
  const SHAFT_FROM_TOP = 6 * PX_PER_MM;        // output-shaft centre, down from the top of the case
  const GEAR_COVER_R = (11.8 / 2) * PX_PER_MM; // raised round gear-cover disc
  const HUB_R = (5.8 / 2) * PX_PER_MM;         // output hub / spline
  const HORN_LEN = 15 * PX_PER_MM;             // single-arm horn reach from the shaft centre
  const CABLE_RUN = 10 * PX_PER_MM;            // case→pin lead run — long enough to clear the horn sweep

  // Case sits to the LEFT of the pins; long axis centred on the middle (vcc) pin.
  const bodyR = p0.x - CABLE_RUN;
  const bodyL = bodyR - CASE_WID;
  const cx = bodyL + CASE_WID / 2;
  const caseT = p1.y - CASE_LEN / 2;
  const caseB = caseT + CASE_LEN;

  // Output shaft (gearbox hub) near the top end of the case.
  const shaftY = caseT + SHAFT_FROM_TOP;

  const hornRef = useServoSlew(angle, cx, shaftY);

  const bodyGradId = `servo-body-${component.id}`;
  const gearGradId = `servo-gear-${component.id}`;
  const hubGradId = `servo-hub-${component.id}`;

  return (
    <g>
      <defs>
        <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e6fd0" />
          <stop offset="45%" stopColor="#1565c0" />
          <stop offset="100%" stopColor="#0d47a1" />
        </linearGradient>
        <radialGradient id={gearGradId} cx="42%" cy="38%" r="72%">
          <stop offset="0%" stopColor="#3f8ae6" />
          <stop offset="100%" stopColor="#0d47a1" />
        </radialGradient>
        <radialGradient id={hubGradId} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#fafafa" />
          <stop offset="55%" stopColor="#d8d8d8" />
          <stop offset="100%" stopColor="#9e9e9e" />
        </radialGradient>
      </defs>

      {/* 3-wire servo lead exiting the case side toward the pin holes */}
      <line x1={bodyR} y1={p0.y} x2={p0.x} y2={p0.y} stroke="#ff9800" strokeWidth={2} />
      <line x1={bodyR} y1={p1.y} x2={p1.x} y2={p1.y} stroke="#f44336" strokeWidth={2} />
      <line x1={bodyR} y1={p2.y} x2={p2.x} y2={p2.y} stroke="#795548" strokeWidth={2} />

      {/* Pin dots — exactly on breadboard grid holes */}
      <circle cx={p0.x} cy={p0.y} r={2.5} fill="#ff9800" />
      <circle cx={p1.x} cy={p1.y} r={2.5} fill="#f44336" />
      <circle cx={p2.x} cy={p2.y} r={2.5} fill="#795548" />

      {/* Pin labels */}
      <PinLabel x={p0.x} y={p0.y} name="signal" side="right" />
      <PinLabel x={p1.x} y={p1.y} name="vcc" side="right" />
      <PinLabel x={p2.x} y={p2.y} name="gnd" side="right" />

      {/* Body drop shadow */}
      <rect x={bodyL + 1.5} y={caseT + 2} width={CASE_WID} height={CASE_LEN} rx={1 * PX_PER_MM} fill="#00000028" />

      {/* Mounting ears (screw tabs) extending each end of the long axis */}
      <g fill="#1d63b8" stroke="#0d47a1" strokeWidth={0.5}>
        <rect x={cx - CASE_WID / 2} y={caseT - EAR_LEN} width={CASE_WID} height={EAR_LEN + 4} rx={1.5} />
        <rect x={cx - CASE_WID / 2} y={caseB - 4} width={CASE_WID} height={EAR_LEN + 4} rx={1.5} />
      </g>
      <circle cx={cx} cy={caseT - EAR_LEN + 0.6 * PX_PER_MM} r={0.9 * PX_PER_MM} fill="#0a2f66" />
      <circle cx={cx} cy={caseB + EAR_LEN - 0.6 * PX_PER_MM} r={0.9 * PX_PER_MM} fill="#0a2f66" />

      {/* Case body */}
      <rect x={bodyL} y={caseT} width={CASE_WID} height={CASE_LEN} rx={1 * PX_PER_MM}
        fill={`url(#${bodyGradId})`} stroke={isSelected ? "#3b82f6" : "#0d47a1"}
        strokeWidth={isSelected ? 1.5 : 0.8} />
      {/* Top sheen + side shading */}
      <rect x={bodyL + 2} y={caseT + 2} width={CASE_WID - 4} height={2} rx={1} fill="#5aa0f2" opacity={0.45} />
      <rect x={bodyR - 4} y={caseT + 3} width={3} height={CASE_LEN - 6} rx={1.2} fill="#0a3576" opacity={0.35} />

      {/* SERVO label on the lower case (clear of the gear cover) */}
      <text x={cx} y={caseB - 3.5 * PX_PER_MM} textAnchor="middle" fontSize={2.2 * PX_PER_MM} fill="#bbdefb" fontFamily="monospace" fontWeight="bold">
        SERVO
      </text>

      {/* Raised gear-cover disc around the output shaft */}
      <circle cx={cx} cy={shaftY} r={GEAR_COVER_R} fill={`url(#${gearGradId})`} stroke="#0a3576" strokeWidth={0.6} />

      {/* Travel window — the 0°→180° sweep at the horn radius, on the shaft's right side */}
      <path
        d={`M ${cx} ${shaftY - HORN_LEN} A ${HORN_LEN} ${HORN_LEN} 0 0 1 ${cx} ${shaftY + HORN_LEN}`}
        fill="none"
        stroke="#5b9be0"
        strokeWidth={0.8}
        opacity={0.4}
        strokeLinecap="round"
        strokeDasharray="2 3"
      />

      {/* Gearbox hub */}
      <circle cx={cx} cy={shaftY} r={HUB_R + 1.5} fill="#0d47a1" opacity={0.5} />
      <circle cx={cx} cy={shaftY} r={HUB_R} fill={`url(#${hubGradId})`} stroke="#bdbdbd" strokeWidth={0.6} />

      {/* Horn — authored pointing right (= 90°); the rAF slew rotates this group */}
      <g ref={hornRef}>
        {/* Short counter-arm so it reads as a real 2-sided horn.
            NB: solid stroke — a gradient on a horizontal (zero-height) line
            has a degenerate objectBoundingBox and paints nothing. */}
        <line x1={cx} y1={shaftY} x2={cx - HORN_LEN * 0.42} y2={shaftY}
          stroke="#e2e2e2" strokeWidth={1.8 * PX_PER_MM} strokeLinecap="round" />
        {/* Main arm */}
        <line x1={cx} y1={shaftY} x2={cx + HORN_LEN} y2={shaftY}
          stroke="#ffffff" strokeWidth={2.2 * PX_PER_MM} strokeLinecap="round" />
        {/* Mounting holes down the main arm */}
        <circle cx={cx + HORN_LEN} cy={shaftY} r={0.9 * PX_PER_MM} fill="#eee" stroke="#9e9e9e" strokeWidth={0.3} />
        <circle cx={cx + HORN_LEN} cy={shaftY} r={0.4 * PX_PER_MM} fill="#9e9e9e" />
        <circle cx={cx + HORN_LEN * 0.82} cy={shaftY} r={0.42 * PX_PER_MM} fill="#9e9e9e" />
        <circle cx={cx + HORN_LEN * 0.64} cy={shaftY} r={0.42 * PX_PER_MM} fill="#9e9e9e" />
        <circle cx={cx + HORN_LEN * 0.46} cy={shaftY} r={0.42 * PX_PER_MM} fill="#9e9e9e" />
      </g>
      {/* Hub centre screw (drawn after the horn so it sits on top) */}
      <circle cx={cx} cy={shaftY} r={1 * PX_PER_MM} fill="#8a8a8a" stroke="#5c5c5c" strokeWidth={0.3} />

      {/* Name + commanded angle */}
      <text x={cx} y={caseB + EAR_LEN + 3 * PX_PER_MM} textAnchor="middle" fontSize={LABEL_FONT_SIZE} fill="#888" fontFamily="monospace">
        {component.name} ({Math.round(angle)}°)
      </text>
    </g>
  );
}

export const ServoRenderer = React.memo(ServoRendererInner);
