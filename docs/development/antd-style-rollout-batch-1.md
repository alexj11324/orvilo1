# antd-style rollout: ChatInput controls, batch 1

Status: **draft, not ready to merge**. Base: canary `8af979848`.
Tracks #577. This is a local migration batch, not completion of phase 1
or the historical \~160-file cascade audit.

## Changes

- Keep `ANTD_STYLE_LAYER_ENABLED = false`. Runtime and production precompilation
  preserve the existing unlayered default. Explicit layer support remains available
  for isolated experiments; enabling it globally is a separate deferred rollout.
  Regression tests exercise default runtime initialization and a real in-memory
  Vite fixture build, while retaining the explicit-layer tests.
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

- The original global-ON candidate reported lint and 26 related tests passing.
  Its default-layer assertions are historical; the corrected tests verify an
  unlayered default cache and Vite build instead. The explicit-layer tests remain.
- The corrected default-OFF runtime/build assertions fail on the prior ON source:
  2 failed, 21 passed. Restoring OFF passes all 23 tests in those same two existing
  files with one worker and a 768 MiB heap cap. The build is a real in-memory Vite
  fixture, not a full application build or a screenshot/source-string test.
- Independent light review identified open/warning class order and Button
  line-height regressions; both were corrected.
- Supplemental Chromium fixtures compared 230 style/state/theme cases using the
  installed Lobe base token configuration and actual Button variant classes.
  Differences are the zero-width trigger border's unused color and the approval
  Button's primitive hover/expanded foreground becoming effective when the old
  unlayered base text rule is removed. These fixtures are not application or
  Electron acceptance and do not establish whole-page visual equivalence. They ran
  with the global switch ON and do not validate the current OFF composition.
- **未做真机验证**. No Electron, local CLI execution, shell creation or real device
  interaction was exercised. The local OFF batch still requires fresh Electron
  light/dark acceptance; no global enablement is delivered by this batch.

The global-switch review identified an untouched consumer: WorkingDirectoryPicker's
`chooseFolderItem` relies on unlayered Emotion constraints such as full width, auto
height, start alignment and padding over Button utilities. Layering every remaining
consumer changes that precedence beyond these 11 converted files. Keeping the shared
default OFF preserves its current constraints without reverting the local migration.

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
- Accept the local OFF batch with Electron light/dark checks of migrated controls
  and their untouched neighbors. Finish the remaining cascade audit in separate
  small feature batches before any global switch-on acceptance. Do not remove theme providers,
  dependencies or layer infrastructure; stages 2–6 remain outstanding.
