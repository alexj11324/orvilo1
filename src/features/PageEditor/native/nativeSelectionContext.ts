import {
  $generateJSONFromSelectedNodes,
  $generateNodesFromSerializedNodes,
  $insertGeneratedNodes,
  type NativeIEditorKernel,
} from '@orvilo/editor-runtime/native-browser';
import type { ChatContextContent } from '@orvilo/types';
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';

import { getSelectionPreview } from '@/features/Conversation/Messages/components/TextSelectionActionLayer/helpers';

/** Serialize through this exact native kernel's registered data sources. Never
 * construct XML/node identities or send a DOM-only approximation of rich text. */
export function captureNativeSelectionContext({
  editor,
  documentId,
  title,
  id,
}: {
  editor: Pick<
    NativeIEditorKernel,
    'getSelectionDocument' | 'getLexicalEditor' | 'cloneNodeEditor'
  >;
  documentId: string;
  title: string;
  id: string;
}): ChatContextContent | undefined {
  const lexical = editor.getLexicalEditor();
  if (!lexical) return;
  const fragment = lexical.read(() => {
    const selection = $getSelection();
    if (
      !selection ||
      ($isRangeSelection(selection) && selection.isCollapsed()) ||
      !selection.getNodes().length
    )
      return;
    return $generateJSONFromSelectedNodes(lexical, selection);
  });
  if (!fragment?.nodes.length) return;
  const temporary = editor.cloneNodeEditor();
  let rawXml: unknown;
  try {
    const target = temporary.getLexicalEditor();
    if (!target) throw new Error('Selection serialization editor unavailable');
    target.update(
      () => {
        const root = $getRoot();
        root.clear();
        // Clipboard fragments may start with inline/TextNodes. Canonical rich
        // insertion wraps them into valid root blocks using registered codecs.
        const nodes = $generateNodesFromSerializedNodes(fragment.nodes);
        $insertGeneratedNodes(target, nodes, root.select());
      },
      { discrete: true },
    );
    rawXml = temporary.getDocument('litexml');
  } finally {
    temporary.destroy();
  }
  const rawText = editor.getSelectionDocument('text');
  const xml = typeof rawXml === 'string' ? rawXml.trim() : '';
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!xml) return;
  return {
    content: xml,
    format: 'xml',
    id,
    pageId: documentId,
    preview: getSelectionPreview(text || xml.replaceAll(/<[^>]*>/g, ' ')),
    title,
    type: 'text',
  };
}
