// Arduino Programming > C++ essentials > Classes (read-only)

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

export function ClassesPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "classes",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Classes (read-only)"
        subtitle="You don't write your own classes in a Dreamer sketch — you use the ones the libraries ship with."
      />

      <Section title="Using a library class">
        <p className="text-sm leading-relaxed">
          Most Arduino libraries hand you a class. You declare one
          instance as a global variable, call its methods with a
          dot, and that's the whole API. The <code>Servo</code>{" "}
          class is the classic example: create one per servo, call{" "}
          <code>attach</code> once in <code>setup()</code>, then
          call <code>write</code> whenever you want to move it.
        </p>

        <CodeBlock code={`#include <Servo.h>

Servo arm;

void setup() {
  arm.attach(9);
  arm.write(90);
}

void loop() {
  arm.write(0);
  delay(1000);
  arm.write(180);
  delay(1000);
}`} />
      </Section>

      <Section title="Constructors with arguments">
        <p className="text-sm leading-relaxed">
          Some library classes take arguments when you create them.
          You pass those arguments in parentheses right after the
          variable name. <code>LiquidCrystal</code> takes the pins
          it's wired to; <code>Adafruit_NeoPixel</code> takes the
          strip length, the data pin, and a colour-order flag.
        </p>

        <CodeBlock code={`#include <LiquidCrystal.h>
#include <Adafruit_NeoPixel.h>

LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
Adafruit_NeoPixel strip(16, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  lcd.begin(16, 2);
  strip.begin();
}`} />
      </Section>

      <Section title="What Dreamer does not support">
        <p className="text-sm leading-relaxed">
          You can use the library classes that ship with Dreamer,
          but you can't write your own. The transpiler rejects
          <code>class</code> declarations in sketch code. If you
          want to group related state, use a <code>struct</code>{" "}
          (see the structs page) and plain functions that take the
          struct as a parameter. That covers almost every case
          where a beginner reaches for a class.
        </p>

        <Warn>
          No <code>new</code>, no <code>malloc</code>, and no
          pointers — all three are rejected by Dreamer's transpiler.
          Library classes are always declared as globals, never
          dynamically allocated.
        </Warn>

        <Note>
          The supported library list grows over time. When in doubt,
          check the "What Dreamer can and can't run" page.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/servo-library",
          "programming/liquidcrystal-library",
          "programming/dreamer-limits",
          "programming/structs",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
