// Arduino Programming > Libraries > IRremote library

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  CodeBlock,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function IrRemoteLibraryPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "irremote-library",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="IRremote library"
        subtitle="Decode infra-red remote codes into hex numbers your sketch can branch on."
      />

      <Figure caption="The remote fires a burst of 38 kHz pulses; the receiver demodulates them, and the library turns the pulse train into a hex value.">
        <IrRemoteDiagram />
      </Figure>

      <Section title="What the library does">
        <p className="text-sm leading-relaxed">
          A cheap 38 kHz IR receiver module outputs a single digital
          line that pulses when a remote is pressed. Decoding those
          pulses into the original remote button is tedious, so the
          <code>IRremote</code> library does it for you. You give it
          the pin, ask it to enable reception, and then each time a
          full code arrives it hands you a number you can compare
          against.
        </p>
      </Section>

      <Section title="The classic skeleton">
        <CodeBlock code={`#include <IRremote.h>

const int IR_PIN = 2;

IRrecv irrecv(IR_PIN);
decode_results results;

void setup() {
  Serial.begin(9600);
  irrecv.enableIRIn();
}

void loop() {
  if (irrecv.decode(&results)) {
    Serial.println(results.value, HEX);
    irrecv.resume();
  }
}`} />

        <p className="text-sm leading-relaxed">
          <code>enableIRIn()</code> turns on the receiver state
          machine. Each call to <code>decode()</code> returns true
          when a full code is ready, with the bits stored in{" "}
          <code>results.value</code>. You must call{" "}
          <code>resume()</code> afterwards to arm it for the next
          code, otherwise nothing else will ever come through.
        </p>
      </Section>

      <Section title="Branching on specific buttons">
        <CodeBlock code={`void loop() {
  if (irrecv.decode(&results)) {
    if (results.value == 0xFF30CF) {
      digitalWrite(LED_BUILTIN, HIGH);
    } else if (results.value == 0xFF18E7) {
      digitalWrite(LED_BUILTIN, LOW);
    }
    irrecv.resume();
  }
}`} />

        <p className="text-sm leading-relaxed">
          The hex values are specific to your remote. Print them
          once with the skeleton above, press each button you care
          about, and paste the numbers into your code.
        </p>

        <Note>
          IR receivers pair naturally with interrupts because a
          code is an asynchronous event, but the stock
          <code>IRremote</code> library takes care of timing
          internally — you don't have to wire up
          <code>attachInterrupt</code> yourself.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/interrupts-api",
          "programming/serial-api",
          "programming/digital-io",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── IR remote diagram ──────────────────────────────────────────────────

function IrRemoteDiagram() {
  const w = 560
  const h = 260
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        className="max-w-full"
      >
        {/* Remote */}
        <rect x={20} y={30} width={100} height={160} rx={10} fill="#0f0f0f" stroke="#60a5fa" strokeWidth={2} />
        <text x={70} y={50} textAnchor="middle" fontSize={10} fill="#60a5fa" fontFamily={mono}>remote</text>
        {Array.from({ length: 9 }, (_, i) => (
          <rect
            key={i}
            x={35 + (i % 3) * 22}
            y={70 + Math.floor(i / 3) * 30}
            width={15}
            height={15}
            rx={2}
            fill="#0f0f0f"
            stroke="#6b7280"
            strokeWidth={1}
          />
        ))}
        {/* LED at top */}
        <circle cx={70} cy={20} r={5} fill="#ef4444" />

        {/* Pulse train */}
        {Array.from({ length: 8 }, (_, i) => {
          const x = 140 + i * 22
          return (
            <line key={i} x1={x} y1={30} x2={x} y2={90} stroke="#f59e0b" strokeWidth={3} strokeOpacity={1 - i * 0.05} />
          )
        })}
        <text x={200} y={110} textAnchor="middle" fontSize={10} fill="#f59e0b" fontFamily={mono}>38 kHz burst</text>

        {/* Receiver module */}
        <rect x={340} y={40} width={100} height={120} rx={6} fill="#0f0f0f" stroke="#a78bfa" strokeWidth={2} />
        <text x={390} y={60} textAnchor="middle" fontSize={10} fill="#a78bfa" fontFamily={mono}>IR receiver</text>
        <circle cx={390} cy={100} r={18} fill="#0f0f0f" stroke="#a78bfa" strokeWidth={1.5} />
        <circle cx={390} cy={100} r={10} fill="#a78bfa" fillOpacity={0.3} />

        {/* Arrow */}
        <line x1={340} y1={60} x2={325} y2={60} stroke="#a78bfa" strokeWidth={1.5} />
        <line x1={340} y1={100} x2={325} y2={100} stroke="#a78bfa" strokeWidth={1.5} />
        <line x1={340} y1={140} x2={325} y2={140} stroke="#a78bfa" strokeWidth={1.5} />
        <text x={440} y={180} textAnchor="end" fontSize={9} fill="#6b7280" fontFamily={mono}>pin D2</text>

        {/* Arrow to library box */}
        <line x1={440} y1={100} x2={490} y2={100} stroke="#a78bfa" strokeWidth={1.5} />
        <polyline points="485,95 490,100 485,105" fill="none" stroke="#a78bfa" strokeWidth={1.5} />

        {/* Hex output */}
        <rect x={430} y={200} width={120} height={36} rx={4} fill="#0f0f0f" stroke="#10b981" strokeWidth={1.5} />
        <text x={490} y={223} textAnchor="middle" fontSize={13} fill="#10b981" fontFamily={mono}>0xFF30CF</text>
        <text x={490} y={248} textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily={mono}>decoded code</text>

        {/* Arrow from receiver to hex */}
        <line x1={390} y1={160} x2={390} y2={218} stroke="#6b7280" strokeWidth={1.2} strokeDasharray="3,2" />
        <line x1={390} y1={218} x2={430} y2={218} stroke="#6b7280" strokeWidth={1.2} strokeDasharray="3,2" />
      </svg>
    </div>
  )
}
