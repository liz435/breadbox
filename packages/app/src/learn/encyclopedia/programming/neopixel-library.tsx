// Arduino Programming > Libraries > Adafruit_NeoPixel library

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function NeoPixelLibraryPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "neopixel-library",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Adafruit_NeoPixel library"
        subtitle="Driving WS2812 strips — individually addressable RGB LEDs on a single data line."
      />

      <Section title="Construct and begin">
        <p className="text-sm leading-relaxed">
          The constructor takes the number of pixels, the data pin,
          and the color order / timing flags. Almost every common
          strip wants{" "}
          <code className="text-gray-200">NEO_GRB + NEO_KHZ800</code>.
          Call <code>begin()</code> once in <code>setup()</code> to
          initialize the pin.
        </p>

        <CodeBlock code={`#include <Adafruit_NeoPixel.h>

const int LED_PIN = 6;
const int NUM_LEDS = 16;

Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  strip.begin();
  strip.setBrightness(64);   // 0..255
  strip.show();              // clear on boot
}`} />

        <Figure caption="Data flows serially from DIN through each pixel to DOUT — the first pixel consumes the first 24 bits and forwards the rest.">
          <NeopixelChainDiagram />
        </Figure>
      </Section>

      <Section title="Setting pixels and show()">
        <p className="text-sm leading-relaxed">
          Changes you make with{" "}
          <code className="text-gray-200">setPixelColor(i, r, g, b)</code>
          ,{" "}
          <code className="text-gray-200">fill()</code>, or{" "}
          <code className="text-gray-200">clear()</code> only update
          an in-memory buffer.{" "}
          <em className="text-gray-200">Nothing happens on the strip
          until you call <code>show()</code>.</em> That's the step
          that actually clocks the data out to the LEDs.
        </p>

        <CodeBlock code={`void loop() {
  for (int i = 0; i < NUM_LEDS; i++) {
    uint8_t hue = (i * 255 / NUM_LEDS + millis() / 20) & 0xFF;
    strip.setPixelColor(i, strip.ColorHSV(hue * 256));
  }
  strip.show();
  delay(20);
}`} />

        <Warn>
          WS2812 strips draw up to 60 mA per pixel at full white. A
          16-LED ring at full brightness pulls almost an amp —
          do not run that through the Arduino's 5 V pin. Power the
          strip from a separate 5 V supply and tie its ground to the
          Arduino's ground.
        </Warn>

        <Note>
          <code>setBrightness()</code> scales every pixel by the same
          value on the next <code>show()</code>. Use it as a master
          dimmer — it's a cheap way to keep current draw under
          control.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/analog-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── NeoPixel chain diagram ─────────────────────────────────────────────

function NeopixelChainDiagram() {
  const w = 560
  const h = 180
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const startX = 70
  const gap = 58
  const cy = 100
  const colors = ["#ef4444", "#f59e0b", "#10b981", "#60a5fa", "#a78bfa", "#ef4444", "#f59e0b", "#10b981"]
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* DIN label */}
        <text x={20} y={cy + 4} textAnchor="start" fontSize={11} fill="#a78bfa" fontFamily={mono}>DIN</text>
        <line x1={45} y1={cy} x2={startX - 14} y2={cy} stroke="#a78bfa" strokeWidth={1.8} />
        <polyline points={`${startX - 18},${cy - 4} ${startX - 14},${cy} ${startX - 18},${cy + 4}`} fill="none" stroke="#a78bfa" strokeWidth={1.8} />

        {/* LEDs */}
        {colors.map((c, i) => {
          const cx = startX + i * gap
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={18} fill={c} fillOpacity={0.4} stroke={c} strokeWidth={2} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fill="#d1d5db" fontFamily={mono}>{i}</text>
              {i < colors.length - 1 && (
                <>
                  <line x1={cx + 18} y1={cy} x2={cx + gap - 18} y2={cy} stroke="#a78bfa" strokeWidth={1.8} />
                  <polyline points={`${cx + gap - 22},${cy - 4} ${cx + gap - 18},${cy} ${cx + gap - 22},${cy + 4}`} fill="none" stroke="#a78bfa" strokeWidth={1.8} />
                </>
              )}
            </g>
          )
        })}

        {/* DOUT */}
        <line x1={startX + (colors.length - 1) * gap + 18} y1={cy} x2={startX + (colors.length - 1) * gap + 50} y2={cy} stroke="#a78bfa" strokeWidth={1.8} />
        <text x={startX + (colors.length - 1) * gap + 55} y={cy + 4} fontSize={11} fill="#a78bfa" fontFamily={mono}>DOUT</text>

        {/* Bottom caption */}
        <text x={w / 2} y={150} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily={mono}>
          single data line, 800 kHz — each pixel shifts the next 24 bits down the chain
        </text>
      </svg>
    </div>
  )
}
