// Placeholder rendered for any encyclopedia entry whose status is
// still "planned". Every unshipped entry points here. When someone
// types the URL manually (or the sidebar is shown with
// ?showPlanned=1), they get a friendly "coming soon" page instead of
// a React render error.

import { LearnLayout, PageTitle, Section, Note } from "../learn-layout"

export function PlannedPage() {
  return (
    <LearnLayout>
      <PageTitle
        title="Coming soon"
        subtitle="This page is on the roadmap but hasn't been written yet."
      />
      <Section title="Why am I seeing this?">
        <p className="text-sm leading-relaxed">
          The encyclopedia is being built incrementally. This entry is
          registered in the catalog so the sidebar and cross-links can
          land first, but the content is still pending.
        </p>
        <Note>
          Track progress in{" "}
          <code className="text-foreground">
            packages/app/src/learn/ENCYCLOPEDIA_TODO.md
          </code>
          .
        </Note>
      </Section>
    </LearnLayout>
  )
}
