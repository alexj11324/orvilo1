# Project resource cards and library picker

Project resource cards and the add-library picker replace their direct
antd-style imports with Tailwind utilities. Border hover, card fill mixing, icon
surfaces, row hover and existing 10px/12px geometry remain explicit. Quaternary
fill retains its exact legacy CSS variable until shared theme migration.

Library loading/empty states, add/remove requests, confirmation, refresh, pending
states and navigation are unchanged. The external-link chips and link form are
separate migration work: anchor resets and the form's descendant button overrides
need their own cascade handling. No important modifiers or global switches are
introduced here.

Scoped checks and independent review are recorded on the PR. No source-string
tests are added for style conversion. 未做真机验证；visual parity and Electron
acceptance are not claimed.
