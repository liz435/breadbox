// Electronics Fundamentals > Components > Voltage regulators

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Table,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"
import { Term } from "../../term"

export function VoltageRegulatorsPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "voltage-regulators",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Voltage regulators"
        subtitle="A chip that turns an unstable input voltage into a fixed, clean output."
      />

      <Section title="The job">
        <p className="text-sm leading-relaxed">
          A <Term k="voltage-regulator" /> takes whatever voltage
          you feed it (within its allowed input range) and
          produces a stable output at a fixed level. If your
          battery drifts from 9 V down to 7 V as it drains, the
          regulator still hands your logic circuit a rock-solid
          5 V. Without one, every chip on the board would have to
          tolerate the full range of the supply, which mostly
          they can't.
        </p>
      </Section>

      <Section title="Linear vs switching">
        <p className="text-sm leading-relaxed">
          There are two architectures in common use on a hobby
          bench. A <em className="text-gray-200">linear</em>{" "}
          regulator is the simple one: it behaves like a smart
          variable resistor that burns the extra voltage as heat.
          The 7805 (5 V) and the LM1117 (adjustable or fixed
          3.3 V / 5 V) are the classics. Linear regulators are
          cheap and quiet but inefficient — if the input is 12 V
          and the output is 5 V at 1 A, the regulator is
          dissipating 7 W as heat.
        </p>

        <p className="text-sm leading-relaxed">
          A <em className="text-gray-200">switching</em>{" "}
          regulator — often a <em>buck converter</em> for
          step-down duty — chops the input on and off at high
          frequency and filters the result with an inductor and
          capacitor. It's much more efficient (85–95%) but
          introduces a bit of electrical noise and costs more.
          The tiny "MP1584" or "LM2596" modules sold on
          hobbyist sites are switching regulators.
        </p>

        <Table
          headers={["Type", "Efficiency", "Noise", "Typical parts"]}
          rows={[
            ["Linear", "Low", "Very low", "7805, LM1117, AMS1117"],
            ["Switching (buck)", "High", "Moderate", "LM2596, MP1584, MP2307"],
          ]}
        />
      </Section>

      <Section title="On the Uno">
        <p className="text-sm leading-relaxed">
          The Uno itself carries two linear regulators. The main
          one turns VIN (barrel jack, 7–12 V) into a 5 V rail.
          A smaller regulator derives 3.3 V from that 5 V for
          the 3V3 pin. Both are linear, which is why powering
          the Uno from 12 V makes the main regulator noticeably
          warm under load. For high-current projects, supply 5 V
          directly to the 5 V pin from an external switching
          regulator and bypass the onboard linear one entirely.
        </p>

        <Note>
          Every linear regulator wants a small capacitor on its
          input and another on its output — check the datasheet.
          The 7805 is famously "three legs and two caps" to the
          point where people forget the caps are load-bearing.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "board/clock-power",
          "board/power-pins",
          "electronics/decoupling",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
