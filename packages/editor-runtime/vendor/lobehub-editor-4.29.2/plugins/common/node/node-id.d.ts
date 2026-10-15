import { EditorState, LexicalEditor, LexicalNode } from "lexical";
//#region src/plugins/common/node/node-id.d.ts
declare function $getNodeId(node: LexicalNode): string | undefined;
/** Find the active representation of a logical ID in a Lexical read/update context. */
declare function $getNodeById(nodeId: string, root?: LexicalNode): LexicalNode | null;
//#endregion
export { $getNodeById, $getNodeId };