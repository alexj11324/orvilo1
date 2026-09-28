# Implementation pitfalls

Traps that recurred while aligning Orvilo's UI. Each one passed lint and unit tests and was only visible in the running app.

## Styling on antd and lobehub

- **antd resets CSS variables on its own components.** Each antd component redeclares `--ant-color-text` on its css-var class, so overriding the variable on an ancestor does not reach it. Style the text nodes directly: `[aria-haspopup]` (the base-ui Select trigger), `.ant-select-selection-item`, `.ant-picker-input > input`, or a `data-*` hook you add.
- **The lobehub `DatePicker` defaults to `allowClear`.** With a clear button, antd fades the suffix icon on hover, so the calendar glyph vanishes. Pass `allowClear={false}` explicitly.
- **`ActionIcon` is lint-restricted from `@lobehub/ui`.** Import it from `@lobehub/ui/base-ui`.
- **Wrappers must not create a box.** A wrapper that only mutes interaction (a disabled trigger, a tooltip anchor) must use `display: contents` or be the row itself. An inline wrapper shrinks a child's `width: 100%` to its content, and a centering parent then moves it.

## Tests

- happy-dom has no layout. Alignment, clipping, and occlusion can only be asserted by a real-browser probe.
- For a style fix, move the rule into a shared style module and assert its invariant in a `.test.ts`. Show the test failing on the old value before keeping it. The repository does not accept new component-level `.test.tsx` files for this.
- `bun run check` runs only the tests it considers related. Read the test count, and run consumers' existing tests explicitly when a shared component changes.

## Git in shared worktrees

- Commit with a pathspec (`git commit -- <paths>`); other agents may have staged files in the same worktree.
- lint-staged can reject a commit while the shell continues. Read `git log -1` after every commit, and push as a separate step.
- After a pathspec commit, lint-staged can leave an `MM` entry whose index copy is stale. If `git diff HEAD -- <file>` is empty, `git restore --staged <file>`.
- In zsh, pass several paths as an array (`"${paths[@]}"`); an unsplit string reaches the tool as one path and checks nothing.
