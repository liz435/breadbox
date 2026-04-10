// Arduino Programming > Libraries > Adafruit_SSD1306 library

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function Ssd1306LibraryPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "ssd1306-library",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Adafruit_SSD1306 library"
        subtitle="Drive tiny 128×64 OLED modules with a handful of methods."
      />

      <Section title="The display">
        <p className="text-sm leading-relaxed">
          The SSD1306 is the controller chip inside most of the
          small mono OLED modules you'll see sold as "0.96 inch
          128×64 display". It talks over <Term k="i2c" /> (4-pin
          modules) or <Term k="spi" /> (7-pin modules). The
          Adafruit_SSD1306 library wraps both and gives you a
          single <code>display</code> object to draw on.
        </p>
      </Section>

      <Section title="The methods you'll use">
        <Table
          headers={["Call", "What it does"]}
          rows={[
            [
              "display.begin(...)",
              "Initialise the module; call once in setup()",
            ],
            ["display.clearDisplay()", "Blank the off-screen buffer"],
            [
              "display.setCursor(x, y)",
              "Move the text cursor to pixel (x, y)",
            ],
            [
              "display.setTextSize(n)",
              "Scale the font up by n",
            ],
            [
              "display.print(...)",
              "Write text into the buffer at the cursor",
            ],
            [
              "display.drawPixel(x, y, c)",
              "Set a single pixel",
            ],
            [
              "display.display()",
              "Push the buffer to the physical screen",
            ],
          ]}
        />

        <p className="text-sm leading-relaxed">
          The key thing to internalise: drawing goes into a
          1024-byte off-screen buffer, and nothing appears on the
          actual OLED until you call <code>display.display()</code>.
        </p>
      </Section>

      <Section title="A counter on screen">
        <CodeBlock code={`#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64);

int count = 0;

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(WHITE);
}

void loop() {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("Count: ");
  display.println(count);
  display.display();
  count = count + 1;
  delay(500);
}`} />

        <Note>
          <code>0x3C</code> is the default I2C address for most
          SSD1306 modules. If your display looks blank, try{" "}
          <code>0x3D</code> — both are common.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/i2c",
          "electronics/i2c-concepts",
          "programming/liquidcrystal-library",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
