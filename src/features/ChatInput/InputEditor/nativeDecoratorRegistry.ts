import type { LexicalEditor } from 'lexical';
import type { ReactNode } from 'react';

/** One registry per owned node kind; one registration stack per actual editor.
 * Retains the existing ActionTag lifetime/cleanup behavior without SDK lookup. */
export function createNativeDecoratorRegistry<Node>() {
  type Renderer = (node: Node, editor: LexicalEditor) => ReactNode;
  type Registration = { render: Renderer };
  const decorators = new WeakMap<LexicalEditor, Registration[]>();
  return {
    register(editor: LexicalEditor, render: Renderer): () => void {
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
    },
    render(editor: LexicalEditor, node: Node): ReactNode {
      return decorators.get(editor)?.at(-1)?.render(node, editor) ?? null;
    },
  };
}
