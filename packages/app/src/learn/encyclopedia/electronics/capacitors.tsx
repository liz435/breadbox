// Electronics Fundamentals > Components > Capacitors

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function CapacitorsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "capacitors",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Capacitors"
        subtitle="Two plates, a gap, and a reservoir of charge — the component that smooths noisy power rails."
      />

      <Section title="What a capacitor does">
        <p className="text-sm leading-relaxed">
          A <Term k="capacitor" /> stores electric charge on two
          conducting plates separated by an insulator. Apply a
          voltage and current flows briefly as the plates charge up;
          once charged, the capacitor holds that voltage and passes
          no more DC current. Think of it as a tiny rechargeable
          battery with near-zero capacity but very fast reflexes.
        </p>
      </Section>

      <Section title="Units you'll see">
        <Table
          headers={["Prefix", "Value", "Typical use"]}
          rows={[
            ["pF (picofarad)", "10⁻¹² F", "RF, crystal load caps"],
            ["nF (nanofarad)", "10⁻⁹ F", "Filter, debounce"],
            ["µF (microfarad)", "10⁻⁶ F", "Decoupling, bulk filtering"],
            ["mF (millifarad)", "10⁻³ F", "Power supplies, large reservoirs"],
            ["F (farad)", "1 F", "Supercapacitors, memory backup"],
          ]}
        />
      </Section>

      <Section title="Polarized vs non-polarized">
        <p className="text-sm leading-relaxed">
          Ceramic capacitors (usually nF and small µF values) are
          non-polarized — orient them any way you like. Electrolytic
          capacitors (the cylindrical ones, typically ≥1 µF) are{" "}
          <em className="text-gray-200">polarized</em>: the longer
          lead is positive, and the can has a stripe marking the
          negative lead. Reverse them and they can fail dramatically.
        </p>

        <Warn>
          Back-powering a large electrolytic capacitor can make it
          swell, leak, or pop. When in doubt, double-check the
          stripe is on the ground side before you apply power.
        </Warn>
      </Section>

      <Section title="The decoupling cap">
        <p className="text-sm leading-relaxed">
          The single most common Arduino-world capacitor use is{" "}
          <em className="text-gray-200">decoupling</em>: one{" "}
          <code className="text-gray-200">0.1 µF</code> ceramic cap
          between VCC and GND, placed physically close to every IC.
          It acts as a tiny local reservoir that absorbs the fast
          current spikes a chip draws when its outputs switch,
          keeping those spikes from polluting the shared power rail.
          "0.1 µF near every chip" is a rule you should internalize.
        </p>

        <Note>
          Dreamer models capacitors as{" "}
          <em className="text-gray-200">visual-only</em>: they show
          up in the schematic and your netlist parses them, but the
          simulator doesn't run transient analysis, so they have no
          runtime behavior. Their job in a Dreamer sketch is
          documentation — when you build the circuit for real, put
          them in.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/resistors",
          "electronics/power",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
