---
name: modal
description: 'Use for modals, dialogs and confirmations with createModal, confirmModal, ModalHost or the local modal APIs.'
user-invocable: false
---

# Modal Imperative API Guide

## Recommended: `@/components/Modal`

New code uses the **local modal stack** (built on `ui/dialog` + `ui/alert-dialog`), which mirrors the old lobehub base-ui API 1:1:

- `createModal`, `confirmModal`, `ModalHost`, `Modal`, `ModalFooter` from `@/components/Modal`
- `useModalContext` from `@/components/Modal` inside modal **content**
- Types: `ModalInstance`, `ImperativeModalProps`, `ModalConfirmConfig`, `ModalContextValue`, `BaseModalProps`

Body slot: pass **`content`** (or `children`; runtime uses `content ?? children`).

### Global `ModalHost` (required)

`createModal` renders through the app-level **`ModalHost`** from `@/components/Modal`, already mounted once near the root in `SPAGlobalProvider` and every app shell (Auth, Share, Workbench). Without it, `createModal` calls will not appear. The lobehub base-ui host stays mounted until remaining legacy call sites migrate.

### Why imperative?

| Mode        | Characteristics                      | Recommended |
| ----------- | ------------------------------------ | ----------- |
| Declarative | `open` state + `<Modal />`           | ❌          |
| Imperative  | Call `createModal()`, no local state | ✅          |

### File structure

```
features/
└── MyFeatureModal/
    ├── index.tsx            # export createXxxModal
    └── MyFeatureContent.tsx # modal body
```

### 1. Content (`MyFeatureContent.tsx`)

```tsx
'use client';

import { useModalContext } from '@/components/Modal';
import { useTranslation } from 'react-i18next';

export const MyFeatureContent = () => {
  const { t } = useTranslation('namespace');
  const { close } = useModalContext();

  return <div>{/* ... */}</div>;
};
```

### 2. `createModal` (`index.tsx`)

```tsx
'use client';

import { createModal } from '@/components/Modal';
import { t } from 'i18next';

import { MyFeatureContent } from './MyFeatureContent';

export const createMyFeatureModal = () =>
  createModal({
    content: <MyFeatureContent />,
    footer: null,
    maskClosable: true,
    styles: {
      content: { overflow: 'hidden', padding: 0 },
    },
    title: t('myFeature.title', { ns: 'setting' }),
    width: 'min(80%, 800px)',
  });
```

### 3. Usage

```tsx
import { createMyFeatureModal } from '@/features/MyFeatureModal';

const handleOpen = useCallback(() => {
  createMyFeatureModal();
}, []);

return <Button onClick={handleOpen}>Open</Button>;
```

### i18n

- **Content**: `useTranslation` in components.
- **`createModal` options**: `import { t } from 'i18next'` where hooks are unavailable.

### `useModalContext`

```tsx
const { close, setCanDismissByClickOutside } = useModalContext();
```

`setCanDismissByClickOutside(false)` maps to `maskClosable: false` — backdrop clicks stop dismissing; Escape still works.

### Closing: which callback actually fires

`close()` — from `useModalContext()` inside the content, or from the returned
`ModalInstance` — only flips the stack entry to `open: false`. It does **not** go
through the dismissal path, so:

| callback               | user dismissal (Esc / backdrop / header ✕) | `close()` from content or instance |
| ---------------------- | ------------------------------------------ | ---------------------------------- |
| `onOpenChange`         | fires                                      | **does not fire**                  |
| `onOpenChangeComplete` | fires with `false`                         | fires with `false`                 |

Put caller-side cleanup (clearing an editing flag, resetting the provider's
`open` state) on **`onOpenChangeComplete`**. Wiring it to `onOpenChange` looks
correct until a footer button closes the modal, and then the caller never learns
it went away — typically leaving a flag set so the modal cannot be reopened.

`createModal` only ever completes with `false` (the imperative renderer supplies
the argument itself), but still guard on it — other primitives such as
`DropdownMenu` do report both directions:

```tsx
onOpenChangeComplete: (open) => {
  if (!open) onClosed?.();
},
```

`ModalInstance` methods: `update(props)` merges props in place; `close()` animates out then removes; `destroy()` removes immediately.

### Common options

`ImperativeModalProps` builds on `BaseModalProps`: `title`, `width`, `maskClosable`, `open`, `onOpenChange`, `footer`, `styles` / `classNames` (keys: `backdrop`, `popup`, `header`, `title`, `close`, `content`, `footer`).

| Property       | Notes                                     |
| -------------- | ----------------------------------------- |
| `content`      | Main body (preferred name vs `children`)  |
| `maskClosable` | Click outside to dismiss (default true)   |
| `styles.*`     | Semantic regions mapped onto dialog parts |

Declarative `Modal` additionally supports `onCancel`, `onOk`, `okText`/`cancelText`, `okButtonProps`/`cancelButtonProps`, `confirmLoading`, `closable`, `keyboard`, `loading`, `zIndex`, `afterClose`/`afterOpenChange`, and a `footer` render-function form.

### Confirm

```tsx
import { confirmModal } from '@/components/Modal';

confirmModal({
  title: '…',
  content: '…',
  okText: '…',
  cancelText: '…',
  okButtonProps: { danger: true }, // → destructive variant
  onOk: async () => {},
});
```

Async `onOk` shows a spinner on the OK button, closes on resolve, stays open on reject. `okText`/`cancelText` default to the common i18n keys.

---

## Legacy: `@lobehub/ui` / `@lobehub/ui/base-ui`

Older call sites import `createModal`/`confirmModal`/`useModalContext`/`ModalHost` from `@lobehub/ui/base-ui` (same API — migration is an import-path swap to `@/components/Modal`), or from `@lobehub/ui` root (typed as **antd `Modal` props**: `children`, `allowFullscreen`, `getContainer`, `destroyOnHidden`, `styles.body`). Prefer the local stack for new work.

## Examples

- `@/components/Modal` (preferred): `createMyFeatureModal` above; host mounted in `SPAGlobalProvider`.
- Legacy: `src/features/SkillStore/index.tsx`, `src/features/LibraryModal/CreateNew/index.tsx`
