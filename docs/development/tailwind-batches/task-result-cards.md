# Task result cards

Eight task result components and shared card primitives replace direct
antd-style imports with Tailwind utilities, local `cn`, and existing semantic
CSS variables. Cards preserve identifiers, assignee rows, status badges,
logical separators, truncation and markdown preview fading. Existing 4px chips
and 999px badges retain their geometry; the shared card radius keeps its exact
legacy variable pending the theme migration.

Status background washes, error borders and tertiary/quaternary text retain
exact legacy values rather than substituting non-equivalent subtle roles. The
markdown mask uses black only as the existing alpha mask, not a surface color.
Task detail toggles, result processing and goal polling/timing remain unchanged.

The goal intervention editor and shared Markdown/avatar components still need
migration. This batch does not claim removal of all transitive antd dependencies.
Scoped checks and independent review are recorded in the PR; source-string tests
are not added for pure styling. 未做真机验证；visual parity and Electron acceptance
are not claimed.
