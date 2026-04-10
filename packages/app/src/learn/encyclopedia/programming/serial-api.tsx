// Arduino Programming > Arduino API > Serial API

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  CodeBlock,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function SerialApiPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "programming" && e.slug === "serial-api",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Serial API"
        subtitle="The Serial object: print, read, and a handful of other calls."
      />

      <Section title="Serial.begin()">
        <p className="text-sm leading-relaxed">
          Call this once in <code>setup()</code> before any other Serial
          call. The argument is the baud rate; both sides of the link
          must agree on it.
        </p>

        <CodeBlock code={`void setup() {
  Serial.begin(9600);
}`} />
      </Section>

      <Section title="Printing — print() and println()">
        <p className="text-sm leading-relaxed">
          <code>Serial.print()</code> sends text without a newline.{" "}
          <code>Serial.println()</code> adds a newline at the end. Both
          accept integers, floats, strings, and single characters —
          Arduino figures out the conversion from the argument type.
        </p>

        <CodeBlock code={`Serial.print("Counter: ");
Serial.println(counter);

Serial.println(3.14);       // prints "3.14"
Serial.println('A');        // prints "A"
Serial.println(255, HEX);   // prints "FF"
Serial.println(255, BIN);   // prints "11111111"`} />

        <Note>
          The optional second argument to <code>print()</code> picks a
          base: <code>DEC</code>, <code>HEX</code>, <code>OCT</code>, or{" "}
          <code>BIN</code>. Handy when debugging bit patterns.
        </Note>
      </Section>

      <Section title="Reading — available() and read()">
        <p className="text-sm leading-relaxed">
          <code>Serial.available()</code> returns the number of bytes
          currently waiting to be read. Check it before calling{" "}
          <code>Serial.read()</code>, which pulls one byte from the
          buffer (or returns −1 if the buffer is empty).
        </p>

        <CodeBlock code={`void loop() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'a') digitalWrite(13, HIGH);
    if (c == 'b') digitalWrite(13, LOW);
  }
}`} />
      </Section>

      <Section title="The other calls you'll meet">
        <Table
          headers={["Call", "What it does"]}
          rows={[
            ["Serial.write(b)", "Sends one raw byte (not text)"],
            ["Serial.readString()", "Reads bytes until the timeout, returns a String"],
            ["Serial.readStringUntil(c)", "Reads until the terminator character"],
            ["Serial.parseInt()", "Reads digits, parses them as an integer"],
            ["Serial.flush()", "Waits for outgoing data to finish transmitting"],
            ["Serial.end()", "Releases the serial port and the RX/TX pins"],
          ]}
        />
      </Section>

      <SeeAlso
        refs={[
          "board/serial",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
