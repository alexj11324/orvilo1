import { nativeCodeDocumentChange } from '../../NativeEditorKit/codeDocumentChange';
import { loadProfessionalCodeKernel, type ProfessionalCodeOptions } from './kernel';

const semanticTheme = {
  '&': { color: 'var(--foreground)', backgroundColor: 'var(--background)' },
  '.cm-scroller': { fontFamily: 'var(--orvilo-font-family-code)' },
  '.cm-gutters': { color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--selected)' },
};
export interface CodeBlockCallbacks {
  onBlur: () => void;
  onBoundary: (direction: 'before' | 'after') => void;
  onChange: (value: string) => void;
  onFocus: () => boolean | void;
  onKeyDown: (event: KeyboardEvent) => void;
  onUndoBoundary: () => void;
}

/** One professional code-block island; no external CM classes cross this boundary. */
export async function mountProfessionalCodeBlock(
  host: HTMLElement,
  options: ProfessionalCodeOptions,
  callbacks: CodeBlockCallbacks,
  dark: boolean,
  signal: AbortSignal,
) {
  const constructor = await loadProfessionalCodeKernel();
  if (signal.aborted) return;
  const instance = constructor(host, options);
  let disposed = false;
  let externalUpdate = false;
  const applyTheme = (nextDark: boolean) => {
    instance.view.dispatch({
      effects: instance.optionHelper.theme.reconfigure(
        instance.view.constructor.theme(semanticTheme, { dark: nextDark }),
      ),
    });
  };
  applyTheme(dark);
  const listeners = {
    change: () => {
      if (!externalUpdate) callbacks.onChange(instance.getValue());
    },
    focus: () => {
      if (callbacks.onFocus() === false) instance.blur();
    },
    blur: () => callbacks.onBlur(),
    keydown: (_instance: unknown, event?: Event) => {
      if (event instanceof KeyboardEvent) callbacks.onKeyDown(event);
    },
    leftOut: () => callbacks.onBoundary('before'),
    rightOut: () => callbacks.onBoundary('after'),
    undoOut: () => callbacks.onUndoBoundary(),
  };
  for (const [name, handler] of Object.entries(listeners)) instance.on(name, handler);
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', destroy);
    for (const [name, handler] of Object.entries(listeners)) instance.off(name, handler);
    instance.destroy();
  };
  signal.addEventListener('abort', destroy, { once: true });
  return {
    instance,
    destroy,
    setTheme: applyTheme,
    setOption: (name: string, value: unknown) => instance.setOption(name, value),
    updateValue(value: string) {
      if (disposed || instance.getValue() === value) return;
      const changes = nativeCodeDocumentChange(instance.getValue(), value);
      if (!changes) return;
      const state = instance.view.state;
      const ownTransaction = state.update({ changes });
      const selection = state.selection;
      // The island's own SelectionRange.map delegates to its ChangeDesc.mapPos.
      // It preserves reversed ranges, bidi/goal flags and each cursor's assoc.
      const next = selection.constructor.create(
        selection.ranges.map((range) => range.map(ownTransaction.changes, range.assoc || -1)),
        selection.mainIndex,
      );
      const spec = { changes, selection: next };
      externalUpdate = true;
      try {
        instance.view.dispatch(
          state.update({
            ...spec,
            annotations: [ownTransaction.constructor.addToHistory.of(false)],
          }),
        );
      } finally {
        externalUpdate = false;
      }
    },
  };
}
