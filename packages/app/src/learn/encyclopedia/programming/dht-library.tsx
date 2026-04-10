// Arduino Programming > Libraries > DHT library

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
          Adafruit's <code className="text-gray-200">DHT</code>{" "}
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
      </Section>

      <Section title="Reading temperature and humidity">
        <p className="text-sm leading-relaxed">
          <code className="text-gray-200">readTemperature()</code>{" "}
          returns degrees Celsius by default; pass <code>true</code>{" "}
          for Fahrenheit.{" "}
          <code className="text-gray-200">readHumidity()</code>{" "}
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
