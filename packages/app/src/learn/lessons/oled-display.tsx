import { LearnLayout, LessonFooter, PageTitle, Section, Note, DifficultyBadge } from "@/learn/learn-layout"
import { BreadboardEmbed } from "@/learn/breadboard-embed"
import { Term } from "@/learn/term"

export function OledDisplayLesson() {
  return (
    <LearnLayout>
      <PageTitle
        title="OLED Hello World"
        subtitle="Draw text on a 128x64 OLED display over I2C with two wires."
      
        badge={<DifficultyBadge difficulty="advanced" />}
      />

      <Section title="What you'll build">
        <p className="text-sm leading-relaxed">
          A 128{"\u00d7"}64 pixel SSD1306 OLED display wired to the Arduino's{" "}
          <Term k="i2c">I2C</Term> pins (SDA on A4, SCL on A5). The sketch uses the{" "}
          <code className="text-foreground">Adafruit_SSD1306</code> library to clear the
          screen and render "Hello, World!" in large text.
        </p>
      </Section>

      <Section title="Try it">
        <BreadboardEmbed board="22-oled-display" panels={["code"]} height={500} />
        <Note>
          Press <strong>Play</strong>. The simulated OLED renders the text on its 128{"\u00d7"}64
          pixel screen.
        </Note>
      </Section>

      <Section title="How it works">
        <p className="text-sm leading-relaxed">
          The OLED communicates over <Term k="i2c" /> — a two-wire serial bus. The
          Arduino is the bus master; the display responds to address{" "}
          <code className="text-foreground">0x3C</code> (the most common default for
          SSD1306 modules). The <code className="text-foreground">Wire</code> library
          handles the I2C framing automatically; you only interact with the higher-level
          display API.
        </p>
        <p className="text-sm leading-relaxed">
          <code className="text-foreground">display.begin()</code> sends the initialization
          sequence to configure the OLED's internal controller.{" "}
          <code className="text-foreground">display.clearDisplay()</code> blanks the
          128{"\u00d7"}64 pixel framebuffer in RAM.{" "}
          <code className="text-foreground">display.setTextSize(2)</code> scales characters
          to 2{"\u00d7"} their native size, and{" "}
          <code className="text-foreground">display.display()</code> pushes the entire
          framebuffer to the OLED over I2C.
        </p>
      </Section>

      <Section title="Why I2C for a display?">
        <p className="text-sm leading-relaxed">
          <Term k="i2c" /> uses only two wires (SDA and SCL) shared among all I2C
          devices on the bus. Compared to the 6-wire parallel interface used by the
          16{"\u00d7"}2 LCD in the previous lesson, this frees up four Arduino pins. The
          tradeoff is speed: I2C at 400 kHz limits screen refresh rates, but for a
          static display like this one that is not a constraint.
        </p>
      </Section>

      <LessonFooter currentSlug="oled-display" />
    </LearnLayout>
  )
}
