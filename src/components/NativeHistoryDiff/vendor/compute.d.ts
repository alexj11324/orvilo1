import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

export interface NativeDiffCell {
  baseBlockType: string | null;
  block: SerializedLexicalNode | null;
  blockType: string | null;
}
export interface NativeDiffRow {
  kind: 'delete' | 'equal' | 'insert' | 'modify';
  newCell: NativeDiffCell | null;
  oldCell: NativeDiffCell | null;
}
export declare function computeLexicalDiffRows(oldState: SerializedEditorState, newState: SerializedEditorState): NativeDiffRow[];
