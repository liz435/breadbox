// Arduino Programming > C++ essentials > Multi-file sketches

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

export function MultiFilePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "multi-file",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Multi-file sketches"
        subtitle="How Arduino IDE tabs map to files, and the difference between quoted and angle-bracket includes."
      />

      <Section title="Tabs are files">
        <p className="text-sm leading-relaxed">
          In the Arduino IDE, clicking the little triangle and
          picking "New Tab" adds a new file alongside your main{" "}
          <code>.ino</code>. Every <code>.ino</code> tab in the
          sketch folder is concatenated together at compile time,
          which means functions in one tab are visible from
          another without any extra wiring. Tabs named{" "}
          <code>.h</code> or <code>.cpp</code> are treated as normal
          C++ header and source files — you have to{" "}
          <code>#include</code> them to use their contents.
        </p>
      </Section>

      <Section title="Two flavours of include">
        <Table
          headers={["Form", "Where it looks", "Use for"]}
          rows={[
            [
              '#include "MyFile.h"',
              "Your sketch folder first",
              "Your own headers",
            ],
            [
              "#include <Library.h>",
              "Installed library paths only",
              "Third-party libraries",
            ],
          ]}
        />

        <p className="text-sm leading-relaxed">
          Quoted includes find files inside your sketch folder.
          Angle-bracket includes skip the sketch folder and go
          straight to the library search path. If you get that
          backwards, the compiler will often still find the file
          but the error messages get confusing, so stick to the
          convention.
        </p>

        <CodeBlock code={`// BlinkTwoLeds.ino
#include <Servo.h>       // installed library
#include "pins.h"         // file next to BlinkTwoLeds.ino

Servo arm;

void setup() {
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  arm.attach(SERVO_PIN);
}`} />
      </Section>

      <Section title="What Dreamer supports">
        <p className="text-sm leading-relaxed">
          Dreamer's sketch editor is single-file today. You can't
          split a project across multiple tabs in the simulator, so
          user <code>#include "..."</code> directives are not
          supported. Angle-bracket <code>#include &lt;...&gt;</code>{" "}
          for the built-in libraries (Servo, LiquidCrystal,
          Adafruit_NeoPixel, DHT, IRremote, Adafruit_SSD1306, EEPROM)
          works fine.
        </p>

        <Note>
          Keep your Dreamer sketches single-file. When you move to a
          real Arduino IDE, splitting across tabs is a good
          refactor once one file passes a few hundred lines.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/dreamer-limits",
          "programming/sketch-structure",
          "programming/classes",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
