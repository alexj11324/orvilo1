# Implementation pitfalls

Traps that recurred while aligning Orvilo's UI. Each one passed lint and unit tests and was only visible in the running app.

## Existing adapter and retained-component pitfalls

- **Retained antd-backed internals can reset CSS variables.** An existing adapter may redeclare `--ant-color-text` on its css-var class, so ancestor overrides may not reach it. Inspect the actual rendered node and token mapping before fixing it. This is a diagnostic for existing internals; component selection and imports follow **react**, and visual values follow **DESIGN.md**.
- **Historical DatePicker hover failure:** an antd-backed picker with `allowClear` faded its suffix icon. Check the current local `@/components/DatePicker` API and actual hover state; disable clearing only when appropriate to the requested behavior.
- **Use local `@/components/ActionIcon`.** Follow the **react** owner for all component/import choices; a retained primitive library is not a reason to bypass a current local adapter.
- **Wrappers must not create a box.** A wrapper that only mutes interaction (a disabled trigger, a tooltip anchor) must use `display: contents` or be the row itself. An inline wrapper shrinks a child's `width: 100%` to its content, and a centering parent then moves it.

## Tests

- happy-dom has no layout. Alignment, clipping, and occlusion can only be asserted by a real-browser probe.
- For style/layout failures, capture a meaningful real-runtime geometry or interaction regression where practical. Follow **AGENTS.md**: do not force a `.test.ts` that mirrors stylesheet strings or extract a shared style module solely to assert a CSS literal. Test-runner and file-placement rules belong to **testing**.
- `bun run check` runs only the tests it considers related. Read the test count, and run consumers' existing tests explicitly when a shared component changes.

## Git in shared worktrees

- Commit with a pathspec (`git commit -- <paths>`); other agents may have staged files in the same worktree.
- lint-staged can reject a commit while the shell continues. Read `git log -1` after every commit, and push as a separate step.
- After a pathspec commit, lint-staged can leave an `MM` entry whose index copy is stale. If `git diff HEAD -- <file>` is empty, `git restore --staged <file>`.
- In zsh, pass several paths as an array (`"${paths[@]}"`); an unsplit string reaches the tool as one path and checks nothing.
