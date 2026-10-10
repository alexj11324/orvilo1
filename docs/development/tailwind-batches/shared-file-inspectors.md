# Shared local file inspectors

Nine shared command/file Inspectors replace direct antd-style imports with local
`cn`, Tailwind utility strings and existing semantic status colors. Their factory
interfaces, streaming labels, file-path selection, counts and result handling
remain unchanged. Command chips preserve their geometry and monospace font;
description and quaternary text retain their exact legacy variables pending the
shared theme migration.

Grep and glob inspectors keep baseline alignment through the root's public inline
style. Their shared inspector root still emits an unlayered center alignment, so
a layered `items-baseline` utility alone would lose the former composed override.
No global layer switch or important modifier is used. Shared file-path, highlight
and shimmer components still require migration.

Scoped checks and independent review are recorded on the PR. No source-string
tests are added for pure styling. 未做真机验证；visual parity or Electron acceptance
is not claimed, including the desktop runtime that actually executes local tools.
