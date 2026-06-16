// Arduino Uno Reference > Pins & I/O > Analog pins A0–A5

import { useState, useId } from "react"
import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  Schematic,
  Figure,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function AnalogPinsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "board" && e.slug === "analog-pins",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Analog pins A0–A5"
        subtitle="Six inputs that can read a voltage, not just HIGH or LOW."
      />

      <Section title="What 'analog' means here">
        <p className="text-sm leading-relaxed">
          The analog pins on the Uno connect to a{" "}
          <strong className="text-foreground">10-bit ADC</strong>{" "}
          (analog-to-digital converter). When your sketch calls{" "}
          <Term k="analog-read">analogRead(A0)</Term>, the chip samples
          the voltage on that pin and hands back a number from{" "}
          <code className="text-foreground">0</code> to{" "}
          <code className="text-foreground">1023</code> that tells you
          where in the 0–5 V range it sat.
        </p>

        <Table
          headers={["analogRead value", "Voltage"]}
          rows={[
            ["0", "0 V (ground)"],
            ["512", "~2.5 V (halfway)"],
            ["1023", "5 V (full scale)"],
          ]}
        />

        <p className="text-sm leading-relaxed">
          That's what "10-bit" means: 2<sup>10</sup> = 1024 discrete
          steps, each representing about 4.9 mV. Voltages between
          steps round to the nearest.
        </p>

        <AdcVisualizer />
      </Section>

      <Section title="The typical use case">
        <p className="text-sm leading-relaxed">
          Analog pins shine when you have a sensor whose output{" "}
          <em className="text-foreground">varies continuously</em> —
          a potentiometer wiper, a photoresistor in a voltage divider,
          a TMP36 temperature sensor. The sensor delivers a voltage
          that's a function of the thing you're measuring, and{" "}
          <code>analogRead</code> tells you what it is.
        </p>

        <Figure caption="A potentiometer wired as a voltage divider — the classic analog input example.">
          <Schematic cols={11} rows={6} title="Potentiometer wired to Arduino A0: outer terminals to 5V and GND, wiper to A0">
            <Schematic.Vcc at={[2, 1]} label="+5V" />
            <Schematic.Wire points={[[2, 1], [2, 2]]} />
            <Schematic.Resistor from={[2, 2]} to={[2, 4]} label="R pot (top)" />
            <Schematic.Wire points={[[2, 4], [4, 4]]} />
            <Schematic.ArduinoPin at={[8, 4]} pin="A0" />
            <Schematic.Wire points={[[4, 4], [8, 4]]} />
            <Schematic.Resistor from={[2, 4]} to={[2, 5]} label="R pot (bot)" />
            <Schematic.Ground at={[2, 5]} />
          </Schematic>
        </Figure>

        <p className="text-sm leading-relaxed">
          Turning the pot shifts the wiper up or down its resistance
          track, changing the voltage at A0 from somewhere between 0
          and 5 V.{" "}
          <code className="text-foreground">analogRead(A0)</code>{" "}
          returns a value that tracks it linearly.
        </p>
      </Section>

      <Section title="Dual-use: analog pins as digital pins">
        <p className="text-sm leading-relaxed">
          Something the Arduino docs don't advertise loudly: every
          analog pin can ALSO be used as a plain digital I/O pin. The
          aliases are:
        </p>

        <Table
          headers={["Analog", "Digital alias"]}
          rows={[
            ["A0", "14"],
            ["A1", "15"],
            ["A2", "16"],
            ["A3", "17"],
            ["A4", "18 (also I²C SDA)"],
            ["A5", "19 (also I²C SCL)"],
          ]}
        />

        <p className="text-sm leading-relaxed">
          So if you run out of digital pins and don't need to read
          analog values, you can call{" "}
          <code className="text-foreground">pinMode(A0, OUTPUT)</code>{" "}
          and treat A0 as another digital line. Breadbox supports this
          — the pin numbers 14–19 work everywhere 0–13 work.
        </p>

        <Note>
          A4 and A5 are special: they're the hardware I²C bus
          (<code>SDA</code> and <code>SCL</code>). Avoid using them as
          general-purpose pins if any of your components use I²C
          (OLED displays, many sensors).
        </Note>
      </Section>

      <Section title="Not an output — analogRead only">
        <p className="text-sm leading-relaxed">
          Important: the analog pins are{" "}
          <strong className="text-foreground">input only</strong> in the
          analog sense. The Uno doesn't have a real DAC, so you can't
          write an arbitrary voltage to them. If you want analog-like
          output — a dimmed LED, a servo, a motor at half speed — you
          need a <Term k="pwm">PWM</Term>-capable digital pin and{" "}
          <Term k="analog-write">analogWrite()</Term>, which is a
          different feature despite the confusing name.
        </p>
      </Section>

      <SeeAlso
        refs={[
          "board/digital-pins",
          "board/pwm",
          "programming/analog-io",
          "electronics/voltage-dividers",
          "electronics/pwm",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}

// ── ADC visualizer ─────────────────────────────────────────────────────────
//
// Drag the voltage slider and see the analogRead() value and the
// corresponding 10-bit bin highlighted on a scale.

function AdcVisualizer() {
  const [voltage, setVoltage] = useState(2.5)
  const sliderId = useId()

  const adcValue = Math.min(1023, Math.round((voltage / 5) * 1023))
  const pct = voltage / 5

  return (
    <div className="mt-4 rounded-md border border-border bg-card p-4 space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor={sliderId} className="text-sm text-foreground">Input voltage on A0</label>
          <span className="font-mono text-sm text-foreground tabular-nums">{voltage.toFixed(2)} V</span>
        </div>
        <div className="relative h-2 rounded-full bg-secondary">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-500/60"
            style={{ width: `${pct * 100}%` }}
            aria-hidden
          />
          <input
            id={sliderId}
            type="range"
            min={0}
            max={5}
            step={0.01}
            value={voltage}
            onChange={(e) => setVoltage(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-valuetext={`${voltage.toFixed(2)} volts, analogRead returns ${adcValue}`}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>0 V</span>
          <span>5 V</span>
        </div>
      </div>

      {/* Result */}
      <div className="flex gap-3">
        <div className="flex-1 rounded border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground mb-1">analogRead() returns</p>
          <p className="font-mono text-2xl font-bold text-blue-400">{adcValue}</p>
        </div>
        <div className="flex-1 rounded border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground mb-1">Resolution step</p>
          <p className="font-mono text-sm text-foreground pt-1.5">≈ {(5 / 1023 * 1000).toFixed(1)} mV / step</p>
        </div>
      </div>

      {/* 10-bit scale bar */}
      <div aria-hidden>
        <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">0–1023 scale</p>
        <div className="relative h-4 rounded bg-secondary overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-blue-500/40 transition-all duration-75"
            style={{ width: `${(adcValue / 1023) * 100}%` }}
          />
          <div
            className="absolute inset-y-0 w-px bg-blue-400 transition-all duration-75"
            style={{ left: `${(adcValue / 1023) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-0.5">
          <span>0</span>
          <span>512</span>
          <span>1023</span>
        </div>
      </div>
    </div>
  )
}
