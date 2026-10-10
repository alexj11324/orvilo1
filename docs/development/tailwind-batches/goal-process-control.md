# Goal process and metric presentation

Nine AgentGoals files remove direct antd-style imports: Activity, Deliverables,
Findings, Frontier, process sections/shared glyphs, expanded experiment groups,
north-star metrics and sparklines. Existing controls, expansion, navigation,
artifact safety checks, decision submission and metric calculations are unchanged.

Sibling attempt separators use `[&+&]` variants, retaining the first-row exemption
without changing DOM. Arrow and dimming transitions retain their original ease
curves; keyboard outlines and logical insets remain. Palette kind colors retain
exact legacy numbered variables verified against the installed cssVar exports.
Tertiary/quaternary fills, legacy radii and existing 12px graph-frame/2px marker
geometry remain explicit until their respective shared theme migrations.

The graph canvas/node covers and create-goal form remain separate because of
third-party selectors, animations and editor padding overrides. No important
modifiers or global layer switches are introduced. Scoped checks and independent
review are recorded on the PR. 未做真机验证；no visual parity or Electron
acceptance claimed. No source-string tests are added.
