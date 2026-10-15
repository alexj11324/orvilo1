//#region src/plugins/litexml/command/symbols.d.ts
/**
 * LiteXML command identities.
 *
 * These symbols are intentionally isolated in a side-effect-free module so they
 * keep a SINGLE runtime identity across every entry of this package.
 *
 * Lexical's `dispatchCommand` matches command listeners by object reference, not
 * by the string label. The package ships two independently-bundled entries — the
 * browser build (`index` / `react` / `renderer`) and the node build (`headless`)
 * — and if each entry inlined its own `createCommand(...)` call, dispatching a
 * command obtained from one entry onto an editor registered by the other would
 * silently no-op (different object identities, same label).
 *
 * By keeping every command in this one module — exposed verbatim through
 * `@lobehub/editor/litexml-commands` and emitted as a shared chunk by both
 * builds — a single object backs the command in any runtime, and the module is
 * pure enough to be imported on the server without pulling in the DOM-dependent
 * editor bundle.
 */
declare enum DiffAction {
  Reject = 0,
  Accept = 1
}
type LiteXmlModifyOperation = {
  action: 'insert';
  beforeId: string;
  litexml: string;
} | {
  action: 'insert';
  afterId: string;
  litexml: string;
} | {
  action: 'remove';
  id: string;
} | {
  action: 'modify';
  litexml: string | string[];
};
interface LiteXmlOperationResult {
  action: LiteXmlModifyOperation['action'];
  index: number;
  reason?: string;
  status: 'applied' | 'failed';
}
declare const LITEXML_MODIFY_COMMAND: import("lexical").LexicalCommand<LiteXmlModifyOperation[]>;
declare const LITEXML_MODIFY_WITH_RESULTS_COMMAND: import("lexical").LexicalCommand<{
  onResults: (results: LiteXmlOperationResult[]) => void;
  operations: ReadonlyArray<LiteXmlModifyOperation>;
}>;
declare const LITEXML_APPLY_COMMAND: import("lexical").LexicalCommand<{
  delay?: boolean;
  litexml: string | string[];
}>;
declare const LITEXML_REMOVE_COMMAND: import("lexical").LexicalCommand<{
  delay?: boolean;
  id: string;
}>;
declare const LITEXML_INSERT_COMMAND: import("lexical").LexicalCommand<{
  beforeId: string;
  delay?: boolean;
  litexml: string;
} | {
  afterId: string;
  delay?: boolean;
  litexml: string;
}>;
declare const LITEXML_DIFFNODE_COMMAND: import("lexical").LexicalCommand<{
  action: DiffAction;
  nodeKey: string;
}>;
declare const LITEXML_DIFFNODE_ALL_COMMAND: import("lexical").LexicalCommand<{
  action: DiffAction;
}>;
//#endregion
export { DiffAction, LITEXML_APPLY_COMMAND, LITEXML_DIFFNODE_ALL_COMMAND, LITEXML_DIFFNODE_COMMAND, LITEXML_INSERT_COMMAND, LITEXML_MODIFY_COMMAND, LITEXML_MODIFY_WITH_RESULTS_COMMAND, LITEXML_REMOVE_COMMAND, LiteXmlModifyOperation, LiteXmlOperationResult };