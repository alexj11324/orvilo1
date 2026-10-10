# MCP detail content presentation

Thirteen files remove direct antd-style imports from associated agent cards,
schema documentation, scoring, deployment content and overview tags. Shared
styles become Tailwind class maps. Existing component color props and inline
priority retain exact semantic or legacy CSS references. Data loading, schema
processing, score calculations and interaction handlers are unchanged.

The agent grid preserves the installed responsive.sm query exactly:
max-width: 575.98px, verified against the installed antd-style export. Score
sections retain first-of-type border/padding behavior and list-item margins.
Legacy gold, description/tertiary/quaternary colors and radius aliases remain
explicit, without new tokens or important modifiers.

Header/nav/link cascade and the description/platform important overrides remain
separate. Markdown and branded icons remain for the scheduled component phase.
Scoped checks and independent review are recorded on the PR. 未做真机验证；
no visual parity or Electron acceptance claimed. No stylesheet-string tests.
