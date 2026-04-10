// Arduino Programming > C++ essentials > Strings

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

export function StringsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "strings",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Strings"
        subtitle="Two ways to hold text on a 2 KB microcontroller — and why the choice matters."
      />

      <Section title="Two flavors: String and char[]">
        <p className="text-sm leading-relaxed">
          Arduino C++ gives you two ways to hold text. The{" "}
          <code className="text-gray-200">String</code> class is the
          friendly one: it grows and shrinks on demand, concatenates
          with <code>+</code>, and lives on the heap. A raw{" "}
          <code className="text-gray-200">char[]</code> (also called a{" "}
          <em className="text-gray-200">C string</em>) is a fixed-size
          array of characters ending in a <code>'\0'</code> byte; it
          lives wherever you put it and never resizes.
        </p>

        <CodeBlock code={`// String class
String name = "Arduino";
name += " Uno";
Serial.println(name);

// char array (C string)
char label[16] = "Arduino";
strcat(label, " Uno");
Serial.println(label);`} />
      </Section>

      <Section title="Heap fragmentation on 2 KB of SRAM">
        <p className="text-sm leading-relaxed">
          The Uno has only 2 KB of SRAM total. Every time you grow,
          concatenate, or reassign a <code>String</code>, its allocator
          grabs a new chunk of heap and frees the old one. Over time
          the free space gets chopped into small gaps — classic{" "}
          <em className="text-gray-200">heap fragmentation</em> — and
          the sketch slowly runs out of usable memory and starts
          misbehaving in mysterious ways.
        </p>

        <Warn>
          <code>String</code> is convenient for quick experiments but
          risky in long-running sketches. If your program must run for
          days, prefer fixed-size <code>char[]</code> buffers and the
          C library's <code>strcpy</code> / <code>strcat</code> /{" "}
          <code>snprintf</code>.
        </Warn>
      </Section>

      <Section title="When to pick which">
        <p className="text-sm leading-relaxed">
          Reach for <code className="text-gray-200">String</code> when
          you're prototyping, when the sketch is short-lived, or when
          the text-handling code would be painful to write with raw
          buffers (lots of concatenation, substring extraction, etc.).
          Reach for <code className="text-gray-200">char[]</code> when
          the sketch has to run reliably for a long time, when memory
          is tight, or when you're passing a string to a library that
          expects a classic C string.
        </p>

        <Note>
          Any literal in double quotes — <code>"hello"</code> — is
          already a <code>const char*</code> stored in flash, not a{" "}
          <code>String</code>. You only pay the heap cost when you
          explicitly wrap it: <code>String msg = "hello";</code>.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/variables",
          "programming/serial-api",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
