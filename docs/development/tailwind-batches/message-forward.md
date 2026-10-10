# Message forwarding presentation

The selection circle, selection footer, message forwarding dialog and topic
forwarding dialog replace direct antd-style imports with Tailwind utilities.
Selection, recipient filtering, notes, forwarding payloads, deletion confirmation
and Escape handling remain unchanged. Existing DOM and logical geometry remain.

Exact legacy tertiary/quaternary colors, large-radius variable and motion curve
remain explicit pending the shared theme migration. Selected row hover still uses
the original stronger hover fill. The message-note textarea keeps its transparent
background in dark mode and disabled variants, matching the former unlayered rule.

MessageSelectionWrapper remains separate: its important overrides of descendant
message alignment need their own cascade migration. SelectToHereButton also stays
separate because its unlayered background and shadow override button states. This
batch adds no important modifiers and does not switch global layers.

Scoped checks and independent review are recorded on the PR. 未做真机验证；no
visual parity or Electron acceptance is claimed. No source-string tests are added.
