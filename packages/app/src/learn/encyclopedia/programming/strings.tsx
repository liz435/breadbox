// Arduino Programming > C++ essentials > Strings

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
          <code className="text-foreground">String</code> class is the
          friendly one: it grows and shrinks on demand, concatenates
          with <code>+</code>, and lives on the heap. A raw{" "}
          <code className="text-foreground">char[]</code> (also called a{" "}
          <em className="text-foreground">C string</em>) is a fixed-size
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

        <Figure caption="char[] is a flat run of bytes ending in '\\0'. String is a tiny handle on the stack pointing at a heap block with a length.">
          <StringLayoutDiagram />
        </Figure>
      </Section>

      <Section title="Heap fragmentation on 2 KB of SRAM">
        <p className="text-sm leading-relaxed">
          The Uno has only 2 KB of SRAM total. Every time you grow,
          concatenate, or reassign a <code>String</code>, its allocator
          grabs a new chunk of heap and frees the old one. Over time
          the free space gets chopped into small gaps — classic{" "}
          <em className="text-foreground">heap fragmentation</em> — and
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
          Reach for <code className="text-foreground">String</code> when
          you're prototyping, when the sketch is short-lived, or when
          the text-handling code would be painful to write with raw
          buffers (lots of concatenation, substring extraction, etc.).
          Reach for <code className="text-foreground">char[]</code> when
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

// ── String memory layout diagram ───────────────────────────────────────

function StringLayoutDiagram() {
  const w = 540
  const h = 200
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  const cellW = 26
  const chars = ["H", "e", "l", "l", "o", "\\0"]
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* char[] side */}
        <text x={120} y={25} textAnchor="middle" fontSize={11} fill="#60a5fa" fontFamily={mono}>char[]</text>
        {chars.map((c, i) => (
          <g key={i}>
            <rect x={10 + i * cellW} y={45} width={cellW} height={30} fill="#0f0f0f" stroke="#60a5fa" strokeWidth={1.5} />
            <text x={10 + i * cellW + cellW / 2} y={65} textAnchor="middle" fontSize={12} fill={i === chars.length - 1 ? "#ef4444" : "#d1d5db"} fontFamily={mono}>{c}</text>
          </g>
        ))}
        <text x={120} y={105} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>flat, fixed-size</text>
        <text x={120} y={120} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>lives on stack</text>
        <text x={120} y={135} textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily={mono}>ends in '\\0'</text>

        {/* String side */}
        <text x={400} y={25} textAnchor="middle" fontSize={11} fill="#a78bfa" fontFamily={mono}>String</text>
        {/* Stack handle */}
        <rect x={300} y={45} width={70} height={40} fill="#0f0f0f" stroke="#a78bfa" strokeWidth={1.5} />
        <text x={335} y={60} textAnchor="middle" fontSize={10} fill="#d1d5db" fontFamily={mono}>ptr ──┐</text>
        <text x={335} y={78} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>len=5</text>
        <text x={335} y={100} textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily={mono}>stack</text>

        {/* Arrow to heap */}
        <line x1={370} y1={55} x2={410} y2={55} stroke="#a78bfa" strokeWidth={1.5} />
        <line x1={410} y1={55} x2={410} y2={130} stroke="#a78bfa" strokeWidth={1.5} />
        <line x1={410} y1={130} x2={440} y2={130} stroke="#a78bfa" strokeWidth={1.5} />
        <polyline points="435,125 440,130 435,135" fill="none" stroke="#a78bfa" strokeWidth={1.5} />

        {/* Heap block */}
        <rect x={440} y={115} width={90} height={35} fill="#0f0f0f" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3,2" />
        <text x={485} y={137} textAnchor="middle" fontSize={11} fill="#d1d5db" fontFamily={mono}>Hello\0</text>
        <text x={485} y={170} textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily={mono}>heap</text>
      </svg>
    </div>
  )
}
