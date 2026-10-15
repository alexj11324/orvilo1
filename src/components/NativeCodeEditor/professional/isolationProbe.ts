import { mountProfessionalCodeBlock } from './codeBlockIsland';
import type { ProfessionalCodeInstance } from './kernel';

type RangeInput = { anchor: number; head: number; assoc?: number };
const cases: Array<{
  name: string;
  previous: string;
  next: string;
  ranges: RangeInput[];
  expected: Array<[number, number]>;
  mainIndex?: number;
}> = [
  {
    name: 'prefix before middle selection',
    previous: 'alpha beta gamma',
    next: 'NEW alpha beta gamma',
    ranges: [{ anchor: 6, head: 10 }],
    expected: [[10, 14]],
  },
  {
    name: 'prefix before reversed selection',
    previous: 'alpha beta gamma',
    next: 'NEW alpha beta gamma',
    ranges: [{ anchor: 10, head: 6 }],
    expected: [[14, 10]],
  },
  {
    name: 'multiple ranges retain main and direction',
    previous: 'alpha beta gamma',
    next: 'NEW alpha beta gamma',
    ranges: [
      { anchor: 0, head: 2 },
      { anchor: 10, head: 6 },
    ],
    expected: [
      [4, 6],
      [14, 10],
    ],
    mainIndex: 1,
  },
  {
    name: 'negative cursor association stays before insertion',
    previous: 'alpha beta gamma',
    next: 'alpha Xbeta gamma',
    ranges: [{ anchor: 6, head: 6, assoc: -1 }],
    expected: [[6, 6]],
  },
  {
    name: 'positive cursor association follows insertion',
    previous: 'alpha beta gamma',
    next: 'alpha Xbeta gamma',
    ranges: [{ anchor: 6, head: 6, assoc: 1 }],
    expected: [[7, 7]],
  },
  {
    name: 'prefix before emoji keeps UTF16 positions',
    previous: 'A😀BC tail',
    next: 'AA😀BC tail',
    ranges: [{ anchor: 3, head: 5 }],
    expected: [[4, 6]],
  },
  {
    name: 'surrogate replacement keeps following selection',
    previous: 'A😀B',
    next: 'A😁B',
    ranges: [{ anchor: 3, head: 4 }],
    expected: [[3, 4]],
  },
];
const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
function configureOwnSelection(
  instance: ProfessionalCodeInstance,
  ranges: RangeInput[],
  mainIndex: number,
) {
  // Fixture initialization only: both state and facet come from this exact island.
  // No imported @codemirror/state value is ever passed to the professional kernel.
  const ownStateConstructor = instance.view.state.constructor;
  const config = instance.getConfig(instance.getValue());
  config.extensions.push(ownStateConstructor.allowMultipleSelections.of(true));
  instance.view.setState(ownStateConstructor.create(config));
  const state = instance.view.state;
  const selection = state.selection.constructor.create(
    ranges.map((range) =>
      range.anchor === range.head
        ? state.selection.constructor.cursor(range.anchor, range.assoc)
        : state.selection.constructor.range(range.anchor, range.head),
    ),
    mainIndex,
  );
  instance.view.dispatch(state.update({ changes: { from: 0, to: 0, insert: '' }, selection }));
}
const coordinates = (instance: ProfessionalCodeInstance) =>
  instance.view.state.selection.ranges.map(({ anchor, head }) => [anchor, head]);
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function historyKey(instance: ProfessionalCodeInstance, redo: boolean) {
  instance.focus();
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  instance.view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: redo ? 'Z' : 'z',
      code: 'KeyZ',
      shiftKey: redo,
      ctrlKey: !mac,
      metaKey: mac,
      bubbles: true,
      cancelable: true,
    }),
  );
  await nextFrame();
}

/** Actual browser entry, not a mock. No PASS exists until this function executes. */
export async function probeProfessionalMappedExternalUpdates(parent: HTMLElement) {
  const results: Array<{ name: string; passed: true }> = [];
  for (const fixture of [
    ...cases,
    {
      name: 'existing undo external refresh then undo redo',
      previous: 'alpha beta',
      next: '',
      ranges: [{ anchor: 6, head: 10 }],
      expected: [],
      mainIndex: 0,
    },
  ]) {
    const host = document.createElement('div');
    parent.append(host);
    const controller = new AbortController();
    const changes: string[] = [];
    const island = await mountProfessionalCodeBlock(
      host,
      {
        value: fixture.previous,
        mode: 'plain',
        readOnly: false,
        tabSize: 2,
        indentWithTabs: false,
        lineNumbers: true,
        theme: 'default',
        useHistory: true,
      },
      {
        onChange: (value) => changes.push(value),
        onFocus: () => true,
        onBlur: () => {},
        onKeyDown: () => {},
        onBoundary: () => {},
        onUndoBoundary: () => {},
      },
      false,
      controller.signal,
    );
    if (!island) throw new Error('Unexpected aborted fixture');
    try {
      configureOwnSelection(island.instance, fixture.ranges, fixture.mainIndex ?? 0);
      island.setTheme(false);
      const beforeDepth = island.instance.historyUndoDepth();
      island.setOption('readOnly', true);
      check(
        island.instance.view.state.readOnly,
        `${fixture.name}: readonly did not reach own state`,
      );
      island.setOption('readOnly', false);
      check(!island.instance.view.state.readOnly, `${fixture.name}: readonly did not clear`);
      if (fixture.next) {
        const beforeCallbacks = changes.length;
        island.updateValue(fixture.next);
        check(island.instance.getValue() === fixture.next, `${fixture.name}: document mismatch`);
        check(
          JSON.stringify(coordinates(island.instance)) === JSON.stringify(fixture.expected),
          `${fixture.name}: mapped selection mismatch`,
        );
        fixture.ranges.forEach((range, index) => {
          if (range.assoc !== undefined)
            check(
              island.instance.view.state.selection.ranges[index]?.assoc === range.assoc,
              `${fixture.name}: cursor association changed`,
            );
        });
        check(
          island.instance.view.state.selection.mainIndex === (fixture.mainIndex ?? 0),
          `${fixture.name}: main range changed`,
        );
        check(
          island.instance.historyUndoDepth() === beforeDepth,
          `${fixture.name}: external edit entered history`,
        );
        check(
          changes.length === beforeCallbacks,
          `${fixture.name}: external update echoed callback`,
        );
      } else {
        const length = island.instance.getValue().length;
        island.instance.view.dispatch(
          island.instance.view.state.update({
            changes: { from: length, to: length, insert: '!' },
            userEvent: 'input.type',
          }),
        );
        check(
          island.instance.getValue() === 'alpha beta!',
          'User edit did not reach actual CM state',
        );
        const userDepth = island.instance.historyUndoDepth();
        check(userDepth > beforeDepth, 'Fixture did not establish genuine undo history');
        const beforeCallbacks = changes.length;
        island.updateValue('REMOTE alpha beta!');
        check(island.instance.historyUndoDepth() === userDepth, 'External edit added history');
        check(changes.length === beforeCallbacks, 'External edit echoed callback');
        await historyKey(island.instance, false);
        check(
          island.instance.getValue() === 'REMOTE alpha beta',
          'Undo lost external prefix or failed',
        );
        await historyKey(island.instance, true);
        check(
          island.instance.getValue() === 'REMOTE alpha beta!',
          'Redo failed to restore user edit',
        );
      }
      results.push({ name: fixture.name, passed: true });
    } finally {
      controller.abort();
      host.remove();
    }
  }
  return { results, grammarActivationProven: false, NativeAcceptanceComplete: false };
}
