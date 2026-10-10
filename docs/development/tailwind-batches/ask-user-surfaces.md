# AskUserQuestion surfaces: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577).

Migrate the three shared AskUserQuestion presentation files, keeping all question, selection, free-text, keyboard, submission, expiry and result logic unchanged. Preserve chip sizing, logical spacing, text hierarchy and wrapping. Move the tab-list width and replace-all tab's logical start margin onto their existing local components; no DOM changes are needed.

The global cascade flag stays OFF. OptionCard and other shared-tool-ui styles remain outside this batch. No package or provider is removed.

## Remaining theme dependencies

Keep the exact existing `--ant-color-text-tertiary`, `--ant-color-text-quaternary` and `--ant-color-fill-quaternary` variables under the owner's temporary-variable permission. They have no exact local semantic alias; owner: frontend owner, #577. Do not collapse these tones into muted-foreground. Existing secondary text and fill aliases are verified against ThemeRoles.

## Verification

Scoped checks and independent review are reported against the implementation revision in the PR. Existing form-hook, normalization and result tests cover the shared behavior; no source-string CSS tests are introduced.

未做真机验证. Electron light/dark visual parity remains unverified. The owner authorized advancing independent work while recording environment gaps; normal CI and merge gates stay required.

`skeleton: no-change`
