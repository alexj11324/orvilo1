# Bare controls use the local primitives

Product surfaces use `Button`, `Input` and `Checkbox` from `@/components/ui/*` instead of raw `<button>`, `<input>` and `<input type="checkbox">`, so focus rings, disabled states and hit areas stay consistent. Inline clear and close controls are `Button size="icon-xs" variant="ghost"`, and text retry links are `Button variant="link"`.

`scripts/ci/nativeControlsAllowlist.json` caps the remaining debt per file. When you convert a control, lower that file's cap (or remove its entry) in the same change.
