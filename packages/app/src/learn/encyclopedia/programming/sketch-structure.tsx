// Arduino Programming > C++ essentials > Sketch structure

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { BreadboardEmbed } from "@/learn/breadboard-embed"

export function SketchStructurePage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "sketch-structure",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Sketch structure"
        subtitle="Every Arduino sketch is two functions and maybe some globals."
      />

      <Section title="The shape of a sketch">
        <p className="text-sm leading-relaxed">
          Every Arduino sketch has exactly the same skeleton: a{" "}
          <code className="text-foreground">setup()</code> function that runs
          once when the board powers on, and a{" "}
          <code className="text-foreground">loop()</code> function that runs
          over and over forever. That's it. The Arduino core provides the{" "}
          <code>main()</code> function for you behind the scenes.
        </p>

        <CodeBlock code={`// Runs once, right after reset or power-on.
void setup() {
  pinMode(13, OUTPUT);
}

// Runs forever after setup() finishes.
void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}`} />

        <p className="text-sm leading-relaxed">
          You can see it running here —{" "}
          <code className="text-foreground">setup()</code> configures pin 13,
          and <code className="text-foreground">loop()</code> toggles it
          forever.
        </p>

        <BreadboardEmbed board="01-blink-led" panels={["code"]} height={420} />
      </Section>

      <Section title="setup() runs once">
        <p className="text-sm leading-relaxed">
          Use <code>setup()</code> for one-time configuration: setting pin
          modes, starting Serial, initializing libraries, seeding state.
          It runs exactly one time — when the sketch first starts, or
          after the reset button is pressed.
        </p>
      </Section>

      <Section title="loop() runs forever">
        <p className="text-sm leading-relaxed">
          When <code>loop()</code> returns, the Arduino core calls it
          again immediately. This is where the real work of your sketch
          happens: read sensors, compute, write outputs, check timing.
          The ATmega328P runs at 16 MHz, so an empty <code>loop()</code>{" "}
          can iterate millions of times a second.
        </p>
      </Section>

      <Section title="Globals live outside">
        <p className="text-sm leading-relaxed">
          Variables declared at the top of the file (outside any function)
          are global. They live for the entire life of the sketch and are
          visible to both <code>setup()</code> and <code>loop()</code>.
          Variables declared inside a function exist only until that
          function returns.
        </p>

        <CodeBlock code={`int ledPin = 13;     // global — lives forever
int counter = 0;     // global — state between loops

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  counter++;                         // the global updates each pass
  digitalWrite(ledPin, counter % 2); // flips each time
  delay(500);
}`} />

        <Note>
          If you need a value to persist across calls to{" "}
          <code>loop()</code>, it has to be global (or <code>static</code>
          {" "}inside the function). Plain locals reset every iteration.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/digital-pins",
          "programming/variables",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
