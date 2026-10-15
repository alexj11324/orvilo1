import { $createParagraphNode, $createTextNode, $isDecoratorNode, type LexicalNode } from 'lexical';

export function unlinkNativeNode(node: LexicalNode) {
  const text = $createTextNode(node.getTextContent());
  node.replace(
    $isDecoratorNode(node) && !node.isInline() ? $createParagraphNode().append(text) : text,
  );
}
