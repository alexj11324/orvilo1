# antd-style rollout: ChatInput controls, batch 1

Status: **draft, not ready to merge**. Base: canary `8af979848`.
Tracks #577. This is a partial prerequisite rollout, not completion of phase 1
or the historical \~160-file cascade audit.

## Changes

- Enable `ANTD_STYLE_LAYER_ENABLED` for the candidate. Runtime and production
  precompilation read the same switch. Regression tests exercise both the default
  runtime initialization and a real Vite build, rather than only the opt-in helper.
- Replace style objects in 11 ChatInput files with Tailwind classes. Preserve
  component structure, callbacks, data access, strings and skeletons.
- Keep selected/open classes last when replacing specificity-boosted `&&` rules
  with `cn`. Keep the Button's existing small-text line-height when its font-size
  class is merged away (the 11px reconnect label still uses the existing relative
  `--text-xs--line-height`, not a newly rounded line-height).
- Preserve transition declarations with arbitrary-property utilities; this batch
  does not introduce named animations or change the reduced-motion policy.

`skeleton: no-change`

### Converted files (under src/features/ChatInput)

- `ControlBar/ApprovalMode.tsx`
- `ControlBar/HeteroControlBar/QuotaMenu/CodexQuotaMenu.tsx`
- `ControlBar/HeteroControlBar/QuotaMenu/QuotaAccountIdentity.tsx`
- `ControlBar/HeteroControlBar/index.tsx`
- `ControlBar/HeteroDeviceSwitcher.tsx`
- `ControlBar/ModeSelector.tsx`
- `ControlBar/StaleGitSnapshot.tsx`
- `ControlBar/gitChipStyles.ts`
- `ControlBar/index.tsx`
- `components/SelectorTrigger.tsx`
- `components/buildSelectorSubmenu.tsx`

No descendants were moved and no DOM was added. Arbitrary descendant variants
retain the existing secondary-label hover, workspace-label container query and
hidden scrollbar selectors. Named `runtimebar` container queries retain the
original 600px/720px boundaries.

## Temporary variable references

The owner explicitly authorized Tailwind references to original CSS variables
where no semantic mapping exists. This permission preserves the value; it does
not create a new token or authorize substituting a similar color.

This batch retains the existing `--ant-color-*` variables for tertiary/quaternary
and description text, split borders, quaternary fill, status backgrounds, status
borders and status text. Status color-mix expressions retain their original 55%
amount. Logical border shorthands retain the existing secondary border variable.
Owner: frontend owner, #577. These are temporary theme dependencies, not final
exceptions authorizing package removal. `CodexQuotaMenu` still imports `cssVar`
for its untouched inline styles; the other ten files no longer import antd-style.

## Counts

These counts use this PR's canary base, not the owner's separate integration
branch. Package manifests are unchanged.

| Check (src, packages, apps unless specified)    | Base | Candidate |
| ----------------------------------------------- | ---: | --------: |
| Files matching `from 'antd-style'`              | 1305 |      1295 |
| Files containing `createStaticStyles`           |  947 |       936 |
| Files directly importing `antd` or its subpaths |   25 |        25 |
| Files importing `@lobehub/ui` or its subpaths   |  308 |       308 |
| `.ant-*` lines in src TS/TSX                    |   95 |        95 |
| `!important` lines in src TS/TSX/CSS            |  191 |       191 |

## Verification and limits

- Scoped repository check: lint and 26 related tests passed, including the actual
  default-cache initialization and layered Vite build.
- Independent light review identified open/warning class order and Button
  line-height regressions; both were corrected.
- Supplemental Chromium fixtures compared 230 style/state/theme cases using the
  installed Lobe base token configuration and actual Button variant classes.
  Differences are the zero-width trigger border's unused color and the approval
  Button's primitive hover/expanded foreground becoming effective when the old
  unlayered base text rule is removed. These fixtures are not application or
  Electron acceptance and do not establish whole-page visual equivalence.
- **未做真机验证**. No Electron, local CLI execution, shell creation or real device
  interaction was exercised. The global flag must not merge on this evidence.

## Remaining rollout blockers

- Reconstruct and finish the historical cascade audit. The \~160 figure is a
  static lower-bound estimate, not a checklist completed by this batch. Unfixed
  examples include the working-directory/branch/worktree pickers, ChatTerminal
  tabs, ModelSelect badges, menu rows and Issue/settings controls.
- Issue detail and Settings/provider remain untouched while #589, #598, #601,
  \#602, #603, #605 and the integration PRs are open. ChatInput ActionBar, also
  touched by #589/#608, is excluded. Check their live state before continuing.
- `QuotaMenu.tsx` is excluded: a mechanical conversion exposes its existing
  native-button `appearance: none` to the native-controls gate. Replacing that
  control is a separate component change, not part of this batch. An exploratory
  check including it also encountered a missing local `@orvilo/agent-runtime`
  workspace link; the final scoped check does not include that excluded file.
- Branch/worktree pickers retain animations and third-party input selectors;
  CloudRepoSwitcher retains a raw white foreground requiring a role decision.
- Finish fixes in small feature batches, then run Electron light/dark acceptance
  before marking the global rollout ready. Do not remove theme providers,
  dependencies or layer infrastructure; stages 2–6 remain outstanding.
