import { createCommand } from "lexical";
//#region src/plugins/litexml/command/symbols.ts
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
let DiffAction = /* @__PURE__ */ function(DiffAction) {
	DiffAction[DiffAction["Reject"] = 0] = "Reject";
	DiffAction[DiffAction["Accept"] = 1] = "Accept";
	return DiffAction;
}({});
const LITEXML_MODIFY_COMMAND = createCommand("LITEXML_MODIFY_COMMAND");
const LITEXML_MODIFY_WITH_RESULTS_COMMAND = createCommand("LITEXML_MODIFY_WITH_RESULTS_COMMAND");
const LITEXML_APPLY_COMMAND = createCommand("LITEXML_APPLY_COMMAND");
const LITEXML_REMOVE_COMMAND = createCommand("LITEXML_REMOVE_COMMAND");
const LITEXML_INSERT_COMMAND = createCommand("LITEXML_INSERT_COMMAND");
const LITEXML_DIFFNODE_COMMAND = createCommand("LITEXML_DIFFNODE_COMMAND");
const LITEXML_DIFFNODE_ALL_COMMAND = createCommand("LITEXML_DIFFNODE_ALL_COMMAND");
//#endregion
export { DiffAction, LITEXML_APPLY_COMMAND, LITEXML_DIFFNODE_ALL_COMMAND, LITEXML_DIFFNODE_COMMAND, LITEXML_INSERT_COMMAND, LITEXML_MODIFY_COMMAND, LITEXML_MODIFY_WITH_RESULTS_COMMAND, LITEXML_REMOVE_COMMAND };
