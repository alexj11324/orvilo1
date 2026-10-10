# Acceptance themed controls

Continues #577 in comment reactions, author color selection and the checker dock. Reuses existing useIsDark from next-themes: AppTheme, ShareTheme and WorkbenchTheme already derive their legacy appearance from that same hook. No new theme provider, hook or dependency. Author palette strings retain the exact original --ant-\* variable names, hue order and light/dark steps (10/7); the hash and callback behavior stay unchanged.

Tailwind replaces static reactions/dock CSS while retaining active reaction borders, hover/open cues, inherited count color, timing tokens, embedded divider removal, grid sizing and warning ring colors. Status icon metadata now returns its existing CSS variable value directly. Existing status icon animation behavior is retained. DOM, editing state, mutations, errors, locale, picker data and actions stay unchanged.

Validation: scoped lint and related tests, existing author-color assertions retained without importing antd-style, and one independent light review before publication. 未做真机验证；no Electron/mobile visual parity or interaction acceptance claimed.
