# User-visible copy conventions

Conventions for strings that users can read in the product (locale values under
`packages/locales/src/default/` and `locales/`). Terminology decisions below are
owner-approved — apply them when adding or editing copy.

## Terminology

- **Orvilo AI** is the built-in engine. The word "Prime" never appears in
  user-visible copy — not in body text, small print, button labels, or runtime
  pickers.
- **No protocol jargon**: users connect agents, not transports. Write "Connect an
  agent", never "Connect an ACP agent"; avoid "CLI", "ACP", "daemon" (say
  "helper") and similar internals.
- **Connect/import surfaces list only installed runtimes.** If a CLI is not
  detected on the device, it does not appear in the UI — do not render
  "Show N not installed" disclosures.
- **Execution targets stay terse**: "Local", not "Local process". On desktop the
  local device resolves unconditionally — "No connected device is online" is a
  bug, not a reachable state.
- Group supervision is run by the **group host** (not "orchestrator").

## zh-CN

- Agent entity = **智能体** — never 助手 or 代理 in product copy.
- Second person = **你** — never 您.
- Domain nouns match en usage: 智能体 / 设备 / 连接器 / 工作区 / 凭证.

## English

- US spelling (canceled, canceling).
- Sentence case on labels and titles ("Not installed", "Job title").
- No `(s)` plural hacks — when `count` is interpolated, add the i18next
  `_one`/`_other` key variants instead (zh needs only the base key).
- Ellipsis is the single-glyph `…`, not three periods.

## Errors

User-facing error surfaces render localized copy, not raw exception text.
`normalizeAsyncError` plus the `error:response.<status>` keys cover HTTP
statuses; `connectErrorMessage` in `src/features/ConnectAgent` shows the
pattern: localized headline + raw detail appended as secondary text.

## Dead keys

Remove keys whose call sites are gone — they mislead translators and bloat
every locale file. Check `rg "'<key>'" src/` (and the `t('…')` spelling)
before deleting; delete from `packages/locales/src/default/*.ts` and every
`locales/*/<ns>.json`. Whole dead namespaces (like the retired `taskTemplate`
one) are deleted as files. `defaultKeys.test.ts` keeps en-US/zh-CN key sets
in lockstep with the default sources, including `_one`/`_other` plural
siblings.
