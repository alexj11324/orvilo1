import type { LexicalEditor } from 'lexical';
import type { ReactNode } from 'react';

import type { ActionTagNode } from './ActionTagNode';

type ActionTagDecorator = (node: ActionTagNode, editor: LexicalEditor) => ReactNode;
type Registration = { render: ActionTagDecorator };
const decorators = new WeakMap<LexicalEditor, Registration[]>();

/** Direct Lexical plugin entry point. Register ActionTagNode in the editor's
 * initial nodes, then register this owner before attaching the root. No SDK
 * kernel lookup, module-global active editor, service locator or React hook. */
export function registerActionTagDecorator(
  editor: LexicalEditor,
  render: ActionTagDecorator,
): () => void {
  const registration = { render };
  const entries = decorators.get(editor) ?? [];
  entries.push(registration);
  decorators.set(editor, entries);
  return () => {
    const current = decorators.get(editor);
    if (!current) return;
    const index = current.indexOf(registration);
    if (index !== -1) current.splice(index, 1);
    if (!current.length) decorators.delete(editor);
  };
}

export function renderActionTagDecorator(editor: LexicalEditor, node: ActionTagNode): ReactNode {
  return decorators.get(editor)?.at(-1)?.render(node, editor) ?? null;
}
