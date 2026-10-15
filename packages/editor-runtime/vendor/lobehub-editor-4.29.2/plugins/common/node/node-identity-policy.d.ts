import { LexicalEditor, LexicalNode } from "lexical";
//#region src/plugins/common/node/node-identity-policy.d.ts
/**
 * A document format can decide which physical nodes represent one logical ID.
 * The common identity layer does not interpret review or document node types.
 */
type NodeIdentityProjection = 'container' | 'content' | 'hidden' | Readonly<{
  childIndex: number;
}>;
interface NodeIdentityPolicy {
  canShareId(left: LexicalNode, right: LexicalNode): boolean;
  /** Classify one node for active lookup; hidden nodes still receive IDs in normalization. */
  project(node: LexicalNode): NodeIdentityProjection;
  isIdentityNode(node: LexicalNode): boolean;
}
declare function subscribeNodeIdentityPolicy(editor: LexicalEditor, listener: () => void): () => void;
declare function getNodeIdentityPolicyRevision(editor: LexicalEditor): number;
/** Register a document-format policy for one editor, with order-independent disposal. */
declare function registerNodeIdentityPolicy(editor: LexicalEditor, policy: NodeIdentityPolicy): () => void;
/**
 * Requires an editor-bound Lexical context. For an EditorState snapshot, pass
 * `{ editor }` to `state.read` so its document policy is unambiguous.
 */
declare function $getNodeIdentityPolicy(): NodeIdentityPolicy;
//#endregion
export { $getNodeIdentityPolicy, NodeIdentityPolicy, NodeIdentityProjection, getNodeIdentityPolicyRevision, registerNodeIdentityPolicy, subscribeNodeIdentityPolicy };