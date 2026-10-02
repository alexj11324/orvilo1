# Upstream brand asset removal

The product ships under the Orvilo mark only. This note records the sweep that
removed every upstream (lobehub) logo, mascot avatar, and marketing asset that
was still shipped or reachable, and what remains as a functional dependency.

## Removed

| Asset / code path                                                      | Was                                                                                                                                   | Now                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/avatars/agent-default.png`                                     | lobehub robot head, rendered as `DEFAULT_AVATAR` for every agent without a custom avatar                                              | `DEFAULT_AVATAR = ''` — the `Avatar` component falls back to name initials                                                                                       |
| `public/avatars/orvilo-ai.png`, `agent-builder.png`, `doc-copilot.png` | lobehub mascot variants used as builtin agents' avatars                                                                               | inbox → `/app-icons/icon-512x512.png`; task-agent `⚡`, verify `✅`, web-onboarding `🧭`, agent-builder `🛠️`, group-builder `🏗️`, page-agent `📄` (native emoji) |
| `public/screenshots/` (10 PNGs)                                        | verbatim LobeChat marketing shots ("LobeChat — Built for you, the Super Individual") wired into the PWA manifest behind a dead branch | files deleted; `manifest.ts` emits `screenshots: []`                                                                                                             |
| `ModelSelect` `ProviderItemRender` (`provider === 'orvilo'`)           | `LobeHub.Morden` mascot icon                                                                                                          | `ProductLogo type="flat"`, matching `ProviderMenu/Item`                                                                                                          |
| `apps/desktop/src/overlay/Avatar.tsx`                                  | `@lobehub/fluent-emoji` 3D renderer for emoji avatars                                                                                 | native emoji text span, matching the web `Avatar`; dependency removed from `apps/desktop/package.json`                                                           |
| `ProductLogo`, `OrgBrand`, `BrandWatermark`, `BrandTextLoading`        | `LobeHub`/`LobeHubText`/`BrandLoading` wordmark components behind `isCustomBranding`/`isCustomORG` dead branches                      | branches deleted; the custom path is unconditional                                                                                                               |

## Regression guard

`src/components/Branding/brandAssets.test.ts` asserts:

- no assets under `public/avatars/` or `public/screenshots/`,
- `DEFAULT_AVATAR` is the empty initials fallback,
- every builtin agent avatar is an emoji, `/app-icons/…`, or an https URL,
- the edited brand components contain no upstream logo imports or literals.

## Left in place deliberately

- `@lobehub/ui` / `@lobehub/icons` — component dependencies, not rendered
  branding. The `EmojiPicker` wrapper already nulls its lobehub `defaultAvatar`.
- `registry.npmmirror.com` CDN URLs for `pdfjs-dist` and
  `@lobehub/assets-fileicon` — file-type icons and PDF internals, not product
  branding.
- `@lobehub/agents-index` / `@lobehub/plugins-index` URLs in `packages/env` —
  marketplace data indexes. Repointing them is a product decision, not a logo
  swap; flagged for a separate change.
- "lobehub" mentions in code comments documenting API parity, and the type-only
  `LobeChatProps` import in `Branding/ProductLogo/Custom.tsx` — neither renders.
