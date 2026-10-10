# Shared Style Rules

These apply across every surface.

## The component skeleton

Every surface file is the same shape, so internalize it once instead of re-deriving it per rule. The skeleton below bakes in five mechanical conventions — copy it and fill the body:

```tsx
'use client'; // (a) leaves of the chat tree must not block server rendering

import type { BuiltinInspectorProps, SearchQuery, UniformSearchResponse } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

// (b) type with BuiltinXProps<Args, State> — never widen to `any`.
//     Args = the JSON Schema params, State = the executor's `state` field;
//     they should match <Name>Params / <Name>State from types.ts.
export const SearchInspector = memo<BuiltinInspectorProps<SearchQuery, UniformSearchResponse>>(
  ({ args, pluginState }) => {
    const { t } = useTranslation('plugin'); // (c) all strings from the `plugin` namespace

    // (d) cross-cutting state (loading, streaming buffer) comes from the store,
    //     not props — props only carry args/state/messageId.
    // const buffer = useChatStore((s) => chatToolSelectors.streamingBuffer(messageId)(s));

    return <span>{t('builtins.<identifier>.apiName.search')}</span>;
  },
);
SearchInspector.displayName = 'SearchInspector'; // (e) name a memoized component
export default SearchInspector;
```

- Memoization is opt-in under the [React skill](../../../react/SKILL.md#render-performance-and-memoization), not a requirement for every tool surface.
- **(c)** Default an Inspector to `t('builtins.<identifier>.apiName.<api>')` so the row is non-empty while args stream in.
- **(d)** Read the store via Zustand selectors inside the component; see [streaming.md](streaming.md) for the buffer selector.

## Styling owner

Follow the [React skill's styling table](../../../react/SKILL.md#styling),
[role lookup](../../../react/SKILL.md#role-lookup) and
[layout mapping](../../../react/references/layout-kit.md). The React skill owns
component selection and class forms; [DESIGN.md](../../../../../DESIGN.md) owns
visual values. Tool surfaces follow those same owners.

For a new chip, use native markup and the approved roles:

```tsx
<span className="rounded-full bg-muted px-2 py-0.5 text-foreground">{label}</span>
```

Use local components and adapters in the order defined by React. Modals come from
`@/components/Modal`; follow the [modal skill](../../../modal/SKILL.md). Existing
legacy styles and genuinely dynamic values follow the React table's corresponding
rows; they are not a reason to start another style system in a new tool file.

## Stay single-layer — don't nest filled cards

The framework already wraps every Render / Intervention in a tool card. Keep the
outer wrapper flat (`py-1`), and use at most one filled box to delineate meaningful
content such as a Markdown preview, diff or code result. Labels, key–value fields,
question/answer text and chips stay flat, separated by spacing or a hairline divider.
A `bg-card` box can disappear against the surrounding card; use the existing
`bg-muted` content wash when that boundary needs to remain visible.

```tsx
// One visible content box inside a flat wrapper.
<div className="py-1">
  <div className="rounded-(--radius-card) bg-muted">{preview}</div>
</div>
```

For an icon/file/title header followed by one content box, reuse `ToolResultCard`
from `@orvilo/shared-tool-ui/components`. A deliberate outlined panel with a header
and list rows is also one surface; stacked decorative fills are not.
