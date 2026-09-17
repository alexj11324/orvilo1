/**
 * The stubbed children of the Home page.
 *
 * They live in their own module so `homeDashboard.test.tsx` can install its mocks
 * with `vi.mock` — which is hoisted above imports — instead of `vi.doMock` plus a
 * dynamic `await import('../index')` inside the test body.
 *
 * That difference is the whole point. With the import in the body, the entire Home
 * module graph is evaluated *within* `testTimeout`; measured at ~2.5–7s against a
 * 20s budget, it exceeded 20s in a broad run on a loaded machine and reported a
 * timeout that says nothing about the dashboard. `vi.mock` factories may be async,
 * so they can pull JSX-bearing stubs from here while the mocks stay hoisted.
 */
export const homeHeaderStub = {
  default: () => <div data-testid={'home-header'} />,
};

export const homeInboxStub = {
  default: () => <div data-testid={'home-inbox'} />,
};

export const homeModeContentStub = {
  default: ({ mode }: { mode?: string }) => (
    <div data-mode={mode} data-testid={'home-mode-content'} />
  ),
};

/**
 * Mirrors the real component: `InputArea` renders the shortcuts from the prop
 * alone (`InputArea/index.tsx:117` — `{showNewModelShortcuts && …}`) and never
 * inspects the mode. An earlier inline version of this stub ANDed in
 * `mode === 'chat'`, which invented a coupling the component does not have — and
 * the tests then asserted it, so the suite "confirmed" a difference that did not
 * exist. That false difference was the only argument against defaulting Home to
 * task mode.
 */
export const inputAreaStub = {
  default: ({
    mode,
    showNewModelShortcuts,
  }: {
    mode?: string;
    showNewModelShortcuts?: boolean;
  }) => (
    <div data-mode={mode} data-testid={'home-input-area'}>
      {showNewModelShortcuts && <div data-testid={'new-model-shortcuts'} />}
    </div>
  ),
};
