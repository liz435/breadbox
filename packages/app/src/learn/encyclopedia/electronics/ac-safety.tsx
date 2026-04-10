// Electronics Fundamentals > Practical > Safety around AC and high current

import {
  LearnLayout,
  PageTitle,
  Section,
  Note,
  Warn,
  PrevNextFooter,
  SeeAlso,
} from "../../encyclopedia-layout"
import { ENTRIES } from "../../encyclopedia-catalog"

export function AcSafetyPage() {
  const entry = ENTRIES.find(
    (e) => e.track === "electronics" && e.slug === "ac-safety",
  )!

  return (
    <LearnLayout>
      <PageTitle
        title="Safety around AC and high current"
        subtitle="Dreamer stops at 5 V DC on purpose. Your first project switching mains voltage should not be a solo one."
      />

      <Section title="Why 5 V DC is friendly">
        <p className="text-sm leading-relaxed">
          Everything you do in the Dreamer editor is a small
          amount of direct current at 5 V or less. At those
          voltages, your skin resistance is high enough that
          even if you touch a bare wire it's uncomfortable at
          worst. Shorting the 5 V rail to ground makes a spark
          and maybe releases magic smoke from a component, but
          it won't hurt you. This is what "beginner-safe"
          actually means.
        </p>
      </Section>

      <Section title="Mains AC is a different world">
        <p className="text-sm leading-relaxed">
          Mains AC — 120 V in North America, 230 V in most of
          the rest of the world — crosses the threshold where
          a fault becomes a threat to your life, your house, or
          both. A shock from mains can stop your heart. A
          short on mains can start a fire in the wiring inside
          a wall before you notice anything is wrong. The
          techniques that kept you safe on a breadboard at 5 V
          do not scale up.
        </p>

        <Warn>
          Do not prototype mains AC on a breadboard. Do not
          make your own mains power cables. Do not run mains
          wires next to low-voltage signal wires. Do not work
          on a mains project alone the first time you try one.
        </Warn>
      </Section>

      <Section title="The safer path">
        <p className="text-sm leading-relaxed">
          When a project genuinely needs to switch a lamp or an
          appliance, use a pre-built relay module rated and
          certified for the voltage and current you need. Look
          for a UL, CSA, or CE marking on the module and on
          the enclosure. Put every exposed mains terminal
          inside a grounded enclosure before you plug the
          thing in. Better yet, let the 5 V side drive a smart
          plug — an off-the-shelf, certified device that lives
          in a sealed mains-rated case and talks to your
          Arduino over Wi-Fi or radio. Your project gets to
          switch the load without you building a mains circuit
          at all.
        </p>

        <Note>
          High-current DC has its own hazards even below mains
          voltage — a 12 V car battery can weld a screwdriver
          to a wrench. "Low voltage" and "low current" are not
          the same thing. See the current limits page.
        </Note>
      </Section>

      <SeeAlso
        refs={[
          "electronics/relays",
          "electronics/beginner-mistakes",
          "electronics/current-limits",
        ]}
      />

      <PrevNextFooter entry={entry} />
    </LearnLayout>
  )
}
