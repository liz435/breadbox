import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge, Warn } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function NeopixelLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="NeoPixel Rainbow"
        subtitle="Chase rainbow colors across a WS2812 LED strip with the Adafruit NeoPixel library."
      
        badge={<DifficultyBadge difficulty="advanced" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          An 8-LED WS2812 NeoPixel strip on pin <code className="text-gray-200">D6</code>.
          The sketch cycles through the color wheel one pixel at a time, creating a
          rainbow chase effect using the{" "}
          <code className="text-gray-200">Adafruit_NeoPixel</code> library.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="21-neopixel" panels={["code"]} height={460} />
        <Note>
          Press <strong>Play</strong>. The eight NeoPixels chase through the rainbow.
          Try changing <code className="text-gray-200">NUM_LEDS</code> or the hue step
          in the sketch.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          NeoPixels are addressable RGB LEDs with a built-in WS2812 driver chip. All
          LEDs chain together on a single data line: the Arduino sends a stream of 24-bit
          color values (8 bits each for green, red, blue in that order), and each chip
          consumes the first 24 bits it sees and forwards the rest downstream. The result
          is independent color control of every pixel using one pin.
        </p>
        <p className="text-sm leading-relaxed">
          <code className="text-gray-200">strip.ColorHSV()</code> generates a 32-bit
          color from a hue angle (0–65535), saturation, and value. The sketch increments
          the hue per pixel to spread the rainbow, and calls{" "}
          <code className="text-gray-200">strip.show()</code> once to latch all colors to
          the strip simultaneously.
        </p>
      </Section>

      <Warn>
        A full 8-pixel strip at maximum brightness can draw up to 480 mA (60 mA per
        pixel). This exceeds the USB port's 500 mA limit when combined with the Arduino.
        Power larger strips from a dedicated 5 V supply sharing a common ground with
        the Arduino. The sketch sets brightness to 50 (out of 255) to stay safe on
        USB power for this lesson.
      </Warn>

      <Section title="Why does the protocol use a single wire?">
        <p className="text-sm leading-relaxed">
          The WS2812 uses a self-clocked 800 kHz protocol where each bit is encoded as
          the ratio of HIGH to LOW time within a fixed 1.25 {"\u03bc"}s period. This means
          no separate clock wire is needed — the data and timing are embedded together.
          The library disables interrupts during transmission to maintain the precise
          timing the chips require.
        </p>
      </Section>

      <LessonFooter currentSlug="neopixel" />
    </LearnLayout>
  )
}
