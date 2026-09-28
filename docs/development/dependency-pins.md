# Dependency Pins

Temporary exact-version pins applied when an upstream release is broken and every
CI consumer must stay on the last known-good build.

| Package                      | Pinned  | Reason                                                                                                                                                                                    | Unpin when                                                                                                                |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@hugeicons/core-free-icons` | `4.3.3` | `4.3.4` (2026-09-18) ships an esm index re-exporting `Grid2x2*`/`Grid3x2*` files that exist on disk only as `Grid2X2*`/`Grid3X2*` — every vitest import fails on case-sensitive Linux CI. | Upstream republishes a build whose esm index matches its file names; verify locally and in CI before restoring the caret. |

Rules for entries here:

- Pins are always exact versions in `package.json` (the repo has no committed
  lockfile — the spec is the only resolution input).
- A pin must cite the broken version, the failure signature, and the unblock
  condition so it does not fossilize.
- Removing a pin is a functional change: CI must be green on the unpin PR.
