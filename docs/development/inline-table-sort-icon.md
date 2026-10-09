# InlineTable sort icon and nullable `cx` inputs

antd-style's `cx` throws on `null` (`Cannot use 'in' operator to search for 'styles' in null`),
unlike `cn`, which tolerates falsy values. `InlineTable` previously passed
`column.sortOrder && 'active'` to `cx`; `UsageTable` supplies `sortOrder: null`, which crashed
Settings > Statistics.

`sortIconActiveClass` (`src/components/InlineTable/sortOrder.ts`) always returns `'active' | false`,
so the call can never receive `null`. Rule: never pass a possibly-`null` value as a `cx` operand;
coerce it to a boolean first or use `cn`.
