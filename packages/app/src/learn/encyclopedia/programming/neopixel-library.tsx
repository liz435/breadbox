// Arduino Programming > Libraries > Adafruit_NeoPixel library

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  CodeBlock,
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
