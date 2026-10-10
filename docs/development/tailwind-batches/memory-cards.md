# Memory tool cards and search results: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577).

Migrate seven memory tool presentation files: shared card parts, context/experience/identity/preference/removal cards and search results. Preserve DOM, normalization, streaming and empty states, accordion defaults, content, callbacks and score calculations. Activity cards continue consuming the same shared style-object API.

Keep logical padding and borders, one-line clamping, 12/13/14px typography and original line heights. Existing 16px card rounding is retained explicitly; 6/8/12px roles use the existing input/card/overlay radius variables. Search results retain their last-child border exception. Inline padding still overrides shared section padding as before.

## Remaining dependencies

Keep exact `--ant-color-fill-quaternary`, `--ant-color-text-quaternary` and `--ant-color-text-tertiary` values under the owner's temporary-variable permission; owner: frontend owner, #577. Other colors use exact ThemeRoles aliases. StreamingMarkdown, global highlight/loading styles and their dependencies remain untouched. The global cascade flag stays OFF. This batch has no overlapping files with the separate memory Inspector migration #640.

## Verification

Scoped checks, existing view-model tests and independent review are reported against the implementation revision in the PR. No source-string CSS tests are added.

未做真机验证. Electron light/dark visual parity is not claimed. Individual environment gaps are recorded while independent work continues under owner instruction; normal CI and merge gates remain required.

`skeleton: no-change`
