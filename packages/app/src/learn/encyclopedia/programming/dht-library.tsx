// Arduino Programming > Libraries > DHT library

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

export function DhtLibraryPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "dht-library",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="DHT library"
        subtitle="Reading temperature and humidity from the cheap DHT11 and DHT22 sensors."
      />

      <Section title="Construct and begin">
        <p className="text-sm leading-relaxed">
          Adafruit's <code className="text-foreground">DHT</code>{" "}
          library drives the DHT11, DHT21, and DHT22 sensors over a
          single data wire. Pass the pin number and the sensor type
          to the constructor, then call <code>begin()</code> in{" "}
          <code>setup()</code>.
        </p>

        <CodeBlock code={`#include <DHT.h>

const int DHT_PIN = 2;
DHT dht(DHT_PIN, DHT22);   // or DHT11

void setup() {
  Serial.begin(9600);
  dht.begin();
}`} />

        <Figure caption="DHT22 pinout: VCC, DATA (with a 10k pull-up to VCC), and GND. DATA goes to any digital pin.">
          <DhtSensorDiagram />
        </Figure>
      </Section>

      <Section title="Reading temperature and humidity">
        <p className="text-sm leading-relaxed">
          <code className="text-foreground">readTemperature()</code>{" "}
          returns degrees Celsius by default; pass <code>true</code>{" "}
          for Fahrenheit.{" "}
          <code className="text-foreground">readHumidity()</code>{" "}
          returns relative humidity as a percent. Both return{" "}
          <code>NAN</code> if the read failed — always check before
          using the value.
        </p>

        <CodeBlock code={`void loop() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();       // °C
  // float f = dht.readTemperature(true); // °F

  if (isnan(h) || isnan(t)) {
    Serial.println("DHT read failed");
    return;
  }

  float hi = dht.computeHeatIndex(t, h, false);

  Serial.print("T=");  Serial.print(t);
  Serial.print("C  H="); Serial.print(h);
  Serial.print("%  HI="); Serial.println(hi);

  delay(2000);          // DHT22: 2+ seconds between reads
}`} />

        <Note>
          The DHT sensors are slow. A DHT11 can be polled about once
          per second; a DHT22 once every two seconds. Reading faster
          than that returns stale data or fails outright — use
          non-blocking timing to pace the reads if <code>loop()</code>
          {" "}has other work to do.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "programming/serial-api",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── DHT sensor wiring diagram ──────────────────────────────────────────

function DhtSensorDiagram() {
  const w = 500
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
        {/* Sensor body */}
        <rect x={160} y={40} width={180} height={180} rx={6} fill="#0f0f0f" stroke="#60a5fa" strokeWidth={2} />
        <text x={250} y={65} textAnchor="middle" fontSize={11} fill="#60a5fa" fontFamily={mono}>DHT22</text>
        {/* Grille pattern */}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={i} x1={190} y1={85 + i * 16} x2={310} y2={85 + i * 16} stroke="#27272a" strokeWidth={2} />
        ))}
        <text x={250} y={195} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>temp + humidity</text>

        {/* Pin stubs */}
        <line x1={180} y1={220} x2={180} y2={245} stroke="#ef4444" strokeWidth={2} />
        <text x={180} y={258} textAnchor="middle" fontSize={10} fill="#ef4444" fontFamily={mono}>VCC</text>

        <line x1={250} y1={220} x2={250} y2={245} stroke="#f59e0b" strokeWidth={2} />
        <text x={250} y={258} textAnchor="middle" fontSize={10} fill="#f59e0b" fontFamily={mono}>DATA</text>

        <line x1={320} y1={220} x2={320} y2={245} stroke="#9ca3af" strokeWidth={2} />
        <text x={320} y={258} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily={mono}>GND</text>

        {/* Pull-up resistor between VCC and DATA */}
        <line x1={180} y1={90} x2={90} y2={90} stroke="#ef4444" strokeWidth={1.5} />
        <line x1={90} y1={90} x2={90} y2={130} stroke="#ef4444" strokeWidth={1.5} />
        <rect x={75} y={130} width={30} height={16} fill="#0f0f0f" stroke="#f59e0b" strokeWidth={1.5} />
        <text x={50} y={144} textAnchor="end" fontSize={10} fill="#f59e0b" fontFamily={mono}>10k</text>
        <line x1={90} y1={146} x2={90} y2={170} stroke="#f59e0b" strokeWidth={1.5} />
        <line x1={90} y1={170} x2={180} y2={170} stroke="#f59e0b" strokeWidth={1.5} />
        <line x1={180} y1={170} x2={180} y2={220} stroke="#f59e0b" strokeWidth={1.5} />

        {/* Note: data line connects to DATA pin through pull-up */}
        <text x={w - 20} y={160} textAnchor="end" fontSize={9} fill="#6b7280" fontFamily={mono}>pull-up keeps DATA HIGH when idle</text>
      </svg>
    </div>
  )
}
