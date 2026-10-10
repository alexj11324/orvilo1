# Task tool inspectors

All fourteen task Inspector components now use Tailwind utility strings and the
local `cn` helper instead of direct antd-style imports. Task identifiers, assignee
chips, status labels, schedules, deletion markers and streaming summaries retain
their existing layout, truncation, logical spacing and 999px pill geometry.

Foreground, secondary text, accent fill and status foregrounds use the existing
semantic bridge. Status background washes, error borders and tertiary/quaternary
text retain their exact legacy CSS variables until the shared theme migration;
these are not interchangeable with the new subtle status roles.

Task execution, assignment, status transitions, translations and data handling
are unchanged. Shared inspector and shimmer styles still require migration; this
batch does not remove every transitive antd dependency. No source-string tests
are added for this style conversion. Scoped checks and independent review are
recorded on the PR. 未做真机验证；visual parity and Electron acceptance are not
claimed.
