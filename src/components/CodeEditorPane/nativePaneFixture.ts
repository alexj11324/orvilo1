import { mountNativeCodePane, type NativePaneState } from './nativePane';

/** Real browser/Electron fixture, not a mocked constructor or visual acceptance.
 * The parent runner can call this on an isolated attached host. */
export async function verifyNativeCodePane(host: HTMLElement) {
  const controller = new AbortController();
  const changed: string[] = [];
  let saves = 0;
  const observed: { cursor?: { line: number; column: number; selectionLength: number } } = {};
  const initial: NativePaneState = {
    value: 'a😀 bcdef\nnext',
    mode: 'javascript',
    readOnly: false,
    lineWrapping: true,
    dark: false,
  };
  const pane = await mountNativeCodePane(
    host,
    {
      value: initial.value,
      mode: initial.mode,
      readOnly: false,
      lineNumbers: true,
      indentWithTabs: false,
      tabSize: 2,
      theme: 'default',
      useHistory: true,
      foldGutter: true,
      matchBrackets: true,
      styleActiveLine: true,
      autoCloseBrackets: true,
      lineWrapping: true,
    },
    initial,
    {
      onChange: (value) => changed.push(value),
      onSave: () => {
        saves++;
      },
      onCursor: (value) => {
        observed.cursor = value;
      },
    },
    controller.signal,
  );
  if (!pane) throw new Error('Actual professional pane did not mount');
  const expect = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };
  try {
    const { instance } = pane;
    const config = instance.getConfig(initial.value);
    const ownState = instance.view.state.constructor;
    instance.view.setState(
      ownState.create({
        ...config,
        extensions: [...config.extensions, ownState.allowMultipleSelections.of(true)],
      }),
    );
    const selection = instance.view.state.selection.constructor;
    instance.view.dispatch(
      instance.view.state.update({
        changes: { from: 0, to: 0, insert: '' },
        selection: selection.create([selection.range(8, 3), selection.cursor(10)], 0),
      }),
    );
    pane.apply({ ...initial, value: '++' + initial.value });
    const ranges = instance.view.state.selection.ranges;
    expect(
      ranges.length === 2 &&
        ranges[0].anchor === 10 &&
        ranges[0].head === 5 &&
        ranges[1].head === 12,
      'External UTF16 insertion did not map reversed/multiple selections',
    );
    expect(changed.length === 0, 'External update echoed as a user edit');
    const end = instance.getValue().length;
    instance.view.dispatch(
      instance.view.state.update({
        changes: { from: end, to: end, insert: '!' },
        userEvent: 'input.type',
      }),
    );
    expect(changed.at(-1) === '++' + initial.value + '!', 'Actual change callback lost content');
    const depth = instance.historyUndoDepth();
    pane.apply({
      ...initial,
      value: '++' + initial.value + '!',
      dark: true,
      lineWrapping: false,
      readOnly: true,
    });
    expect(instance.view.state.readOnly, 'Readonly option did not reach actual CM state');
    expect(instance.historyUndoDepth() === depth, 'Theme/readonly/wrap reset undo history');
    pane.apply({ ...initial, value: '++' + initial.value + '!', dark: true });
    instance.view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(saves === 1, 'Actual Cmd/Ctrl-S callback missing or duplicated');
    instance.focus();
    instance.view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(
      instance.getValue() === '++' + initial.value,
      'Actual undo lost external prefix or failed to undo typing',
    );
    instance.view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(
      instance.getValue() === '++' + initial.value + '!',
      'Actual redo did not restore typing',
    );
    expect(
      !!observed.cursor && observed.cursor.line >= 1 && observed.cursor.column >= 1,
      'Cursor status was not initialized',
    );
    return {
      actualProfessionalKernel: true,
      reversedAndMultipleSelection: true,
      externalEchoes: 0,
      actualReadOnly: true,
      undoDepthPreserved: depth,
      saves,
      cursor: observed.cursor,
      value: instance.getValue(),
    };
  } finally {
    controller.abort();
  }
}
