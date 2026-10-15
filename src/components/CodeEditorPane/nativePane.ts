import { mountProfessionalCodeBlock } from '../NativeCodeEditor/professional/codeBlockIsland';
import type { ProfessionalCodeOptions } from '../NativeCodeEditor/professional/kernel';
import { nativePaneGrammarThemes } from './nativeTheme';
import type { CursorPosition } from './StatusBar';
import { getCodeEditorTheme } from './style';

export interface NativePaneState {
  dark: boolean;
  lineWrapping: boolean;
  mode: string;
  readOnly: boolean;
  value: string;
}
/** Same professional island as rich code blocks, mounted as a standalone file
 * editor. No SDK loader/CDN, cross-CM extension, or whole-document reset. */
export async function mountNativeCodePane(
  host: HTMLElement,
  options: ProfessionalCodeOptions,
  state: NativePaneState,
  callbacks: {
    onChange: (value: string) => void;
    onSave: () => void;
    onCursor: (position: CursorPosition) => void;
  },
  signal: AbortSignal,
) {
  const binding = await mountProfessionalCodeBlock(
    host,
    options,
    {
      onBlur: () => {},
      onBoundary: () => {},
      onFocus: () => {},
      onUndoBoundary: () => {},
      onChange: callbacks.onChange,
      onKeyDown: (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          event.stopPropagation();
          callbacks.onSave();
        }
      },
    },
    state.dark,
    signal,
  );
  if (!binding) return;
  if (signal.aborted) {
    binding.destroy();
    return;
  }
  const view = binding.instance.view;
  const syncCursor = () => {
    const { from, head, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(head);
    callbacks.onCursor({
      column: head - line.from + 1,
      line: line.number,
      selectionLength: to - from,
    });
  };
  let applied: NativePaneState | undefined;
  const apply = (next: NativePaneState) => {
    if (signal.aborted) return;
    if (applied?.mode !== next.mode) binding.setOption('mode', next.mode);
    if (applied?.readOnly !== next.readOnly) {
      binding.setOption('readOnly', next.readOnly);
      binding.setOption('autoCloseBrackets', !next.readOnly);
    }
    if (applied?.lineWrapping !== next.lineWrapping)
      binding.setOption('lineWrapping', next.lineWrapping);
    if (applied?.dark !== next.dark)
      view.dispatch({
        effects: binding.instance.optionHelper.theme.reconfigure(
          getCodeEditorTheme(
            view.constructor,
            nativePaneGrammarThemes[next.dark ? 'dark' : 'light'],
            { dark: next.dark },
          ),
        ),
      });
    binding.updateValue(next.value);
    applied = { ...next };
    syncCursor();
  };
  const events = ['keyup', 'mouseup', 'focusin'] as const;
  for (const event of events) view.dom.addEventListener(event, syncCursor);
  const dispose = () => {
    signal.removeEventListener('abort', dispose);
    for (const event of events) view.dom.removeEventListener(event, syncCursor);
    binding.destroy();
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    apply(state);
  } catch (error) {
    dispose();
    throw error;
  }
  return { ...binding, apply, destroy: dispose };
}
