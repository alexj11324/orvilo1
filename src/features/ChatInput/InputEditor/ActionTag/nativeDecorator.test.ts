import { createEditor } from 'lexical';
import { describe, expect, it } from 'vitest';

import { ActionTagNode } from './ActionTagNode';
import { registerActionTagDecorator, renderActionTagDecorator } from './nativeDecorator';

describe('native action tag decorator ownership', () => {
  it('isolates concurrent editors and releases registration on destroy', () => {
    const first = createEditor({ nodes: [ActionTagNode] });
    const second = createEditor({ nodes: [ActionTagNode] });
    const makeNode = (editor: ReturnType<typeof createEditor>) => {
      let node: ActionTagNode | undefined;
      editor.update(
        () => {
          node = new ActionTagNode('test', 'skill', 'Test');
        },
        { discrete: true },
      );
      if (!node) throw new Error('Node initialization failed');
      return node;
    };
    const node = makeNode(first);
    const release = registerActionTagDecorator(first, () => 'first');
    const releaseSecond = registerActionTagDecorator(second, () => 'second');
    expect(renderActionTagDecorator(first, node)).toBe('first');
    expect(renderActionTagDecorator(second, node)).toBe('second');
    release();
    release();
    expect(renderActionTagDecorator(first, node)).toBeNull();
    expect(renderActionTagDecorator(second, node)).toBe('second');
    releaseSecond();
  });
  it('does not resurrect a removed older registration after out-of-order cleanup', () => {
    const editor = createEditor({ nodes: [ActionTagNode] });
    let node: ActionTagNode | undefined;
    editor.update(
      () => {
        node = new ActionTagNode('test', 'skill', 'Test');
      },
      { discrete: true },
    );
    if (!node) throw new Error('Node initialization failed');
    const old = registerActionTagDecorator(editor, () => 'old');
    const latest = registerActionTagDecorator(editor, () => 'latest');
    old();
    expect(renderActionTagDecorator(editor, node)).toBe('latest');
    latest();
    expect(renderActionTagDecorator(editor, node)).toBeNull();
  });
});
