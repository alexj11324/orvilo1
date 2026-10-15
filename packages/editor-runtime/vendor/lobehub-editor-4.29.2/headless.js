import { getNodeIdentityPolicyRevision, registerNodeIdentityPolicy, subscribeNodeIdentityPolicy } from "./plugins/common/node/node-identity-policy.js";
import { $clearNodeId, $copyNodeProperties, $ensureUniqueNodeIds, $findNodeById, $getActiveNodeIdKeys, $getNodeById, $getNodeId, $normalizeNodeIds, $setNodeId, isValidContentNodeId, migrateSerializedNodeIds } from "./plugins/common/node/node-id.js";
import { INodeIdentityService } from "./plugins/common/service/i-node-identity-service.js";
import { LITEXML_APPLY_COMMAND, LITEXML_DIFFNODE_ALL_COMMAND, LITEXML_DIFFNODE_COMMAND, LITEXML_INSERT_COMMAND, LITEXML_MODIFY_COMMAND, LITEXML_MODIFY_WITH_RESULTS_COMMAND, LITEXML_REMOVE_COMMAND } from "./plugins/litexml/command/symbols.js";
import { createHeadlessEditor as createHeadlessEditor$1 } from "@lexical/headless";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $computeTableMapSkipCellCheck, $createTableCellNode, $createTableNodeWithDimensions, $createTableRowNode, $createTableSelection, $deleteTableColumnAtSelection, $deleteTableRowAtSelection, $findTableNode, $insertTableColumnAtSelection, $insertTableRowAtSelection, $isSimpleTable, $isTableCellNode, $isTableNode, $isTableRowNode, $isTableSelection, TableCellNode, TableNode, TableNode as TableNode$1, TableRowNode, registerTableCellUnmergeTransform, registerTablePlugin, registerTableSelectionObserver, setScrollableTablesActive } from "@lexical/table";
import { get, merge, template, templateSettings } from "es-toolkit/compat";
import EventEmitter from "eventemitter3";
import { $applyNodeReplacement, $caretFromPoint, $createLineBreakNode, $createNodeSelection, $createParagraphNode, $createRangeSelection, $createTextNode, $getCaretRange, $getCharacterOffsets, $getChildCaret, $getNearestNodeFromDOMNode, $getNodeByKey, $getPreviousSelection, $getRoot, $getSelection, $insertNodes, $isBlockElementNode, $isDecoratorNode, $isElementNode, $isLineBreakNode, $isNodeSelection, $isRangeSelection, $isRootNode, $isRootOrShadowRoot, $isTextNode, $isTextPointCaret, $nodesOfType, $normalizeSelection__EXPERIMENTAL, $parseSerializedNode, $setSelection, COLLABORATION_TAG, COMMAND_PRIORITY_CRITICAL, COMMAND_PRIORITY_EDITOR, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, COMMAND_PRIORITY_NORMAL, CONTROLLED_TEXT_INSERTION_COMMAND, COPY_COMMAND, DecoratorNode, ElementNode, FORMAT_TEXT_COMMAND, HISTORIC_TAG, HISTORY_MERGE_TAG, HISTORY_PUSH_TAG, INDENT_CONTENT_COMMAND, INSERT_LINE_BREAK_COMMAND, INSERT_PARAGRAPH_COMMAND, INSERT_TAB_COMMAND, IS_BOLD, IS_CODE, IS_ITALIC, IS_STRIKETHROUGH, IS_SUBSCRIPT, IS_SUPERSCRIPT, IS_UNDERLINE, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_LEFT_COMMAND, KEY_ARROW_RIGHT_COMMAND, KEY_ARROW_UP_COMMAND, KEY_BACKSPACE_COMMAND, KEY_DOWN_COMMAND, KEY_ENTER_COMMAND, KEY_TAB_COMMAND, OUTDENT_CONTENT_COMMAND, PASTE_COMMAND, ParagraphNode, REDO_COMMAND, RootNode, SELECTION_CHANGE_COMMAND, SELECTION_INSERT_CLIPBOARD_NODES_COMMAND, SELECT_ALL_COMMAND, TEXT_TYPE_TO_FORMAT, TextNode, UNDO_COMMAND, createCommand, createEditor, getNearestEditorFromDOMNode, isHTMLElement, isModifierMatch, setDOMUnmanaged } from "lexical";
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode, HeadingNode, QuoteNode, registerRichText } from "@lexical/rich-text";
import createDebug from "debug";
import { $filter, $findMatchingParent, $getNearestBlockElementAncestorOrThrow, $getNearestNodeOfType, $insertNodeToNearestRoot, $wrapNodeInElement, CAN_USE_DOM, IS_APPLE as isApple, addClassNamesToElement, calculateZoomLevel, isHTMLAnchorElement, isHTMLElement as isHTMLElement$1, mergeRegister } from "@lexical/utils";
import { $isAtNodeEnd, $setBlocksType } from "@lexical/selection";
import { registerDragonSupport } from "@lexical/dragon";
import { $createListItemNode, $createListNode, $insertList, $isListItemNode, $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListItemNode, ListNode, registerList, registerListStrictIndentTransform } from "@lexical/list";
import { DOMParser as DOMParser$1 } from "@xmldom/xmldom";
import { remark } from "remark";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { $getClipboardDataFromSelection, setLexicalClipboardDataTransfer } from "@lexical/clipboard";
import { $isCodeHighlightNode, $isCodeNode } from "@lexical/code-core";
//#region src/locale/index.ts
var locale_default = {
	block: {
		copy: "Copy",
		delete: "Delete block",
		select: "Select"
	},
	cancel: "Cancel",
	codemirror: {
		copySuccess: "Code copied to clipboard",
		preview: "Preview",
		selectLanguage: "Select language",
		selectTheme: "Select theme",
		showLineNumbers: "Show Line Numbers",
		tabSize: "Tab Size",
		theme: "Theme",
		useTabs: "Use Tabs"
	},
	confirm: "Confirm",
	file: {
		error: "Error: {{message}}",
		uploading: "Uploading file..."
	},
	image: {
		broken: "Broken image",
		preview: "Preview image",
		replace: "Replace"
	},
	link: {
		copy: "Copy Link",
		copySuccess: "Link copied",
		convertToCard: "Convert to Card",
		convertToIframe: "Convert to Iframe",
		convertToLink: "Convert to Link",
		convertToSchema: "Convert to Schema",
		edit: "Edit Link",
		editLinkTitle: "Link",
		editTextTitle: "Text",
		open: "Open Link",
		placeholder: "Enter link URL",
		unlink: "Unlink Link"
	},
	markdown: {
		autoFormatMessage: "Markdown was converted automatically. Use Command/Ctrl + Z to undo this conversion.",
		autoFormatTitle: "Markdown Converted",
		cancel: "Cancel",
		confirm: "Confirm",
		parseMessage: "Convert to markdown format, existing content will be overwritten, confirm? (Auto close in 5 seconds)",
		parseTitle: "Parse Markdown"
	},
	math: { placeholder: "Enter TeX formula" },
	modifier: {
		accept: "Accept",
		acceptAll: "Accept All",
		reject: "Reject",
		rejectedAll: "Reject All"
	},
	table: {
		delete: "Delete table",
		deleteColumn: "Delete column",
		deleteRow: "Delete row",
		insertColumnLeft: "Insert {{count}} column(s) to the left",
		insertColumnRight: "Insert {{count}} column(s) to the right",
		insertRowAbove: "Insert {{count}} row(s) above",
		insertRowBelow: "Insert {{count}} row(s) below"
	},
	toc: {
		ariaLabel: "Table of contents",
		empty: "No headings",
		expand: "Expand table of contents",
		pin: "Pin table of contents",
		title: "TOC",
		unpin: "Unpin table of contents"
	}
};
//#endregion
//#region src/editor-kernel/inode/helper.ts
const BaseContent = {
	direction: "ltr",
	format: "",
	indent: 0,
	type: "",
	version: 1
};
const INodeHelper = {
	appendChild(parent, ...child) {
		if (!parent.children) parent.children = [];
		parent.children.push(...child);
	},
	createElementNode(type, attrs = {}) {
		return {
			...BaseContent,
			children: [],
			...attrs,
			type
		};
	},
	createLikeTextNode(type, text, attrs = {}) {
		return {
			...BaseContent,
			detail: 0,
			format: 0,
			mode: "normal",
			style: "",
			...attrs,
			text,
			type
		};
	},
	createParagraph(attrs = {}) {
		return {
			...BaseContent,
			children: [],
			textFormat: 0,
			textStyle: "",
			...attrs,
			type: "paragraph"
		};
	},
	createRootNode(attrs = {}) {
		return {
			...BaseContent,
			...attrs,
			children: [],
			type: "root"
		};
	},
	createTextNode(text, attrs = {}) {
		return {
			...BaseContent,
			detail: 0,
			format: 0,
			mode: "normal",
			style: "",
			...attrs,
			text,
			type: "text"
		};
	},
	createTypeNode(type, attrs = {}) {
		return {
			...BaseContent,
			...attrs,
			type
		};
	},
	isParagraphNode(node) {
		return node.type === "paragraph";
	},
	isRootNode(node) {
		return node.type === "root";
	},
	isTextNode(node) {
		return node.type === "text";
	}
};
//#endregion
//#region src/plugins/common/utils/index.ts
const sampleReader = (format, xmlElement, children) => {
	children.forEach((child) => {
		if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | format;
	});
	return children;
};
const createBlockNode = (createNode) => {
	return (parentNode, children, match, isImport) => {
		const node = createNode(match, parentNode);
		node.append(...children);
		parentNode.replace(node);
		if (!isImport) node.select(0, 0);
	};
};
/**
* Returns the root's text content.
* @returns The root's text content.
*/
function $rootTextContent() {
	return $getRoot().getTextContent();
}
/**
* Determines if the root has any text content and can trim any whitespace if it does.
* @param isEditorComposing - Is the editor in composition mode due to an active Input Method Editor?
* @param trim - Should the root text have its whitespaced trimmed? Defaults to true.
* @returns true if text content is empty, false if there is text or isEditorComposing is true.
*/
function $isRootTextContentEmpty(isEditorComposing, trim = true) {
	if (isEditorComposing) return false;
	let text = $rootTextContent();
	if (trim) text = text.trim();
	return text === "";
}
function $isCursorInTable(selection) {
	if (!$isRangeSelection(selection)) return {
		inCell: false,
		inTable: false
	};
	let currentNode = selection.focus.getNode();
	let inTable = false;
	let inCell = false;
	while (currentNode) {
		if ($isTableCellNode(currentNode)) {
			inCell = true;
			inTable = true;
			break;
		}
		if ($isTableNode(currentNode)) {
			inTable = true;
			break;
		}
		const parent = currentNode.getParent();
		if (!parent) break;
		currentNode = parent;
	}
	return {
		inCell,
		inTable
	};
}
function $isCursorInQuote(selection) {
	if (!$isRangeSelection(selection)) return false;
	let currentNode = selection.focus.getNode();
	while (currentNode) {
		if ($isQuoteNode(currentNode)) return true;
		const parent = currentNode.getParent();
		if (!parent) break;
		currentNode = parent;
	}
	return false;
}
function exportNodeToJSON$1(node) {
	const serializedNode = node.exportJSON();
	const nodeClass = node.constructor;
	serializedNode.id = $getNodeId(node);
	if (serializedNode.type !== nodeClass.getType()) throw new Error(`LexicalNode: Node ${nodeClass.name} does not match the serialized type. Check if .exportJSON() is implemented and it is returning the correct type.`);
	if ($isElementNode(node)) {
		const serializedChildren = serializedNode.children;
		if (!Array.isArray(serializedChildren)) throw new Error(`LexicalNode: Node ${nodeClass.name} is an element but .exportJSON() does not have a children array.`);
		const children = node.getChildren();
		for (const child of children) {
			const serializedChildNode = exportNodeToJSON$1(child);
			serializedChildren.push(serializedChildNode);
		}
	}
	return serializedNode;
}
//#endregion
//#region src/utils/debug.ts
/**
* Base namespace for all LobeHub Editor debug messages
*/
const BASE_NAMESPACE = "lobe-editor";
process.env.NODE_ENV;
/**
* Debug utility factory for LobeHub Editor
* Creates namespaced debug functions following the pattern: lobe-editor:category
*/
var DebugLogger = class {
	constructor() {
		this.debuggers = /* @__PURE__ */ new Map();
	}
	/**
	* Get or create a debug function for a specific namespace
	* @param category - The debug category (e.g., 'kernel', 'plugin', 'upload')
	* @param subcategory - Optional subcategory for more specific debugging
	* @returns Debug function
	*/
	getDebugger(category, subcategory) {
		const namespace = subcategory ? `${BASE_NAMESPACE}:${category}:${subcategory}` : `${BASE_NAMESPACE}:${category}`;
		if (!this.debuggers.has(namespace)) this.debuggers.set(namespace, createDebug(namespace));
		return this.debuggers.get(namespace);
	}
	/**
	* Create a scoped debug logger for a specific component/service
	* @param category - Main category
	* @param subcategory - Optional subcategory
	* @returns Object with debug methods
	*/
	createLogger(category, subcategory) {
		const debug = this.getDebugger(category, subcategory);
		const warnDebugger = this.getDebugger(category, subcategory ? `${subcategory}:warn` : "warn");
		const errorDebugger = this.getDebugger(category, subcategory ? `${subcategory}:error` : "error");
		const info = this.getDebugger(category, subcategory ? `${subcategory}:info` : "info");
		const warn = (...args) => {
			if (warnDebugger.enabled) {
				const prefix = warnDebugger.namespace;
				console.warn(`${prefix}`, ...args);
			}
		};
		const error = (...args) => {
			if (errorDebugger.enabled) {
				const prefix = errorDebugger.namespace;
				console.error(`${prefix}`, ...args);
			}
		};
		return {
			/**
			* General debug logging
			*/
			debug,
			/**
			* Error level logging - uses console.error for proper browser dev tool support
			*/
			error,
			/**
			* Info level logging
			*/
			info,
			/**
			* Log function - alias for debug for compatibility
			*/
			log: debug,
			/**
			* Warning level logging - uses console.warn for proper browser dev tool support
			*/
			warn
		};
	}
	/**
	* Enable debug for specific namespaces
	* @param namespaces - Comma-separated list of namespaces to enable
	*/
	enable(namespaces) {
		createDebug.enable(namespaces);
	}
	/**
	* Disable all debug output
	*/
	disable() {
		createDebug.disable();
	}
	/**
	* Check if a namespace is enabled
	* @param namespace - The namespace to check
	* @returns Whether the namespace is enabled
	*/
	enabled(namespace) {
		return createDebug.enabled(namespace);
	}
};
/**
* Global debug logger instance
*/
const debugLogger = new DebugLogger();
/**
* Convenience function to create a debug logger for a specific category
* @param category - Main category (e.g., 'kernel', 'plugin', 'upload')
* @param subcategory - Optional subcategory
* @returns Logger object with debug methods
*/
function createDebugLogger(category, subcategory) {
	return debugLogger.createLogger(category, subcategory);
}
/**
* Pre-configured debug loggers for common categories
*/
const debugLoggers = {
	demo: createDebugLogger("demo"),
	file: createDebugLogger("file"),
	image: createDebugLogger("image"),
	kernel: createDebugLogger("kernel"),
	markdown: createDebugLogger("markdown"),
	math: createDebugLogger("math"),
	mention: createDebugLogger("mention"),
	plugin: createDebugLogger("plugin"),
	react: createDebugLogger("react"),
	service: createDebugLogger("service"),
	slash: createDebugLogger("slash"),
	upload: createDebugLogger("upload")
};
debugLoggers.kernel.debug, debugLoggers.kernel.info;
//#endregion
//#region src/types/hotkey.ts
const KeyEnum = {
	Alt: "alt",
	Backquote: "backquote",
	Backslash: "backslash",
	Backspace: "backspace",
	BracketLeft: "bracketleft",
	BracketRight: "bracketright",
	Comma: "comma",
	Ctrl: "ctrl",
	Down: "down",
	Enter: "enter",
	Equal: "equal",
	Esc: "esc",
	Left: "left",
	LeftClick: "left-click",
	LeftDoubleClick: "left-double-click",
	Meta: "meta",
	MiddleClick: "middle-click",
	Minus: "minus",
	Mod: "mod",
	Number: "1-9",
	Period: "period",
	Plus: "equal",
	QuestionMark: "slash",
	Quote: "quote",
	Right: "right",
	RightClick: "right-click",
	RightDoubleClick: "right-double-click",
	Semicolon: "semicolon",
	Shift: "shift",
	Slash: "slash",
	Space: "space",
	Tab: "tab",
	Up: "up",
	Zero: "0"
};
const HotkeyEnum = {
	Bold: "bold",
	BulletList: "bulletList",
	CodeInline: "codeInline",
	Italic: "italic",
	Link: "link",
	Mention: "mention",
	NumberList: "numberList",
	PasteAsPlainText: "pasteAsPlainText",
	Redo: "redo",
	Slash: "slash",
	Strikethrough: "strikethrough",
	Underline: "underline",
	Undo: "undo"
};
const HotkeyScopeEnum = {
	Format: "format",
	Insert: "insert",
	Plugin: "plugin",
	Slash: "slash"
};
//#endregion
//#region src/const/hotkey.ts
const combineKeys = (keys) => keys.join("+");
const HOTKEYS_REGISTRATION = [
	{
		id: HotkeyEnum.Undo,
		keys: combineKeys([KeyEnum.Mod, "z"]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format]
	},
	{
		id: HotkeyEnum.Redo,
		keys: combineKeys([KeyEnum.Mod, "y"]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format]
	},
	{
		id: HotkeyEnum.Bold,
		keys: combineKeys([KeyEnum.Mod, "b"]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format]
	},
	{
		id: HotkeyEnum.Italic,
		keys: combineKeys([KeyEnum.Mod, "i"]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format]
	},
	{
		id: HotkeyEnum.Underline,
		keys: combineKeys([KeyEnum.Mod, "u"]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format]
	},
	{
		id: HotkeyEnum.Strikethrough,
		keys: combineKeys([
			KeyEnum.Mod,
			KeyEnum.Shift,
			"x"
		]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format]
	},
	{
		id: HotkeyEnum.CodeInline,
		keys: combineKeys([KeyEnum.Mod, "e"]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format, HotkeyScopeEnum.Plugin]
	},
	{
		id: HotkeyEnum.Link,
		keys: combineKeys([
			KeyEnum.Mod,
			KeyEnum.Shift,
			"k"
		]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format, HotkeyScopeEnum.Plugin]
	},
	{
		id: HotkeyEnum.NumberList,
		keys: combineKeys([
			KeyEnum.Mod,
			KeyEnum.Shift,
			"7"
		]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Insert, HotkeyScopeEnum.Plugin]
	},
	{
		id: HotkeyEnum.BulletList,
		keys: combineKeys([
			KeyEnum.Mod,
			KeyEnum.Shift,
			"8"
		]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Insert, HotkeyScopeEnum.Plugin]
	},
	{
		id: HotkeyEnum.PasteAsPlainText,
		keys: combineKeys([
			KeyEnum.Mod,
			KeyEnum.Shift,
			"v"
		]),
		priority: COMMAND_PRIORITY_LOW,
		scopes: [HotkeyScopeEnum.Format]
	}
];
//#endregion
//#region src/utils/hotkey/parseHotkeys.ts
const reservedModifierKeywords = /* @__PURE__ */ new Set([
	"shift",
	"alt",
	"meta",
	"mod",
	"ctrl",
	"control"
]);
const mappedKeys = {
	AltLeft: "alt",
	AltRight: "alt",
	ControlLeft: "ctrl",
	ControlRight: "ctrl",
	MetaLeft: "meta",
	MetaRight: "meta",
	OSLeft: "meta",
	OSRight: "meta",
	ShiftLeft: "shift",
	ShiftRight: "shift",
	down: "arrowdown",
	esc: "escape",
	left: "arrowleft",
	return: "enter",
	right: "arrowright",
	up: "arrowup"
};
function mapCode(key) {
	return (mappedKeys[key.trim()] || key.trim()).toLowerCase().replace(/key|digit|numpad/, "");
}
function parseHotkey(hotkey) {
	let keys = [];
	keys = hotkey.toLocaleLowerCase().split("+").map((k) => mapCode(k));
	const modifiers = {
		altKey: keys.includes("alt"),
		ctrlKey: keys.includes("ctrl") || keys.includes("control") || (!isApple ? keys.includes("mod") : false),
		metaKey: keys.includes("meta") || (isApple ? keys.includes("mod") : false),
		shiftKey: keys.includes("shift")
	};
	return {
		key: keys.find((k) => !reservedModifierKeywords.has(k)),
		modifiers
	};
}
//#endregion
//#region src/utils/hotkey/isHotkeyMatch.ts
const isHotkeyMatch = (event, hotkey) => {
	const keys = parseHotkey(hotkey);
	if (!isModifierMatch(event, keys.modifiers)) return false;
	if (mapCode(event.code) !== keys.key) return false;
	return true;
};
//#endregion
//#region src/utils/hotkey/registerHotkey.ts
const logger$10 = createDebugLogger("hotkey");
const registerHotkey = (hotkey, callback, options = {}) => {
	return (e) => {
		if (!isHotkeyMatch(e, hotkey.keys)) return false;
		const keys = parseHotkey(hotkey.keys);
		if (options.preventDefault) e.preventDefault();
		if (options.stopPropagation) e.stopPropagation();
		callback(e, {
			keys: hotkey.keys,
			...keys,
			scopes: hotkey.scopes
		});
		logger$10.debug(`⌨️ Hotkey matched: ${hotkey.id} [${hotkey.keys}]`, hotkey);
		return true;
	};
};
const getHotkeyById = (id) => {
	return HOTKEYS_REGISTRATION.find((hotkey) => hotkey.id === id);
};
//#endregion
//#region src/editor-kernel/event.ts
const HOVER_COMMAND = createCommand();
function registerEvent(editor, dom) {
	const hoverHandler = (event) => {
		editor.dispatchCommand(HOVER_COMMAND, event);
	};
	dom.addEventListener("mouseenter", hoverHandler);
	return () => {
		dom.removeEventListener("mouseenter", hoverHandler);
	};
}
//#endregion
//#region src/editor-kernel/plugin.ts
var KernelPlugin = class extends EventEmitter {
	constructor(..._args) {
		super(..._args);
		this.clears = [];
		this.registeredDecorators = /* @__PURE__ */ new Set();
	}
	register(clear) {
		this.clears.push(clear);
	}
	registerClears(...clears) {
		clears.forEach((clear) => this.register(clear));
	}
	/**
	* Register a node transform and automatically clean it up on plugin destroy
	*/
	registerNodeTransform(kernel, transform) {
		this.register(kernel.registerNodeTransform(transform));
	}
	/**
	* Register className(s) on contenteditable root and auto cleanup
	*/
	registerRootClassName(kernel, className) {
		this.register(kernel.registerRootClassName(className));
	}
	/**
	* Register a decorator and track it for cleanup
	*/
	registerDecorator(kernel, name, decorator) {
		kernel.registerDecorator(name, decorator);
		this.registeredDecorators.add(name);
	}
	/**
	* Unregister a specific decorator
	*/
	unregisterDecorator(kernel, name) {
		const result = kernel.unregisterDecorator(name);
		if (result) this.registeredDecorators.delete(name);
		return result;
	}
	/**
	* Get all decorator names registered by this plugin
	*/
	getRegisteredDecorators() {
		return Array.from(this.registeredDecorators);
	}
	destroy() {
		this.clears.forEach((clear) => clear());
		this.registeredDecorators.clear();
	}
};
//#endregion
//#region src/editor-kernel/utils.ts
function genServiceId(name) {
	return { __serviceId: name };
}
const noop = () => {};
function createEmptyEditorState() {
	return createEditor().getEditorState();
}
function assert(cond, message) {
	if (cond) return;
	throw new Error(message);
}
function getNodeKeyFromDOMNode(dom, editor) {
	return dom[`__lexicalKey_${editor._key}`];
}
function $getNodeFromDOMNode(dom, editor, editorState) {
	const key = getNodeKeyFromDOMNode(dom, editor);
	if (key !== void 0) return $getNodeByKey(key, editorState);
	return null;
}
function getKernelFromEditor(editor) {
	return editor._createEditorArgs?.__kernel || editor._kernel;
}
let EditorId = 0;
const EDITOR_THEME_KEY = "__editorId";
function generateEditorId() {
	EditorId += 1;
	return `editor-${EditorId}`;
}
const EditorMap = /* @__PURE__ */ new Map();
function registerEditorKernel(id, kernel) {
	EditorMap.set(id, kernel);
}
function unregisterEditorKernel(id) {
	EditorMap.delete(id);
}
function getKernelFromEditorConfig(config) {
	const id = config.theme[EDITOR_THEME_KEY];
	return EditorMap.get(id) || null;
}
function $closest(node, test) {
	let current = node;
	while (current) {
		if (test(current)) return current;
		current = current.getParent();
	}
	return null;
}
function moment() {
	return new Promise((resolve) => {
		queueMicrotask(() => resolve(true));
	});
}
function cloneDecorators(editor) {
	const currentDecorators = editor._decorators;
	const pendingDecorators = Object.assign({}, currentDecorators);
	editor._pendingDecorators = pendingDecorators;
	return pendingDecorators;
}
function reconcileDecorator(activeEditor, key, decorator) {
	let pendingDecorators = activeEditor._pendingDecorators;
	const currentDecorators = activeEditor._decorators;
	if (pendingDecorators === null) {
		if (currentDecorators[key] === decorator) return;
		pendingDecorators = cloneDecorators(activeEditor);
	}
	pendingDecorators[key] = decorator;
}
//#endregion
//#region src/editor-kernel/kernel.ts
templateSettings.interpolate = /{{([\S\s]+?)}}/g;
var Kernel = class Kernel extends EventEmitter {
	static {
		this.globalHotReloadMode = void 0;
	}
	constructor() {
		super();
		this.plugins = [];
		this.pluginsConfig = /* @__PURE__ */ new Map();
		this.pluginsInstances = [];
		this.beforeEditorInitHooks = [];
		this.nodeTransforms = [];
		this.rootClassNames = /* @__PURE__ */ new Set();
		this.nodes = [];
		this.themes = { [EDITOR_THEME_KEY]: generateEditorId() };
		this.decorators = {};
		this.serviceMap = /* @__PURE__ */ new Map();
		this.localeMap = locale_default;
		this.hotReloadMode = false;
		this.logger = createDebugLogger("kernel");
		this.historyState = createEmptyHistoryState();
		this.headlessEditor = false;
		this._commands = /* @__PURE__ */ new Map();
		this._commandsClean = /* @__PURE__ */ new Map();
		this.dataTypeMap = /* @__PURE__ */ new Map();
		this.hotReloadMode = this.detectDevelopmentMode();
		this.logger.info(`🚀 Kernel initialized (hot reload: ${this.hotReloadMode})`);
	}
	cloneNodeEditor() {
		const newKernel = new Kernel();
		newKernel.registerPlugins(this.plugins);
		newKernel.initNodeEditor();
		newKernel.setDocument("json", this.getDocument("json") || "{}", { keepId: true });
		return newKernel;
	}
	getHistoryState() {
		return this.historyState;
	}
	isEditable() {
		return this.editor?.isEditable() || false;
	}
	detectDevelopmentMode() {
		if (Kernel.globalHotReloadMode !== void 0) return Kernel.globalHotReloadMode;
		if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") return true;
		if (typeof window !== "undefined") {
			if (window.webpackHotUpdate) return true;
			if (window.__vite_plugin_react_preamble_installed__) return true;
			if (window.__NEXT_DATA__?.buildId === "development") return true;
		}
		if (typeof window !== "undefined" && window.location) {
			const hostname = window.location.hostname;
			if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) return true;
		}
		return true;
	}
	/**
	* Globally enable or disable hot reload mode for all kernel instances
	* @param enabled Whether to enable hot reload mode globally
	*/
	static setGlobalHotReloadMode(enabled) {
		Kernel.globalHotReloadMode = enabled;
	}
	/**
	* Reset global hot reload mode to automatic detection
	*/
	static resetGlobalHotReloadMode() {
		Kernel.globalHotReloadMode = void 0;
	}
	getLexicalEditor() {
		return this.editor || null;
	}
	destroy() {
		const editor = this.editor;
		const editorId = this.getEditorId();
		this.logger.info(`🗑️ Destroying editor with ${this.pluginsInstances.length} plugins`);
		if (editor) try {
			editor.setRootElement(null);
		} catch (error) {
			this.logger.warn("Failed to detach editor root during destroy:", error);
		}
		unregisterEditorKernel(editorId);
		try {
			editor?.setEditorState(createEmptyEditorState());
		} catch (error) {
			this.logger.warn("Failed to reset editor state during destroy:", error);
		}
		this.unregisterRootLifecycle?.();
		this.unregisterRootLifecycle = void 0;
		let destroyError;
		this.pluginsInstances.forEach((plugin) => {
			try {
				plugin.destroy?.();
			} catch (error) {
				destroyError ??= error;
			}
		});
		this.pluginsInstances = [];
		this.dataTypeMap.clear();
		this.decorators = {};
		this.nodeTransforms = [];
		this.nodes = [];
		this.beforeEditorInitHooks = [];
		this.rootClassNames.clear();
		this.serviceMap.clear();
		this.themes = { [EDITOR_THEME_KEY]: generateEditorId() };
		this.historyState = createEmptyHistoryState();
		this._commands.clear();
		this._commandsClean.clear();
		this.editor = void 0;
		this.headlessEditor = false;
		this.logger.info("✅ Editor destroyed");
		if (destroyError) throw destroyError;
	}
	getRootElement() {
		if (this.headlessEditor) return null;
		return this.editor?.getRootElement() || null;
	}
	setRootElement(dom, editable = true) {
		if (this.editor) {
			if (this.headlessEditor) {
				if (dom === null) return this.editor;
				throw new Error("Headless editor cannot be attached to a root element.");
			}
			this.logger.warn("[Editor] Editor is already initialized, updating root element only");
			if (dom) registerEditorKernel(this.getEditorId(), this);
			this.editor.setRootElement(dom);
			if (dom) {
				this.editor.setEditable(editable);
				this.applyRootClassNames(dom);
			}
			return this.editor;
		}
		if (dom === null) {
			unregisterEditorKernel(this.getEditorId());
			return null;
		}
		if (this.pluginsInstances.length === 0) {
			this.logger.info(`🔌 Initializing ${this.plugins.length} plugins`);
			for (const plugin of this.plugins) {
				const instance = new plugin(this, this.pluginsConfig.get(plugin));
				this.pluginsInstances.push(instance);
			}
		}
		this.runBeforeEditorInitLifecycle();
		const resolvedNodes = this.resolveNodesForInitialization();
		this.logger.info(`📝 Creating editor with ${resolvedNodes.length} nodes`);
		registerEditorKernel(this.getEditorId(), this);
		const editor = this.editor = createEditor({
			__kernel: this,
			editable,
			namespace: "lobehub",
			nodes: resolvedNodes,
			onError: (error) => {
				this.logger.error("❌ Lexical editor error:", error);
				this.emit("error", error);
			},
			theme: this.themes
		});
		this.headlessEditor = false;
		this.registerRootLifecycle(editor);
		this.editor.setRootElement(dom);
		this.applyRootClassNames(dom);
		this.pluginsInstances.forEach((plugin) => {
			plugin.onInit?.(editor);
		});
		this.logger.info(`✅ Editor ready with ${this.pluginsInstances.length} plugins`);
		this.emit("initialized", editor);
		return this.editor;
	}
	setEditable(editable) {
		if (!this.editor) {
			this.logger.error("❌ Editor not initialized");
			throw new Error(`Editor is not initialized.`);
		}
		this.editor.setEditable(editable);
		this.emit("editableChange", editable);
		this.logger.debug(`✏️ Editor editable set to ${editable}`);
	}
	initNodeEditor() {
		if (this.editor) return this.editor;
		if (this.pluginsInstances.length === 0) {
			this.logger.info(`🔌 Initializing ${this.plugins.length} plugins`);
			for (const plugin of this.plugins) {
				const instance = new plugin(this, this.pluginsConfig.get(plugin));
				this.pluginsInstances.push(instance);
			}
		}
		this.runBeforeEditorInitLifecycle();
		const resolvedNodes = this.resolveNodesForInitialization();
		this.logger.info(`📝 Creating editor with ${resolvedNodes.length} nodes`);
		const editor = this.editor = createEditor({
			__kernel: this,
			namespace: "lobehub",
			nodes: resolvedNodes,
			onError: (error) => {
				this.logger.error("❌ Lexical editor error:", error);
				this.emit("error", error);
			},
			theme: this.themes
		});
		this.headlessEditor = false;
		this.registerRootLifecycle(editor);
		this.pluginsInstances.forEach((plugin) => {
			plugin.onInit?.(editor);
		});
		this.logger.info(`✅ Editor ready with ${this.pluginsInstances.length} plugins`);
		this.emit("initialized", editor);
		return editor || null;
	}
	initHeadlessEditor() {
		if (this.editor) return this.editor;
		if (this.pluginsInstances.length === 0) {
			this.logger.info(`🔌 Initializing ${this.plugins.length} plugins`);
			for (const plugin of this.plugins) {
				const instance = new plugin(this, this.pluginsConfig.get(plugin));
				this.pluginsInstances.push(instance);
			}
		}
		this.runBeforeEditorInitLifecycle();
		const resolvedNodes = this.resolveNodesForInitialization();
		this.logger.info(`📝 Creating headless editor with ${resolvedNodes.length} nodes`);
		const editor = this.editor = createHeadlessEditor$1({
			__kernel: this,
			namespace: "lobehub-headless",
			nodes: resolvedNodes,
			onError: (error) => {
				this.logger.error("❌ Lexical headless editor error:", error);
				this.emit("error", error);
			},
			theme: this.themes
		});
		this.headlessEditor = true;
		this.pluginsInstances.forEach((plugin) => {
			plugin.onInit?.(editor);
		});
		this.logger.info(`✅ Headless editor ready with ${this.pluginsInstances.length} plugins`);
		this.emit("initialized", editor);
		return editor || null;
	}
	setDocument(type, content, options) {
		const datasource = this.dataTypeMap.get(type);
		if (!datasource) {
			this.logger.error(`❌ DataSource for type "${type}" not found`);
			throw new Error(`DataSource for type "${type}" is not registered.`);
		}
		if (!this.editor) {
			this.logger.error("❌ Editor not initialized");
			throw new Error(`Editor is not initialized.`);
		}
		if (!options?.keepHistory) {
			this.historyState.redoStack = [];
			this.historyState.undoStack = [];
			this.historyState.current = null;
		}
		datasource.read(this.editor, content, options);
		this.pluginsInstances.forEach((plugin) => {
			plugin.onDocumentChange?.(type, content, options);
		});
		this.emit("documentChange", type, content);
		this.logger.debug(`📥 Set ${type} document`);
	}
	setSelection(selection, opt) {
		if (!this.editor) {
			this.logger.error("❌ Editor not initialized");
			throw new Error(`Editor is not initialized.`);
		}
		const editor = this.editor;
		return new Promise((resolve) => {
			editor.update(() => {
				try {
					if (selection.type === "range") {
						const startNodeId = opt?.collapseToEnd ? selection.endNodeId : selection.startNodeId;
						const endNodeId = opt?.collapseToStart ? selection.startNodeId : selection.endNodeId;
						const startOffset = opt?.collapseToEnd ? selection.endOffset : selection.startOffset;
						const endOffset = opt?.collapseToStart ? selection.startOffset : selection.endOffset;
						const anchorNode = $getNodeByKey(startNodeId);
						const focusNode = $getNodeByKey(endNodeId);
						if (!anchorNode || !focusNode) {
							this.logger.error("❌ Nodes for selection not found");
							resolve(false);
							return;
						}
						const rng = $createRangeSelection();
						rng.anchor.set(anchorNode.getKey(), startOffset, $isElementNode(anchorNode) ? "element" : "text");
						rng.focus.set(focusNode.getKey(), endOffset, $isElementNode(focusNode) ? "element" : "text");
						$setSelection(rng);
						resolve(true);
						return;
					}
					if (selection.type === "node") {
						if (!$getNodeByKey(selection.startNodeId)) {
							this.logger.error("❌ Node for selection not found");
							resolve(false);
							return;
						}
						const nodeSel = $createNodeSelection();
						nodeSel.add(selection.startNodeId);
						$setSelection(nodeSel);
						resolve(true);
						return;
					}
					if (selection.type === "table") {
						const startNode = $getNodeByKey(selection.startNodeId);
						if (!startNode) {
							this.logger.error("❌ Node for selection not found");
							resolve(false);
							return;
						}
						const endNode = $getNodeByKey(selection.endNodeId);
						if (!endNode) {
							this.logger.error("❌ Node for selection not found");
							resolve(false);
							return;
						}
						const table1 = $closest(startNode, (n) => $isTableNode(n));
						const table2 = $closest(endNode, (n) => $isTableNode(n));
						if (!table1 || !table2 || table1 !== table2) {
							this.logger.error("❌ Table nodes for selection not found or do not match");
							resolve(false);
							return;
						}
						const rng = $createTableSelection();
						rng.set(table1.getKey(), selection.startNodeId, selection.endNodeId);
						$setSelection(rng);
						resolve(true);
						return;
					}
					resolve(false);
				} catch (error) {
					this.logger.error("❌ Error setting selection:", error);
					resolve(false);
				}
			});
		});
	}
	getSelection() {
		if (!this.editor) {
			this.logger.error("❌ Editor not initialized");
			throw new Error(`Editor is not initialized.`);
		}
		return this.editor.read(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) return {
				endNodeId: selection.focus.getNode().getKey(),
				endOffset: selection.focus.offset,
				startNodeId: selection.anchor.getNode().getKey(),
				startOffset: selection.anchor.offset,
				type: "range"
			};
			if ($isNodeSelection(selection)) return {
				endNodeId: selection.getNodes()[0].getKey(),
				endOffset: 0,
				startNodeId: selection.getNodes()[0].getKey(),
				startOffset: 0,
				type: "node"
			};
			if ($isTableSelection(selection)) {
				const [start, end] = selection.getStartEndPoints();
				return {
					endNodeId: end.getNode().getKey(),
					endOffset: end.offset,
					startNodeId: start.getNode().getKey(),
					startOffset: start.offset,
					type: "table"
				};
			}
			return null;
		});
	}
	focus() {
		if (this.headlessEditor) return;
		this.editor?.focus();
	}
	blur() {
		if (this.headlessEditor) return;
		this.editor?.blur();
	}
	getDocument(type) {
		const datasource = this.dataTypeMap.get(type);
		if (!datasource) {
			this.logger.error(`❌ DataSource for type "${type}" not found`);
			throw new Error(`DataSource for type "${type}" is not registered.`);
		}
		if (!this.editor) {
			this.logger.error("❌ Editor not initialized");
			throw new Error(`Editor is not initialized.`);
		}
		return datasource.write(this.editor);
	}
	getSelectionDocument(type) {
		const datasource = this.dataTypeMap.get(type);
		if (!datasource) throw new Error(`DataSource for type "${type}" is not registered.`);
		if (!this.editor) throw new Error(`Editor is not initialized.`);
		return datasource.write(this.editor, { selection: true });
	}
	registerDecorator(name, decorator) {
		if (this.decorators[name]) {
			if (this.hotReloadMode) {
				this.logger.warn(`🔄 Hot reload: decorator "${name}"`);
				this.decorators[name] = decorator;
				return this;
			} else {
				if (this.decorators[name] === decorator) {
					this.logger.warn(`[Editor] Decorator "${name}" is already registered with the same function`);
					return this;
				}
				this.logger.error(`[Editor] Attempting to register duplicate decorator "${name}". Enable hot reload mode if this is intended.`);
				throw new Error(`Decorator with name "${name}" is already registered.`);
			}
		}
		this.decorators[name] = decorator;
		this.logger.debug(`🎭 Decorator: ${name}`);
		return this;
	}
	getDecorator(name) {
		return this.decorators[name];
	}
	/**
	* Unregister a decorator
	* @param name Decorator name
	*/
	unregisterDecorator(name) {
		if (this.decorators[name]) {
			delete this.decorators[name];
			this.logger.debug(`🗑️ Removed decorator: ${name}`);
			return true;
		}
		this.logger.warn(`⚠️ Decorator "${name}" not found`);
		return false;
	}
	/**
	* Get all registered decorator names
	*/
	getRegisteredDecorators() {
		return Object.keys(this.decorators);
	}
	/**
	* Support registering target data source
	* @param dataSource Data source
	*/
	registerDataSource(dataSource) {
		this.dataTypeMap.set(dataSource.type, dataSource);
		this.logger.debug(`📄 Data source: ${dataSource.type}`);
	}
	registerThemes(themes) {
		this.themes = merge(this.themes, themes);
	}
	registerPlugin(plugin, config) {
		const findPlugin = this.plugins.find((p) => p.pluginName === plugin.pluginName);
		if (findPlugin) {
			if (findPlugin !== plugin) {
				if (this.hotReloadMode) {
					this.logger.warn(`🔄 Hot reload: plugin "${plugin.pluginName}"`);
					const index = this.plugins.findIndex((p) => p.pluginName === plugin.pluginName);
					if (index !== -1) {
						this.plugins.splice(index, 1);
						const instanceIndex = this.pluginsInstances.findIndex((instance) => {
							return instance.constructor.pluginName === plugin.pluginName;
						});
						if (instanceIndex !== -1) {
							const oldInstance = this.pluginsInstances[instanceIndex];
							if (oldInstance instanceof KernelPlugin) {
								const decoratorNames = oldInstance.getRegisteredDecorators();
								for (const decoratorName of decoratorNames) {
									this.unregisterDecorator(decoratorName);
									this.logger.debug(`🧨 Cleanup: decorator "${decoratorName}"`);
								}
							}
							if (oldInstance.destroy) oldInstance.destroy();
							this.pluginsInstances.splice(instanceIndex, 1);
						}
					}
				} else throw new Error(`Plugin with name "${plugin.pluginName}" is already registered with a different implementation.`);
			} else {
				if (config !== void 0) this.pluginsConfig.set(plugin, config);
				return this;
			}
		}
		this.pluginsConfig.set(plugin, config || {});
		this.plugins.push(plugin);
		this.logger.debug(`🔌 Plugin: ${plugin.pluginName}`);
		return this;
	}
	registerPlugins(plugins) {
		for (const plugin of plugins) if (Array.isArray(plugin)) this.registerPlugin(plugin[0], plugin[1]);
		else this.registerPlugin(plugin);
		this.logger.debug(`🔌 Registered ${plugins.length} plugins`);
		return this;
	}
	registerNodes(nodes) {
		const nodeTypes = nodes.map((node) => {
			if (typeof node === "function" && node.getType) return node.getType();
			else if (typeof node === "object" && node.replace && typeof node.replace === "function" && node.replace.getType) return node.replace.getType();
			return "unknown";
		}).filter((type) => type !== "unknown");
		this.nodes.push(...nodes);
		if (nodeTypes.length > 3) this.logger.debug(`🧩 Nodes: ${nodeTypes.length} types`);
		else this.logger.debug(`🧩 Nodes: ${nodeTypes.join(", ")}`);
	}
	registerNodeTransform(transform) {
		this.nodeTransforms.push(transform);
		return () => {
			this.nodeTransforms = this.nodeTransforms.filter((item) => item !== transform);
		};
	}
	registerBeforeEditorInit(hook) {
		this.beforeEditorInitHooks.push(hook);
		return () => {
			this.beforeEditorInitHooks = this.beforeEditorInitHooks.filter((item) => item !== hook);
		};
	}
	registerRootClassName(className) {
		const classNames = className.split(/\s+/).filter(Boolean);
		for (const item of classNames) this.rootClassNames.add(item);
		const rootElement = this.editor?.getRootElement();
		if (rootElement) rootElement.classList.add(...classNames);
		return () => {
			for (const item of classNames) this.rootClassNames.delete(item);
			const currentRootElement = this.editor?.getRootElement();
			if (currentRootElement) currentRootElement.classList.remove(...classNames);
		};
	}
	registerRootListener(listener) {
		if (!this.editor || this.headlessEditor) return noop;
		return this.editor.registerRootListener(listener);
	}
	getEditorId() {
		return this.themes[EDITOR_THEME_KEY];
	}
	registerRootLifecycle(editor) {
		this.unregisterRootLifecycle?.();
		let rootEventCleanup;
		const clearRootEvent = () => {
			rootEventCleanup?.();
			rootEventCleanup = void 0;
		};
		const unregisterRootListener = editor.registerRootListener((rootElement) => {
			clearRootEvent();
			if (!rootElement) {
				unregisterEditorKernel(this.getEditorId());
				return;
			}
			registerEditorKernel(this.getEditorId(), this);
			rootEventCleanup = registerEvent(editor, rootElement);
		});
		this.unregisterRootLifecycle = () => {
			clearRootEvent();
			unregisterRootListener();
		};
	}
	runBeforeEditorInitLifecycle() {
		for (const hook of this.beforeEditorInitHooks) hook();
	}
	applyRootClassNames(dom) {
		if (this.rootClassNames.size === 0) return;
		dom.classList.add(...Array.from(this.rootClassNames));
	}
	resolveNodesForInitialization() {
		const resolvedNodes = this.nodes.flatMap((node, index) => {
			let transformedNode = node;
			for (const transform of this.nodeTransforms) {
				transformedNode = transform(transformedNode, index);
				if (!transformedNode) return [];
			}
			return [transformedNode];
		});
		if (resolvedNodes.length !== this.nodes.length) this.logger.debug(`🧩 Node transform filtered ${this.nodes.length - resolvedNodes.length} nodes before editor initialization`);
		return resolvedNodes;
	}
	registerService(serviceId, service) {
		const serviceIdString = serviceId.__serviceId;
		if (this.serviceMap.has(serviceIdString)) {
			if (this.hotReloadMode) {
				this.logger.warn(`🔄 Hot reload: service "${serviceIdString}"`);
				this.serviceMap.set(serviceIdString, service);
				return;
			} else {
				if (this.serviceMap.get(serviceIdString) === service) {
					this.logger.warn(`[Editor] Service "${serviceIdString}" is already registered with the same instance`);
					return;
				}
				this.logger.error(`[Editor] Attempting to register duplicate service "${serviceIdString}". Enable hot reload mode if this is intended.`);
				throw new Error(`Service with ID "${serviceIdString}" is already registered.`);
			}
		}
		this.serviceMap.set(serviceIdString, service);
		this.logger.debug(`🔧 Service: ${serviceIdString}`);
	}
	/**
	* Register service with hot reload support - allows overriding existing services
	* @param serviceId Service identifier
	* @param service Service instance
	*/
	registerServiceHotReload(serviceId, service) {
		this.serviceMap.set(serviceId.__serviceId, service);
		this.logger.debug(`🔄 Hot-reload service: ${serviceId.__serviceId}`);
	}
	/**
	* Enable or disable hot reload mode
	* @param enabled Whether to enable hot reload mode
	*/
	setHotReloadMode(enabled) {
		this.hotReloadMode = enabled;
	}
	/**
	* Check if hot reload mode is enabled
	*/
	isHotReloadMode() {
		return this.hotReloadMode;
	}
	/**
	* Get service
	* @param serviceId Service ID
	*/
	requireService(serviceId) {
		const service = this.serviceMap.get(serviceId.__serviceId);
		if (!service) return null;
		return service;
	}
	dispatchCommand(type, payload) {
		if (!this.editor) throw new Error("Editor is not initialized.");
		return this.editor.dispatchCommand(type, payload);
	}
	getTheme() {
		return this.themes;
	}
	updateTheme(key, value) {
		this.themes[key] = value;
	}
	registerLocale(locale) {
		const localeKeys = Object.keys(locale);
		this.localeMap = merge(this.localeMap, locale);
		this.logger.debug(`🌐 Locale: ${localeKeys.length} keys`);
	}
	t(key, params) {
		let translation = get(this.localeMap, key) || key;
		if (params) translation = template(translation)(params);
		return translation;
	}
	get isEmpty() {
		if (!this.editor) return true;
		return this.editor.getEditorState().read(() => {
			return $isRootTextContentEmpty(this.editor.isComposing(), true);
		});
	}
	get isSelected() {
		if (!this.editor) return false;
		return this.editor.getEditorState().read(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) return !!selection._cachedNodes;
			return false;
		});
	}
	cleanDocument() {
		this.setDocument("text", "");
	}
	registerHotkey(hotkeyId, callback, options = {}) {
		const lexicalEditor = this.editor;
		if (!lexicalEditor) throw new Error("Editor is not initialized.");
		const hotkey = getHotkeyById(hotkeyId);
		if (!hotkey) return () => false;
		if (options.enabled === false) return () => false;
		this.logger.debug(`⌨️ Hotkey: ${hotkey.id}`);
		return lexicalEditor.registerCommand(KEY_DOWN_COMMAND, registerHotkey(hotkey, callback, options), hotkey.priority);
	}
	registerHighCommand(command, listener, priority) {
		const lexicalEditor = this.editor;
		if (!lexicalEditor) throw new Error("Editor is not initialized.");
		const commandsMap = this._commands;
		if (!commandsMap.has(command)) {
			commandsMap.set(command, [
				/* @__PURE__ */ new Set(),
				/* @__PURE__ */ new Set(),
				/* @__PURE__ */ new Set(),
				/* @__PURE__ */ new Set(),
				/* @__PURE__ */ new Set()
			]);
			this._commandsClean.set(command, lexicalEditor.registerCommand(command, (payload) => {
				for (let i = 4; i >= 0; i--) {
					const listenerInPriorityOrder = this._commands.get(command);
					if (listenerInPriorityOrder !== void 0) {
						const listenersSet = listenerInPriorityOrder[i];
						for (const listener of listenersSet) if (listener(payload, lexicalEditor)) return true;
					}
				}
				return false;
			}, COMMAND_PRIORITY_CRITICAL));
			if (!command.type?.includes("KEY")) this.logger.debug(`⚡ Command: ${command.type || "unknown"}`);
		}
		const listenersInPriorityOrder = commandsMap.get(command);
		if (listenersInPriorityOrder === void 0) return noop;
		const listeners = listenersInPriorityOrder[priority];
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
			if (listenersInPriorityOrder.every((listenersSet) => listenersSet.size === 0)) {
				commandsMap.delete(command);
				this._commandsClean.get(command)?.();
			}
		};
	}
};
//#endregion
//#region src/editor-kernel/data-source.ts
var DataSource = class {
	constructor(dataType) {
		this.dataType = dataType;
	}
	get type() {
		return this.dataType;
	}
	read(editor, data, options) {}
	write(editor, options) {
		return null;
	}
};
//#endregion
//#region src/editor-kernel/index.ts
/**
* Editor object to create an instance of the editor
*/
const Editor = { createEditor() {
	return new Kernel();
} };
//#endregion
//#region src/plugins/common/command/index.ts
const INSERT_QUOTE_COMMAND = createCommand("INSERT_QUOTE_COMMAND");
const INSERT_HEADING_COMMAND = createCommand("INSERT_HEADING_COMMAND");
function registerCommands(editor) {
	return mergeRegister(editor.registerCommand(INSERT_QUOTE_COMMAND, () => {
		editor.update(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createQuoteNode());
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(INSERT_HEADING_COMMAND, (payload) => {
		editor.update(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode(payload.tag));
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR));
}
//#endregion
//#region src/plugins/common/node/cursor.ts
const logger$9 = createDebugLogger("common", "cursor");
var CardLikeElementNode = class extends ElementNode {
	isCardLike() {
		return true;
	}
};
const cursorNodeSerialized = {
	detail: 0,
	format: 0,
	mode: "normal",
	style: "",
	text: "﻿",
	type: "cursor",
	version: 1
};
var CursorNode = class extends TextNode {
	static getType() {
		return "cursor";
	}
	isUnmergeable() {
		return true;
	}
};
function $createCursorNode() {
	return new CursorNode("﻿");
}
function $isCardLikeElementNode(node) {
	return node instanceof CardLikeElementNode;
}
function $isCursorNode(node) {
	return node instanceof CursorNode;
}
function registerCursorNode(editor) {
	return mergeRegister(editor.registerUpdateListener(({ mutatedNodes }) => {
		editor.getEditorState().read(() => {
			if (!mutatedNodes) return;
			const needAddCursor = [];
			for (const [kClass, nodeMaps] of mutatedNodes) if (DecoratorNode.prototype.isPrototypeOf(kClass.prototype)) for (const [key, mutation] of nodeMaps) {
				const node = $getNodeByKey(key);
				logger$9.debug("🎭 DecoratorNode mutated:", node?.getType(), mutation, node);
				if (mutation === "created" && node?.isInline() && node.getNextSibling() === null) needAddCursor.push(node);
			}
			if (needAddCursor.length > 0) editor.update(() => {
				needAddCursor.forEach((node) => {
					node.insertAfter($createCursorNode());
				});
			}, { tag: HISTORY_MERGE_TAG });
			return false;
		});
	}), editor.registerUpdateListener(({ mutatedNodes }) => {
		editor.getEditorState().read(() => {
			const cursorNodes = mutatedNodes?.get(CursorNode);
			const needRemove = /* @__PURE__ */ new Set();
			if (cursorNodes) {
				for (const [key, mutation] of cursorNodes) if (mutation === "updated") {
					const cursorNode = $getNodeByKey(key);
					if (cursorNode?.getIndexWithinParent() === 0) {
						const nextElement = cursorNode.getNextSibling();
						if (!$isCardLikeElementNode(nextElement) && !$isDecoratorNode(nextElement) && !$isCardLikeElementNode(cursorNode?.getParent())) needRemove.add(cursorNode);
						else continue;
					}
					const element = cursorNode?.getPreviousSibling();
					if (!$isCardLikeElementNode(element) && !$isDecoratorNode(element) && !$isCardLikeElementNode(cursorNode?.getParent())) needRemove.add(cursorNode);
				}
			}
			if (needRemove.size > 0) editor.update(() => {
				needRemove.forEach((node) => {
					node.remove();
				});
			}, { tag: HISTORY_MERGE_TAG });
			return false;
		});
	}), editor.registerUpdateListener(() => {
		editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (editor.isComposing()) return false;
			if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
			const node = selection.anchor.getNode();
			if (node instanceof CursorNode) {
				if (node.__text !== "﻿") editor.update(() => {
					node.setTextContent("﻿");
					const data = node.__text.replace("﻿", "");
					if (data) {
						const textNode = $createTextNode(data);
						node.insertAfter(textNode);
						textNode.selectEnd();
					}
				}, { tag: HISTORY_MERGE_TAG });
				return false;
			}
		});
	}), editor.registerCommand(KEY_BACKSPACE_COMMAND, (event) => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
		const node = selection.anchor.getNode();
		if (node instanceof CursorNode) {
			event.preventDefault();
			const prev = node.getPreviousSibling();
			const parent = node.getParent();
			const parentPrev = parent?.getPreviousSibling();
			let needDispatch = false;
			if ($isDecoratorNode(prev)) {
				prev.selectPrevious();
				node.remove();
				prev.remove();
				event.preventDefault();
				return true;
			} else if (prev) {
				prev.selectEnd();
				needDispatch = true;
			} else if (parent) {
				if (parent.getChildrenSize() === 1) parent.remove();
				else if (parentPrev) {
					parentPrev.selectEnd();
					needDispatch = true;
				}
			}
			if (needDispatch) queueMicrotask(() => {
				editor.dispatchCommand(KEY_BACKSPACE_COMMAND, event);
			});
			return true;
		}
		return false;
	}, COMMAND_PRIORITY_HIGH), editor.registerCommand(KEY_ARROW_LEFT_COMMAND, (event) => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return false;
		const focusNode = selection.focus.getNode();
		if (!event.shiftKey) {
			if (focusNode instanceof CursorNode && !$isCardLikeElementNode(focusNode.getParent()) && !$isCardLikeElementNode(focusNode.getPreviousSibling())) focusNode.selectStart();
			return false;
		}
		const prev = focusNode.getPreviousSibling();
		if (selection.focus.offset === 0 && $isCursorNode(prev)) try {
			const { key: anchorKey, offset: anchorOffset, type: anchorType } = selection.anchor;
			const sel = prev.selectPrevious();
			const { key, offset, type } = sel.anchor;
			sel.anchor.set(anchorKey, anchorOffset, anchorType);
			sel.focus.set(key, offset, type);
			$setSelection(sel);
			return true;
		} catch (error) {
			logger$9.error("❌ Cursor selection error:", error);
		}
		else if ($isCursorNode(focusNode)) try {
			const { key: anchorKey, offset: anchorOffset, type: anchorType } = selection.anchor;
			const sel = focusNode.selectPrevious();
			const { key, offset, type } = sel.anchor;
			sel.anchor.set(anchorKey, anchorOffset, anchorType);
			sel.focus.set(key, offset, type);
			$setSelection(sel);
			return true;
		} catch (error) {
			logger$9.error("❌ Cursor navigation error:", error);
		}
		return false;
	}, COMMAND_PRIORITY_HIGH), editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, (event) => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return false;
		if (!event.shiftKey) {
			const focusNode = selection.focus.getNode();
			if (focusNode instanceof CursorNode && !$isCardLikeElementNode(focusNode.getParent()) && !$isCardLikeElementNode(focusNode.getPreviousSibling())) focusNode.selectEnd();
			return false;
		}
		const { key: anchorKey, offset: anchorOffset, type: anchorType } = selection.anchor;
		const { key: focusKey, offset: focusOffset, type: focusType } = selection.focus;
		const focusNode = selection.focus.getNode();
		if (focusType === "text" && focusOffset !== focusNode.getTextContentSize() || focusType === "element" && focusOffset !== focusNode.getChildrenSize()) return false;
		const sel = focusNode.selectNext();
		if ($isCursorNode(sel.focus.getNode())) {
			sel.focus.getNode().selectNext();
			const { key, offset, type } = sel.anchor;
			sel.anchor.set(anchorKey, anchorOffset, anchorType);
			sel.focus.set(key, offset, type);
			$setSelection(sel);
			return true;
		} else {
			selection.anchor.set(anchorKey, anchorOffset, anchorType);
			selection.focus.set(focusKey, focusOffset, focusType);
		}
		return false;
	}, COMMAND_PRIORITY_HIGH));
}
//#endregion
//#region src/plugins/common/service/node-identity-service.ts
const logger$8 = createDebugLogger("service", "node-identity");
/** Implementation owned by CommonPlugin; external callers use INodeIdentityService. */
var NodeIdentityService = class {
	constructor() {
		this.editor = null;
		this.indexes = /* @__PURE__ */ new WeakMap();
		this.listeners = /* @__PURE__ */ new Set();
		this.bindingToken = null;
		this.unregisterBinding = null;
	}
	bindEditor(editor) {
		this.unregisterBinding?.();
		const bindingToken = {};
		this.bindingToken = bindingToken;
		this.indexes = /* @__PURE__ */ new WeakMap();
		this.editor = editor;
		const unregisterUpdate = editor.registerUpdateListener(({ editorState, prevEditorState }) => {
			if (editorState !== prevEditorState) this.notify();
		});
		const unregisterPolicy = subscribeNodeIdentityPolicy(editor, () => this.notify());
		let active = true;
		const unregister = () => {
			if (!active) return;
			active = false;
			unregisterUpdate();
			unregisterPolicy();
		};
		this.unregisterBinding = unregister;
		return () => {
			unregister();
			if (this.bindingToken !== bindingToken) return;
			this.bindingToken = null;
			this.unregisterBinding = null;
			this.editor = null;
			this.indexes = /* @__PURE__ */ new WeakMap();
			this.listeners.clear();
		};
	}
	getNodeById(nodeId) {
		if (typeof nodeId !== "string" || !nodeId.trim()) return null;
		const editor = this.editor;
		if (!editor) return null;
		const editorState = editor.getEditorState();
		const revision = getNodeIdentityPolicyRevision(editor);
		let index = this.indexes.get(editorState);
		if (!index || index.revision !== revision) {
			index = {
				keys: editorState.read(() => $getActiveNodeIdKeys(), { editor }),
				revision
			};
			this.indexes.set(editorState, index);
		}
		const key = index.keys.get(nodeId);
		if (!key) return null;
		return editorState.read(() => {
			const node = $getNodeByKey(key);
			const id = node && $getNodeId(node);
			return node && id === nodeId ? Object.freeze({
				id,
				textContent: node.getTextContent(),
				type: node.getType()
			}) : null;
		}, { editor });
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	notify() {
		const listeners = Array.from(this.listeners);
		for (const listener of listeners) try {
			listener();
		} catch (error) {
			logger$8.error("Node identity subscriber failed:", error);
		}
	}
};
//#endregion
//#region src/plugins/litexml/node/identity-policy.ts
const afterRepresentation = Object.freeze({ childIndex: 1 });
/** Shared active-view rule for live Lexical nodes and serialized preflight trees. */
function getLiteXmlIdentityProjection(node) {
	if (node.type === "root" || node.type === "diff-content") return "container";
	if (node.type === "diff") {
		if (node.diffType === "remove" || node.diffType === "listItemRemove") return "hidden";
		if (node.diffType === "modify" || node.diffType === "listItemModify") return afterRepresentation;
		return "container";
	}
	if ((node.type === "table-cell-diff" || node.type === "table-row-diff") && node.diffType === "remove") return "hidden";
	if (node.type === "listitem" && node.firstChildType === "diff" && node.firstChildDiffType === "listItemRemove") return "hidden";
	return "content";
}
/** Review containers and the document root are physical structure, not addressable content. */
function isLiteXmlIdentityNode(type) {
	return type !== "root" && type !== "diff" && type !== "diff-content";
}
function getDiffType(node) {
	if (!node) return void 0;
	if ("diffType" in node && typeof node.diffType === "string") return node.diffType;
	if ("getDiffType" in node && typeof node.getDiffType === "function") return node.getDiffType();
}
function getLiveProjection(node) {
	const type = node.getType();
	if (type === "root" || type === "diff-content") return "container";
	if (type !== "diff" && type !== "table-cell-diff" && type !== "table-row-diff" && type !== "listitem") return "content";
	const firstChild = $isElementNode(node) ? node.getFirstChild() : null;
	return getLiteXmlIdentityProjection({
		diffType: getDiffType(node),
		firstChildDiffType: getDiffType(firstChild),
		firstChildType: firstChild?.getType(),
		type
	});
}
function getTableReviewSide(node) {
	const type = node.getType();
	if (type !== "table-cell-diff" && type !== "table-row-diff") return null;
	if (!("getChangeId" in node) || typeof node.getChangeId !== "function") return null;
	const changeId = node.getChangeId();
	const side = getDiffType(node);
	return changeId && side ? {
		group: `${type}:${changeId}`,
		side
	} : null;
}
function getReviewSide(node) {
	const selfSide = getTableReviewSide(node);
	if (selfSide) return selfSide;
	let branch = node;
	for (let parent = node.getParent(); parent; branch = parent, parent = parent.getParent()) {
		const parentDiffType = getDiffType(parent);
		if (parent.getType() === "diff") {
			if (parentDiffType === "modify") {
				if (branch.getType() === "diff-content" && "side" in branch) return {
					group: `diff:${parent.getKey()}`,
					side: String(branch.side)
				};
				const branchIndex = parent.getChildren().indexOf(branch);
				if (branchIndex >= 0 && branchIndex < 2) return {
					group: `diff:${parent.getKey()}`,
					side: branchIndex === 0 ? "before" : "after"
				};
			}
			if (parentDiffType === "listItemModify") {
				const branchIndex = parent.getChildren().indexOf(branch);
				if (branchIndex >= 0 && branchIndex < 2) return {
					group: `diff:${parent.getKey()}`,
					side: branchIndex === 0 ? "before" : "after"
				};
			}
		}
		const tableSide = getTableReviewSide(parent);
		if (tableSide) return tableSide;
	}
	return null;
}
const liteXmlIdentityPolicy = {
	canShareId(left, right) {
		const leftSide = getReviewSide(left);
		const rightSide = getReviewSide(right);
		return Boolean(leftSide && rightSide && leftSide.group === rightSide.group && leftSide.side !== rightSide.side);
	},
	isIdentityNode(node) {
		return isLiteXmlIdentityNode(node.getType());
	},
	project: getLiveProjection
};
//#endregion
//#region src/plugins/litexml/diff-validation.ts
const ACTIONABLE_DIFF_TYPES = /* @__PURE__ */ new Set([
	"add",
	"remove",
	"modify",
	"listItemAdd",
	"listItemModify",
	"listItemRemove"
]);
const isActionableDiff = (node) => node?.type === "diff" && ACTIONABLE_DIFF_TYPES.has(node.diffType || "");
const isElementNode = (node) => Array.isArray(node.children);
const getNodeId = (node) => {
	if (typeof node.id === "string" && node.id.length > 0) return node.id;
	const properties = node.$?.properties;
	return typeof properties?.nodeId === "string" ? properties.nodeId : void 0;
};
const cloneNode = (node) => structuredClone(node);
function hasActionableDiffDescendant(node) {
	return (node.children || []).some((child) => isActionableDiff(child) || hasActionableDiffDescendant(child));
}
/**
* Validate the serialized public tree. Paths use serialized node ids, not
* Lexical's private node map, so this remains stable across JSON reloads.
*/
function collectIllegalNestedDiffPaths(root) {
	const violations = [];
	const visit = (node, ancestors, path) => {
		const actionableAncestor = [...ancestors].reverse().find(isActionableDiff);
		const rowDiffAncestor = [...ancestors].reverse().find((ancestor) => ancestor.type === "table-row-diff");
		const allowedCellDiffChild = ancestors.at(-1)?.type === "table-cell-diff" && isActionableDiff(node);
		if (isActionableDiff(node) && actionableAncestor && !allowedCellDiffChild) violations.push(`${path}:diff-inside-diff`);
		if (rowDiffAncestor) {
			if (node.type === "table-cell-diff") violations.push(`${path}:cell-inside-row-diff`);
			else if (isActionableDiff(node)) violations.push(`${path}:diff-inside-row-diff`);
		}
		if (actionableAncestor) {
			if (node.type === "table-cell-diff") violations.push(`${path}:cell-diff-inside-diff`);
			else if (node.type === "table-row-diff") violations.push(`${path}:row-diff-inside-diff`);
		}
		if (!isElementNode(node)) return;
		node.children?.forEach((child) => {
			visit(child, [...ancestors, node], `${path}/${getNodeId(child) || child.type || "node"}`);
		});
	};
	visit(root, [], getNodeId(root) || root.type || "root");
	return violations;
}
function findNewIllegalDiffPaths(previous, projected) {
	const previousCounts = /* @__PURE__ */ new Map();
	collectIllegalNestedDiffPaths(previous.root).forEach((path) => {
		previousCounts.set(path, (previousCounts.get(path) || 0) + 1);
	});
	const newPaths = [];
	const projectedCounts = /* @__PURE__ */ new Map();
	collectIllegalNestedDiffPaths(projected.root).forEach((path) => {
		const count = (projectedCounts.get(path) || 0) + 1;
		projectedCounts.set(path, count);
		if (count > (previousCounts.get(path) || 0)) newPaths.push(path);
	});
	return newPaths;
}
function findActiveNodeLocation(root, id, ancestors = []) {
	const projection = getLiteXmlIdentityProjection({
		diffType: root.diffType,
		firstChildDiffType: root.children?.[0]?.diffType,
		firstChildType: root.children?.[0]?.type,
		type: root.type
	});
	if (projection === "hidden") return null;
	if (projection === "content" && getNodeId(root) === id) {
		const parent = ancestors.at(-1) || null;
		return {
			ancestors,
			index: parent ? (parent.children || []).indexOf(root) : -1,
			node: root,
			parent
		};
	}
	const activeChildren = typeof projection === "object" ? root.children?.[projection.childIndex] ? [root.children[projection.childIndex]] : [] : root.children || [];
	for (const child of activeChildren) {
		const nested = findActiveNodeLocation(child, id, [...ancestors, root]);
		if (nested) return nested;
	}
	return null;
}
function findNodeLocationByNode(root, target, ancestors = []) {
	if (root === target) return {
		ancestors,
		index: -1,
		node: root,
		parent: null
	};
	for (const [index, child] of (root.children || []).entries()) {
		if (child === target) return {
			ancestors: [...ancestors, root],
			index,
			node: child,
			parent: root
		};
		const nested = findNodeLocationByNode(child, target, [...ancestors, root]);
		if (nested) return nested;
	}
	return null;
}
function hasActiveLiteXmlNodeId(root, id) {
	return findActiveNodeLocation(root, id) !== null;
}
function replaceNode(location, replacements) {
	if (!location.parent || location.index < 0) return;
	location.parent.children?.splice(location.index, 1, ...replacements);
}
function createDiff(diffType, children) {
	return {
		children,
		diffType,
		type: "diff"
	};
}
function createDiffContent(side, children) {
	return {
		children,
		side,
		type: "diff-content"
	};
}
function projectModifyTarget(root, incoming) {
	const incomingId = getNodeId(incoming);
	if (!incomingId) return;
	const location = findActiveNodeLocation(root, incomingId);
	if (!location) return;
	const target = location.node;
	const next = cloneNode(incoming);
	if (target.type === "tablerow" && location.parent?.type === "table") {
		replaceNode(location, [{
			children: cloneNode(target.children || []),
			diffType: "remove",
			type: "table-row-diff"
		}, {
			children: cloneNode(next.children || []),
			diffType: "add",
			type: "table-row-diff"
		}]);
		return;
	}
	if (target.type === "tablecell" || target.type === "table-cell-diff") {
		const existingDiff = (target.children || []).find((child) => child.type === "diff");
		if (existingDiff && target.type === "table-cell-diff") {
			existingDiff.children = cloneNode(next.children || []);
			return;
		}
		const after = existingDiff?.children?.find((child) => child.type === "diff-content" && child.side === "after");
		if (existingDiff?.diffType === "modify" && after) {
			after.children = cloneNode(next.children || []);
			return;
		}
		target.children = [createDiff("modify", [createDiffContent("before", cloneNode(target.children || [])), createDiffContent("after", cloneNode(next.children || []))])];
		return;
	}
	if (location.ancestors.some(isActionableDiff)) {
		replaceNode(location, [next]);
		return;
	}
	if (target.type === "listitem") {
		const existingDiff = (target.children || []).find((child) => child.type === "diff");
		if (existingDiff?.diffType === "listItemModify") {
			const after = existingDiff.children?.[1];
			if (after) after.children = cloneNode(next.children || []);
			return;
		}
		if (existingDiff?.diffType === "listItemAdd") {
			existingDiff.children = cloneNode(next.children || []);
			return;
		}
		target.children = [createDiff("listItemModify", [{
			children: cloneNode(target.children || []),
			type: "paragraph"
		}, {
			children: cloneNode(next.children || []),
			type: "paragraph"
		}])];
		return;
	}
	replaceNode(location, [createDiff("modify", [cloneNode(target), next])]);
}
function projectRemoveTarget(root, id) {
	const location = findActiveNodeLocation(root, id);
	if (!location) return;
	if (location.ancestors.some(isActionableDiff)) {
		replaceNode(location, []);
		return;
	}
	const target = location.node;
	if (target.type === "tablecell" || target.type === "table-cell-diff") {
		replaceNode(location, [{
			children: [createDiff("remove", cloneNode(target.children || []))],
			diffType: "remove",
			type: "table-cell-diff"
		}]);
		return;
	}
	if (target.type === "tablerow" && location.parent?.type === "table") {
		replaceNode(location, [{
			children: cloneNode(target.children || []),
			diffType: "remove",
			type: "table-row-diff"
		}]);
		return;
	}
	replaceNode(location, [createDiff("remove", [cloneNode(target)])]);
}
function projectInsert(root, operation, readXml) {
	const referenceId = "beforeId" in operation ? operation.beforeId : operation.afterId;
	const reference = referenceId === "root" ? null : findActiveNodeLocation(root, referenceId)?.node || null;
	const location = referenceId === "root" ? {
		ancestors: [root],
		index: "beforeId" in operation ? 0 : (root.children || []).length - 1,
		node: root.children?.[0] || root,
		parent: root
	} : findActiveNodeLocation(root, referenceId);
	if (!location) return;
	const incoming = (readXml(operation.litexml).root?.children || []).map(cloneNode);
	if (incoming.length === 0 || !location.parent) return;
	const insertAt = "beforeId" in operation ? location.index : location.index + 1;
	if (incoming.every((node) => node.type === "tablecell") && reference?.type === "tablecell") {
		location.parent.children?.splice(insertAt, 0, ...incoming.map((node) => ({
			children: [createDiff("add", cloneNode(node.children || []))],
			diffType: "add",
			type: "table-cell-diff"
		})));
		return;
	}
	if (incoming.every((node) => node.type === "tablerow") && reference?.type === "tablerow") {
		location.parent.children?.splice(insertAt, 0, ...incoming.map((node) => ({
			children: cloneNode(node.children || []),
			diffType: "add",
			type: "table-row-diff"
		})));
		return;
	}
	const actionableAncestor = location.ancestors.findLast(isActionableDiff);
	const isInlineReference = [
		"text",
		"span",
		"link",
		"autolink",
		"linebreak"
	].includes(reference?.type || "");
	const blockAncestor = [...location.ancestors].reverse().find((node) => [
		"paragraph",
		"heading",
		"listitem",
		"table",
		"tablerow",
		"tablecell"
	].includes(node.type || ""));
	if (!actionableAncestor && blockAncestor && hasActionableDiffDescendant(blockAncestor)) {
		const wrapped = createDiff("modify", [cloneNode(blockAncestor), cloneNode(blockAncestor)]);
		const blockLocation = findNodeLocationByNode(root, blockAncestor);
		if (blockLocation) replaceNode(blockLocation, [wrapped]);
		return;
	}
	if (actionableAncestor && !isInlineReference) {
		const originLocation = findNodeLocationByNode(root, actionableAncestor);
		if (originLocation?.parent && originLocation.index >= 0) {
			const originInsertAt = "beforeId" in operation ? originLocation.index : originLocation.index + 1;
			originLocation.parent.children?.splice(originInsertAt, 0, ...incoming.map((node) => createDiff("add", [node])));
			return;
		}
	}
	const inserted = actionableAncestor && isInlineReference ? incoming : incoming.map((node) => createDiff("add", [node]));
	location.parent.children?.splice(insertAt, 0, ...inserted);
}
/**
* Project one operation on a cloned serialized tree. The real Lexical tree is
* untouched; callers compare illegal paths before/after and only dispatch safe
* operations to the live editor.
*/
function projectLiteXmlOperation(document, operation, readXml) {
	const projected = cloneNode(document);
	if (operation.action === "modify") (Array.isArray(operation.litexml) ? operation.litexml : [operation.litexml]).forEach((xml) => {
		(readXml(xml).root?.children || []).forEach((child) => {
			projectModifyTarget(projected.root, child);
		});
	});
	else if (operation.action === "remove") projectRemoveTarget(projected.root, operation.id);
	else projectInsert(projected.root, operation, readXml);
	return projected;
}
//#endregion
//#region src/plugins/litexml/node/DiffContentNode.ts
/** Groups one side of a modify diff so it can contain any number of block nodes. */
var DiffContentNode = class DiffContentNode extends ElementNode {
	static getType() {
		return "diff-content";
	}
	static clone(node) {
		return new DiffContentNode(node.__side, node.__key);
	}
	static importJSON(serializedNode) {
		return $createDiffContentNode(serializedNode.side).updateFromJSON(serializedNode);
	}
	static importDOM() {
		return null;
	}
	constructor(side, key) {
		super(key);
		this.__side = side;
	}
	get side() {
		return this.__side;
	}
	setSide(side) {
		this.getWritable().__side = side;
		return this;
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setSide(serializedNode.side);
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			side: this.__side,
			type: DiffContentNode.getType(),
			version: 1
		};
	}
	createDOM(_config, _editor) {
		const element = document.createElement("div");
		element.dataset.diffContent = this.__side;
		return element;
	}
	updateDOM(previousNode, dom) {
		if (previousNode.__side !== this.__side) dom.dataset.diffContent = this.__side;
		return false;
	}
	exportDOM(_editor) {
		const element = document.createElement("div");
		element.dataset.diffContent = this.__side;
		return { element };
	}
	canBeEmpty() {
		return true;
	}
	isInline() {
		return false;
	}
};
function $createDiffContentNode(side) {
	return $applyNodeReplacement(new DiffContentNode(side));
}
function $isDiffContentNode(node) {
	return node instanceof DiffContentNode;
}
//#endregion
//#region src/plugins/litexml/node/DiffNode.ts
/** DiffNode - contains the original and modified sides, optionally grouped into multiple blocks. */
var DiffNode = class DiffNode extends CardLikeElementNode {
	static getType() {
		return "diff";
	}
	static clone(node) {
		return new DiffNode(node.__diffType, node.__key);
	}
	static importJSON(serializedNode) {
		return $createDiffNode().updateFromJSON(serializedNode);
	}
	static importDOM() {
		return null;
	}
	constructor(type, key) {
		super(key);
		this.__diffType = "unchanged";
		this.__diffType = type;
	}
	get diffType() {
		return this.__diffType;
	}
	setDiffType(type) {
		this.getWritable().__diffType = type;
		return this;
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setDiffType(serializedNode.diffType);
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			diffType: this.__diffType,
			type: "diff"
		};
	}
	exportDOM(editor) {
		return super.exportDOM(editor);
	}
	createDOM(config, editor) {
		const el = document.createElement("div");
		el.contentEditable = "false";
		el.dataset.lexicalKey = this.getKey();
		el.dataset.diffType = this.__diffType;
		el.classList.add("ne-diff");
		if (config.theme.diffNode) el.classList.add(config.theme.diffNode);
		const toolbar = document.createElement("div");
		toolbar.className = "toolbar";
		toolbar.dataset.lexicalDecorator = "true";
		el.append(toolbar);
		const content = document.createElement("div");
		content.className = "content";
		el.append(content);
		const decorator = getKernelFromEditor(editor)?.getDecorator("diff") || null;
		if (decorator) {
			if (typeof decorator === "function") reconcileDecorator(editor, this.getKey(), decorator(this, editor));
			else reconcileDecorator(editor, this.getKey(), {
				queryDOM: decorator.queryDOM,
				render: decorator.render(this, editor)
			});
		}
		return el;
	}
	updateDOM(_prevNode, _dom, _config) {
		if (_dom.dataset.diffType !== this.__diffType) _dom.dataset.diffType = this.__diffType;
		const kernel = getKernelFromEditorConfig(_config);
		const editor = kernel?.getLexicalEditor();
		if (editor) {
			const decorator = kernel?.getDecorator("diff") || null;
			if (decorator) {
				if (typeof decorator === "function") reconcileDecorator(editor, this.getKey(), decorator(this, editor));
				else reconcileDecorator(editor, this.getKey(), {
					queryDOM: decorator.queryDOM,
					render: decorator.render(this, editor)
				});
			}
		}
		return false;
	}
	getDOMSlot(element) {
		return super.getDOMSlot(element).withElement(element.querySelector(".content"));
	}
	isInline() {
		return false;
	}
	isCardLike() {
		return true;
	}
};
function $createDiffNode(diffType = "unchanged") {
	return $applyNodeReplacement(new DiffNode(diffType));
}
function $isDiffNode(node) {
	return node instanceof DiffNode;
}
//#endregion
//#region src/plugins/litexml/node/TableCellDiffNode.ts
/**
* Review-only table cell. The diff state lives on a TableCellNode subclass so
* TableRowNode children remain cells throughout staging and approval.
*/
var TableCellDiffNode = class TableCellDiffNode extends TableCellNode {
	static getType() {
		return "table-cell-diff";
	}
	static clone(node) {
		const clone = new TableCellDiffNode(node.__diffType, node.__changeId, node.getHeaderStyles(), node.getColSpan(), node.getWidth(), node.__key);
		clone.__rowSpan = node.__rowSpan;
		clone.__backgroundColor = node.__backgroundColor;
		clone.__verticalAlign = node.__verticalAlign;
		return clone;
	}
	static importJSON(serializedNode) {
		return $createTableCellDiffNode(serializedNode.diffType, serializedNode.changeId, serializedNode.headerState, serializedNode.colSpan, serializedNode.width).updateFromJSON(serializedNode);
	}
	constructor(diffType, changeId, headerState, colSpan, width, key) {
		super(headerState, colSpan, width, key);
		this.__diffType = diffType;
		this.__changeId = changeId;
	}
	createDOM(config) {
		const element = super.createDOM(config);
		const theme = config.theme.tableCellDiff;
		if (typeof theme === "string" && theme) element.classList.add(theme);
		this.syncDOMState(element);
		return element;
	}
	updateDOM(prevNode) {
		return super.updateDOM(prevNode) || prevNode.__diffType !== this.__diffType || prevNode.__changeId !== this.__changeId;
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			changeId: this.__changeId,
			diffType: this.__diffType,
			type: TableCellDiffNode.getType(),
			version: 1
		};
	}
	getChangeId() {
		return this.getLatest().__changeId;
	}
	getDiffType() {
		return this.getLatest().__diffType;
	}
	setChangeId(changeId) {
		this.getWritable().__changeId = changeId;
		return this;
	}
	setDiffType(diffType) {
		this.getWritable().__diffType = diffType;
		return this;
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setDiffType(serializedNode.diffType).setChangeId(serializedNode.changeId);
	}
	syncDOMState(element) {
		element.contentEditable = "false";
		element.dataset.diffType = this.__diffType;
		if (this.__changeId) element.dataset.diffChangeId = this.__changeId;
		else delete element.dataset.diffChangeId;
	}
};
function $createTableCellDiffNode(diffType, changeId, headerState, colSpan, width) {
	return $applyNodeReplacement(new TableCellDiffNode(diffType, changeId, headerState, colSpan, width));
}
function $isTableCellDiffNode(node) {
	return node instanceof TableCellDiffNode;
}
//#endregion
//#region src/plugins/litexml/utils/index.ts
function $parseSerializedNodeImpl(serializedNode, editor) {
	const type = serializedNode.type;
	const registeredNode = editor._nodes.get(type);
	if (registeredNode === void 0) throw new Error(`parseEditorState: type "${type}" not found`);
	const nodeClass = registeredNode.klass;
	if (serializedNode.type !== nodeClass.getType()) throw new Error(`LexicalNode: Node ${nodeClass.name} does not implement .importJSON().`);
	const node = nodeClass.importJSON(serializedNode);
	const nodeId = isValidContentNodeId(serializedNode.id) ? serializedNode.id : $getNodeId(node);
	if (isValidContentNodeId(nodeId)) $setNodeId(node, nodeId);
	else if (nodeId) $clearNodeId(node);
	const children = serializedNode.children;
	if ($isElementNode(node) && Array.isArray(children)) {
		const childNodes = [];
		for (const serializedJSONChildNode of children) {
			const childNode = $parseSerializedNodeImpl(serializedJSONChildNode, editor);
			childNodes.push(childNode);
		}
		node.append(...childNodes);
	}
	return node;
}
function exportNodeToJSON(node) {
	const serializedNode = node.exportJSON();
	const nodeClass = node.constructor;
	serializedNode.id = $getNodeId(node);
	if (serializedNode.type !== nodeClass.getType()) throw new Error(`LexicalNode: Node ${nodeClass.name} does not match the serialized type. Check if .exportJSON() is implemented and it is returning the correct type.`);
	if ($isElementNode(node)) {
		const serializedChildren = serializedNode.children;
		if (!Array.isArray(serializedChildren)) throw new Error(`LexicalNode: Node ${nodeClass.name} is an element but .exportJSON() does not have a children array.`);
		const children = node.getChildren();
		for (const child of children) {
			const serializedChildNode = exportNodeToJSON(child);
			serializedChildren.push(serializedChildNode);
		}
	}
	return serializedNode;
}
function $cloneNode(node, editor) {
	return $parseSerializedNodeImpl(exportNodeToJSON(node), editor);
}
//#endregion
//#region src/plugins/litexml/table-cell-diff.ts
function copyCellStructure(source, target) {
	target.setRowSpan(source.getRowSpan());
	target.setBackgroundColor(source.getBackgroundColor());
	target.setVerticalAlign(source.getVerticalAlign());
}
function $createTableCellDiffFromCell(editor, cell, diffType, changeId) {
	const diffCell = $createTableCellDiffNode(diffType, changeId, cell.getHeaderStyles(), cell.getColSpan(), cell.getWidth());
	$copyNodeProperties(cell, diffCell);
	copyCellStructure(cell, diffCell);
	const diff = $createDiffNode(diffType);
	diff.append(...cell.getChildren().map((child) => $cloneNode(child, editor)));
	diffCell.append(diff);
	return diffCell;
}
function $createPlainTableCellFromDiff(editor, cell) {
	const plainCell = $createTableCellNode(cell.getHeaderStyles(), cell.getColSpan(), cell.getWidth());
	$copyNodeProperties(cell, plainCell);
	copyCellStructure(cell, plainCell);
	const diff = cell.getFirstChild();
	if (diff instanceof DiffNode) plainCell.append(...diff.getChildren().map((child) => $cloneNode(child, editor)));
	else plainCell.append(...cell.getChildren().map((child) => $cloneNode(child, editor)));
	return plainCell;
}
function $getTableForCell(cell) {
	const row = cell.getParent();
	if (!$isTableRowNode(row)) return null;
	const table = row.getParent();
	return $isTableNode(table) ? table : null;
}
function $getTableCellColumnIndex(cell) {
	const row = cell.getParent();
	if (!$isTableRowNode(row)) return -1;
	let index = 0;
	for (const sibling of row.getChildren()) {
		if (sibling === cell) return index;
		if ($isTableCellNode(sibling)) index += sibling.getColSpan();
	}
	return -1;
}
function $getLogicalRowWidth(cell) {
	const row = cell.getParent();
	if (!$isTableRowNode(row)) return 0;
	return row.getChildren().reduce((total, child) => total + ($isTableCellNode(child) ? child.getColSpan() : 0), 0);
}
function $getTableCellDiffGroup(cell) {
	const changeId = cell.getChangeId();
	const table = $getTableForCell(cell);
	if (!changeId || !table) return [cell];
	return $nodesOfType(TableCellDiffNode).filter((candidate) => candidate.getChangeId() === changeId && candidate.getDiffType() === cell.getDiffType() && $getTableForCell(candidate) === table);
}
function $updateTableWidthsForCellInsertion(table, rowWidthBefore, columnIndex, insertedSpan) {
	const currentWidths = table.getColWidths() || Array.from({ length: rowWidthBefore }, () => 250);
	if (rowWidthBefore < currentWidths.length) return;
	const fallback = currentWidths[Math.max(0, columnIndex - 1)] || 250;
	const next = [...currentWidths];
	next.splice(columnIndex, 0, ...Array.from({ length: insertedSpan }, () => fallback));
	table.setColWidths(next);
}
function $removeTableWidthsForCompleteCellGroup(table, group, columnIndex, span) {
	const rows = table.getChildren().filter($isTableRowNode);
	const rowKeys = new Set(group.map((cell) => cell.getParent()?.getKey()));
	if (rows.length !== rowKeys.size) return;
	const widths = table.getColWidths();
	if (!widths) return;
	const next = [...widths];
	next.splice(columnIndex, span);
	table.setColWidths(next);
}
function $shrinkTableWidthsAfterCellRemoval(table, columnIndex, span) {
	const widths = table.getColWidths();
	if (!widths) return;
	if (table.getChildren().reduce((max, row) => {
		if (!$isTableRowNode(row)) return max;
		return Math.max(max, row.getChildren().reduce((total, cell) => total + ($isTableCellNode(cell) ? cell.getColSpan() : 0), 0));
	}, 0) > widths.length - span) return;
	const next = [...widths];
	next.splice(columnIndex, span);
	table.setColWidths(next);
}
function $getMaximumLogicalColumnCount(table) {
	return table.getChildren().reduce((maximum, row) => {
		if (!$isTableRowNode(row)) return maximum;
		const columnCount = row.getChildren().reduce((total, cell) => {
			return total + ($isTableCellNode(cell) ? cell.getColSpan() : 0);
		}, 0);
		return Math.max(maximum, columnCount);
	}, 0);
}
function $hasLegacyTableCellDiffs() {
	return $nodesOfType(DiffNode).some((diff) => {
		return (diff.diffType === "add" || diff.diffType === "remove") && $isTableRowNode(diff.getParent()) && diff.getChildren().some($isTableCellNode);
	});
}
function $hasIncompleteTableWidths() {
	return $nodesOfType(TableNode).some((table) => {
		return (table.getColWidths()?.length || 0) < $getMaximumLogicalColumnCount(table);
	});
}
/**
* Migrates the old `TableRow > DiffNode > TableCellNode` representation into
* cell-shaped diff nodes and makes sure the table has a width for every
* logical column. Safe to call repeatedly.
*/
function $normalizeLegacyTableCellDiffs(editor) {
	let changed = false;
	$nodesOfType(DiffNode).forEach((legacyDiff) => {
		const diffType = legacyDiff.diffType;
		if (diffType !== "add" && diffType !== "remove" || !$isTableRowNode(legacyDiff.getParent())) return;
		const cells = legacyDiff.getChildren().filter($isTableCellNode);
		if (cells.length === 0) return;
		const changeId = `legacy-table-cell-${legacyDiff.getKey()}`;
		cells.forEach((cell) => {
			legacyDiff.insertBefore($createTableCellDiffFromCell(editor, cell, diffType, changeId));
		});
		legacyDiff.remove();
		changed = true;
	});
	$nodesOfType(TableNode).forEach((table) => {
		const requiredWidthCount = $getMaximumLogicalColumnCount(table);
		const currentWidths = table.getColWidths() || [];
		if (currentWidths.length >= requiredWidthCount) return;
		const fallback = currentWidths.at(-1) || 250;
		table.setColWidths([...currentWidths, ...Array.from({ length: requiredWidthCount - currentWidths.length }, () => fallback)]);
		changed = true;
	});
	return changed;
}
function registerLegacyTableCellDiffNormalization(editor) {
	let destroyed = false;
	let scheduled = false;
	const unregister = editor.registerUpdateListener(() => {
		if (scheduled || destroyed) return;
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			if (destroyed) return;
			if (!editor.getEditorState().read(() => $hasLegacyTableCellDiffs() || $hasIncompleteTableWidths())) return;
			editor.update(() => {
				$normalizeLegacyTableCellDiffs(editor);
			}, { discrete: true });
		});
	});
	return () => {
		destroyed = true;
		unregister();
	};
}
//#endregion
//#region src/plugins/litexml/node/TableRowDiffNode.ts
/**
* A review-only table row. Keeping the diff state on a TableRowNode subclass
* preserves Lexical's table invariant: TableNode children are always rows.
*/
var TableRowDiffNode = class TableRowDiffNode extends TableRowNode {
	static getType() {
		return "table-row-diff";
	}
	static clone(node) {
		return new TableRowDiffNode(node.__diffType, node.__changeId, node.getHeight(), node.__key);
	}
	static importJSON(serializedNode) {
		return $createTableRowDiffNode(serializedNode.diffType, serializedNode.changeId, serializedNode.height).updateFromJSON(serializedNode);
	}
	constructor(diffType, changeId, height, key) {
		super(height, key);
		this.__diffType = diffType;
		this.__changeId = changeId;
	}
	createDOM(config) {
		const element = super.createDOM(config);
		const theme = config.theme.tableRowDiff;
		if (typeof theme === "string" && theme) element.classList.add(theme);
		this.syncDOMState(element);
		return element;
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			changeId: this.__changeId,
			diffType: this.__diffType,
			type: TableRowDiffNode.getType(),
			version: 1
		};
	}
	getChangeId() {
		return this.getLatest().__changeId;
	}
	getDiffType() {
		return this.getLatest().__diffType;
	}
	setChangeId(changeId) {
		this.getWritable().__changeId = changeId;
		return this;
	}
	setDiffType(diffType) {
		this.getWritable().__diffType = diffType;
		return this;
	}
	updateDOM(prevNode) {
		return super.updateDOM(prevNode) || prevNode.__diffType !== this.__diffType || prevNode.__changeId !== this.__changeId;
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setDiffType(serializedNode.diffType).setChangeId(serializedNode.changeId);
	}
	syncDOMState(element) {
		element.dataset.diffType = this.__diffType;
		if (this.__changeId) element.dataset.diffChangeId = this.__changeId;
		else delete element.dataset.diffChangeId;
		element.contentEditable = "false";
	}
};
function $createTableRowDiffNode(diffType, changeId, height) {
	return $applyNodeReplacement(new TableRowDiffNode(diffType, changeId, height));
}
function $isTableRowDiffNode(node) {
	return node instanceof TableRowDiffNode;
}
//#endregion
//#region src/plugins/litexml/table-row-diff.ts
function $areTableRowStructuresCompatible(previousRow, nextRow) {
	const previousCells = previousRow.getChildren();
	const nextCells = nextRow.getChildren();
	if (previousCells.length !== nextCells.length || !previousCells.every($isTableCellNode) || !nextCells.every($isTableCellNode)) return false;
	return previousCells.every((previousCell, index) => {
		const nextCell = nextCells[index];
		return $isTableCellNode(nextCell) && previousCell.getColSpan() === nextCell.getColSpan() && previousCell.getRowSpan() === nextCell.getRowSpan();
	});
}
function $createTableRowDiffFromRow(editor, row, diffType, changeId) {
	const source = $cloneNode(row, editor);
	const diffRow = $createTableRowDiffNode(diffType, changeId, row.getHeight());
	$copyNodeProperties(row, diffRow);
	diffRow.append(...source.getChildren());
	return diffRow;
}
function $createPlainTableRowFromDiff(editor, row) {
	const plainRow = $createTableRowNode(row.getHeight());
	$copyNodeProperties(row, plainRow);
	plainRow.append(...row.getChildren().map((child) => $cloneNode(child, editor)));
	return plainRow;
}
function $getTableRowDiffPair(node) {
	const changeId = node.getChangeId();
	if (!changeId) return null;
	const matchingRows = $nodesOfType(TableRowDiffNode).filter((candidate) => candidate.getChangeId() === changeId);
	if (matchingRows.length !== 2) return null;
	const remove = matchingRows.find((candidate) => candidate.getDiffType() === "remove");
	const add = matchingRows.find((candidate) => candidate.getDiffType() === "add");
	if (!remove || !add) return null;
	const parent = remove.getParent();
	if (!$isTableNode(parent) || add.getParent() !== parent || remove.getNextSibling() !== add || !$areTableRowStructuresCompatible(remove, add)) return null;
	return {
		add,
		remove
	};
}
function $normalizeTableRowDiffPairs() {
	const rows = $nodesOfType(TableRowDiffNode);
	const groups = /* @__PURE__ */ new Map();
	rows.forEach((row) => {
		const changeId = row.getChangeId();
		if (!changeId) return;
		const group = groups.get(changeId) || [];
		group.push(row);
		groups.set(changeId, group);
	});
	let changed = false;
	groups.forEach((group) => {
		if (group.length === 2 ? $getTableRowDiffPair(group[0]) : null) return;
		group.forEach((row) => row.setChangeId());
		changed = true;
	});
	return changed;
}
function registerTableRowDiffNormalization(editor) {
	let destroyed = false;
	let scheduled = false;
	const unregister = editor.registerUpdateListener(() => {
		if (scheduled || destroyed) return;
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			if (destroyed) return;
			if (!editor.getEditorState().read(() => {
				return $nodesOfType(TableRowDiffNode).some((row) => row.getChangeId() && !$getTableRowDiffPair(row));
			})) return;
			editor.update(() => {
				$normalizeTableRowDiffPairs();
			});
		});
	});
	return () => {
		destroyed = true;
		unregister();
	};
}
//#endregion
//#region src/plugins/litexml/command/index.ts
const logger$7 = createDebugLogger("plugin", "litexml");
function toArrayXml(litexml) {
	return Array.isArray(litexml) ? litexml : [litexml];
}
function hasNewIllegalDiffs(previous, projected) {
	return findNewIllegalDiffPaths(previous, projected);
}
function projectOperation(dataSource, document, operation, readXml = (xml) => dataSource.readLiteXMLToInode(xml)) {
	try {
		const projected = projectLiteXmlOperation(document, operation, readXml);
		const newIllegalDiffs = hasNewIllegalDiffs(document, projected);
		if (newIllegalDiffs.length > 0) {
			logger$7.warn("⚠️ Skipping operation with illegal nested diff", newIllegalDiffs);
			return null;
		}
		return projected;
	} catch (error) {
		logger$7.error("❌ Failed to preflight LiteXML operation:", error);
		return null;
	}
}
function toProjectionOperation(operation) {
	return operation;
}
function getSerializedNodeId(node) {
	if (typeof node?.id === "string" && node.id.length > 0) return node.id;
	const nodeId = node?.$?.properties?.nodeId;
	return typeof nodeId === "string" && nodeId.length > 0 ? nodeId : void 0;
}
function getActiveSerializedDocument() {
	return { root: exportNodeToJSON$1($getRoot()) };
}
/** Resolve every target before staging any part of one modify operation. */
function prepareModify(editor, dataSource, xmls) {
	const pairs = [];
	const parsed = /* @__PURE__ */ new Map();
	const targetIds = /* @__PURE__ */ new Set();
	for (const xml of xmls) {
		const inode = dataSource.readLiteXMLToInode(xml);
		parsed.set(xml, inode);
		const children = inode.root?.children;
		if (!children?.length) throw new Error("Modify operation contains no LiteXML nodes.");
		for (const child of children) {
			const nodeId = getSerializedNodeId(child);
			if (!nodeId) throw new Error("Modify operation root is missing its public node id.");
			if (targetIds.has(nodeId)) throw new Error(`Node id "${nodeId}" is targeted more than once.`);
			targetIds.add(nodeId);
			const oldNode = $findNodeById(nodeId);
			if (!oldNode) throw new Error(`Node id "${nodeId}" was not found.`);
			const newNode = $parseSerializedNodeImpl(child, editor);
			if (oldNode.isInline() !== newNode.isInline()) throw new Error(`Node id "${nodeId}" cannot change between inline and block structure.`);
			const parent = oldNode.getParent();
			if (($isListNode(parent) || $isListItemNode(oldNode) || $isListItemNode(newNode)) && (!$isListNode(parent) || !$isListItemNode(oldNode) || !$isListItemNode(newNode))) throw new Error(`Node id "${nodeId}" has an incompatible list-item structure.`);
			if ($isTableNode(parent) && (!$isTableRowNode(oldNode) || !$isTableRowNode(newNode)) || $isTableRowNode(parent) && (!$isTableCellNode(oldNode) || !$isTableCellNode(newNode)) || $isTableRowNode(newNode) && !$isTableNode(parent) || $isTableCellNode(newNode) && !$isTableRowNode(parent)) throw new Error(`Node id "${nodeId}" has an incompatible table structure.`);
			if (($isTableRowNode(oldNode) || $isTableRowNode(newNode)) && (!$isTableRowNode(oldNode) || !$isTableRowNode(newNode) || !$isTableNode(parent) || !$areTableRowStructuresCompatible(oldNode, newNode))) throw new Error(`Node id "${nodeId}" has an incompatible table row structure.`);
			pairs.push({
				newNode,
				oldNode
			});
		}
	}
	const targetKeys = new Set(pairs.map(({ oldNode }) => oldNode.getKey()));
	for (const { oldNode } of pairs) for (let parent = oldNode.getParent(); parent; parent = parent.getParent()) if (targetKeys.has(parent.getKey())) throw new Error("Modify operation targets overlapping ancestor and descendant nodes.");
	return {
		pairs,
		readXml: (xml) => parsed.get(xml)
	};
}
function getBatchTargetError(document, operation, dataSource) {
	if (operation.action === "remove") return hasActiveLiteXmlNodeId(document.root, operation.id) ? void 0 : `Node id "${operation.id}" was not found.`;
	if (operation.action === "insert") {
		try {
			if (!dataSource.readLiteXMLToInode(operation.litexml).root.children?.length) return "Insert operation contains no LiteXML nodes.";
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
		const anchorId = "beforeId" in operation ? operation.beforeId : operation.afterId;
		if (anchorId === "root") return (document.root.children?.length || 0) > 0 ? void 0 : "The document has no node to use as an insertion anchor.";
		return hasActiveLiteXmlNodeId(document.root, anchorId) ? void 0 : `Insertion anchor "${anchorId}" was not found.`;
	}
}
function applyLiteXMLBatch(editor, dataSource, operations) {
	let projectedDocument = getActiveSerializedDocument();
	const afterAnchors = /* @__PURE__ */ new Map();
	const results = [];
	operations.forEach((operation, index) => {
		const targetError = getBatchTargetError(projectedDocument, operation, dataSource);
		if (targetError) {
			results.push({
				action: operation.action,
				index,
				reason: targetError,
				status: "failed"
			});
			return;
		}
		let preparedModify;
		if (operation.action === "modify") try {
			preparedModify = prepareModify(editor, dataSource, toArrayXml(operation.litexml));
		} catch (error) {
			results.push({
				action: operation.action,
				index,
				reason: error instanceof Error ? error.message : String(error),
				status: "failed"
			});
			return;
		}
		if (!projectOperation(dataSource, projectedDocument, toProjectionOperation(operation), preparedModify?.readXml)) {
			results.push({
				action: operation.action,
				index,
				reason: "The operation would create an invalid nested review diff.",
				status: "failed"
			});
			return;
		}
		try {
			let applied = false;
			switch (operation.action) {
				case "modify":
					applied = applyPreparedModify(editor, preparedModify);
					break;
				case "remove":
					applied = handleRemove(editor, operation.id, true);
					break;
				case "insert": {
					const cursorIds = "afterId" in operation ? afterAnchors.get(operation.afterId) : void 0;
					let override;
					if (cursorIds) for (let cursorIndex = cursorIds.length - 1; cursorIndex >= 0; cursorIndex--) {
						const cursor = $findNodeById(cursorIds[cursorIndex]);
						if (cursor) {
							override = cursor;
							break;
						}
					}
					const insertedNodeId = handleInsert(editor, {
						...operation,
						delay: true
					}, dataSource, override);
					applied = insertedNodeId !== null;
					if ("afterId" in operation && insertedNodeId) {
						const nextCursors = afterAnchors.get(operation.afterId) || [];
						nextCursors.push(insertedNodeId);
						afterAnchors.set(operation.afterId, nextCursors);
					}
					break;
				}
			}
			if (!applied) {
				results.push({
					action: operation.action,
					index,
					reason: "The editor could not apply the operation.",
					status: "failed"
				});
				return;
			}
			projectedDocument = getActiveSerializedDocument();
			results.push({
				action: operation.action,
				index,
				status: "applied"
			});
		} catch (error) {
			results.push({
				action: operation.action,
				index,
				reason: error instanceof Error ? error.message : String(error),
				status: "failed"
			});
		}
	});
	return results;
}
function tryParseChild(child, editor) {
	try {
		const nodeId = typeof child.id === "string" ? child.id : child.$?.properties?.nodeId;
		const oldNode = typeof nodeId === "string" ? $findNodeById(nodeId) : null;
		return {
			newNode: $parseSerializedNodeImpl(child, editor),
			oldNode
		};
	} catch (error) {
		logger$7.error("❌ Error parsing child node:", error);
		return {
			newNode: null,
			oldNode: null
		};
	}
}
function handleReplaceForApplyDelay(oldNode, newNode, modifyBlockNodes, diffNodeMap, editor) {
	if ($isTableRowNode(oldNode) || $isTableRowNode(newNode)) {
		if (!$isTableRowNode(oldNode) || !$isTableRowNode(newNode) || !$isTableNode(oldNode.getParent()) || !$areTableRowStructuresCompatible(oldNode, newNode)) {
			logger$7.error(`❌ Invalid table row modification for row ${oldNode.getKey()}.`);
			return false;
		}
		const changeId = `${oldNode.getKey()}:${newNode.getKey()}`;
		const removeRow = $createTableRowDiffFromRow(editor, oldNode, "remove", changeId);
		const addRow = $createTableRowDiffFromRow(editor, newNode, "add", changeId);
		oldNode.replace(removeRow, false);
		removeRow.insertAfter(addRow);
		return true;
	}
	if ($isTableCellNode(oldNode) && $isTableCellNode(newNode)) {
		const existingDiff = oldNode.getChildren().find($isDiffNode);
		if (existingDiff) {
			if ($isTableCellDiffNode(oldNode)) {
				existingDiff.clear();
				newNode.getChildren().forEach((child) => {
					existingDiff.append($cloneNode(child, editor));
				});
				return true;
			}
			const after = existingDiff.getChildren().find((child) => $isDiffContentNode(child) && child.side === "after");
			if (existingDiff.diffType === "modify" && after && $isDiffContentNode(after)) {
				after.clear();
				newNode.getChildren().forEach((child) => {
					after.append($cloneNode(child, editor));
				});
				return true;
			}
		}
		const before = $createDiffContentNode("before");
		const after = $createDiffContentNode("after");
		oldNode.getChildren().forEach((child) => before.append(child));
		newNode.getChildren().forEach((child) => after.append($cloneNode(child, editor)));
		const diffNode = $createDiffNode("modify");
		diffNode.append(before, after);
		oldNode.clear();
		oldNode.append(diffNode);
		return true;
	}
	const oldBlock = $closest(oldNode, (node) => node.isInline() === false);
	if (!oldBlock) throw new Error("Old block node not found for diffing.");
	if ($closest(oldNode, (node) => node.getType() === DiffNode.getType())) {
		oldNode.replace(newNode, false);
		return true;
	}
	if ($isListItemNode(oldNode) && $isListItemNode(newNode)) {
		const existingListDiff = oldNode.getChildren().find($isDiffNode);
		if (existingListDiff?.diffType === "listItemModify") {
			const after = existingListDiff.getChildAtIndex(1);
			if ($isElementNode(after)) {
				after.clear();
				newNode.getChildren().forEach((child) => after.append($cloneNode(child, editor)));
				return true;
			}
		}
		if (existingListDiff?.diffType === "listItemAdd") {
			existingListDiff.clear();
			newNode.getChildren().forEach((child) => existingListDiff.append($cloneNode(child, editor)));
			return true;
		}
		const before = $createParagraphNode();
		const after = $createParagraphNode();
		oldNode.getChildren().forEach((child) => before.append(child));
		newNode.getChildren().forEach((child) => after.append(child));
		oldNode.clear();
		oldNode.append($createDiffNode("listItemModify").append(before, after));
		return true;
	}
	if (oldNode === oldBlock) {
		const diffNode = $createDiffNode("modify");
		oldNode.replace(diffNode, false);
		diffNode.append($createDiffContentNode("before").append(oldBlock), $createDiffContentNode("after").append(newNode));
		return true;
	} else {
		if (!modifyBlockNodes.has(oldBlock.getKey())) {
			modifyBlockNodes.add(oldBlock.getKey());
			const diffNode = $createDiffNode("modify");
			diffNode.append($cloneNode(oldBlock, editor));
			diffNodeMap.set(oldBlock.getKey(), diffNode);
		}
		oldNode.replace(newNode, false);
		return true;
	}
}
function finalizeModifyBlocks(modifyBlockNodes, diffNodeMap, editor) {
	for (const blockNodeKey of modifyBlockNodes) {
		const blockNode = $getNodeByKey(blockNodeKey);
		const diffNode = diffNodeMap.get(blockNodeKey);
		if (diffNode && blockNode) {
			if (blockNode.getType() === "listitem" && $isElementNode(blockNode)) {
				const newDiffNode = $createDiffNode("listItemModify");
				const firstChild = diffNode.getFirstChild();
				if (firstChild && $isElementNode(firstChild)) newDiffNode.append(firstChild);
				const children = blockNode.getChildren();
				const p = $createParagraphNode();
				children.forEach((child) => {
					child.remove();
					p.append(child);
				});
				newDiffNode.append(p);
				blockNode.append(newDiffNode);
				continue;
			} else if ($isTableCellNode(blockNode) && $isTableRowNode(blockNode.getParent()) && $isTableCellNode(diffNode.getFirstChild())) {
				const beforeCell = diffNode.getFirstChild();
				if (!$isTableCellNode(beforeCell)) continue;
				const before = $createDiffContentNode("before");
				const after = $createDiffContentNode("after");
				beforeCell.getChildren().forEach((child) => before.append(child));
				blockNode.getChildren().forEach((child) => after.append($cloneNode(child, editor)));
				blockNode.clear();
				blockNode.append($createDiffNode("modify").append(before, after));
				continue;
			} else {
				diffNode.append($cloneNode(blockNode, editor));
				blockNode.replace(diffNode, false);
			}
		}
	}
}
/**
* Wrap a block-level change with a `modify` diff: clone the old block, run the
* provided changeFn (which should mutate nodes inside the block), then clone
* the new block and replace it with the diff node. Useful for inline->block
* transitions where we want to show a modify diff.
*/
function wrapBlockModify(oldBlock, editor, changeFn) {
	if ($isListItemNode(oldBlock)) {
		const diffNode = $createDiffNode("listItemModify");
		const p = $createParagraphNode();
		oldBlock.getChildren().forEach((child) => {
			p.append($cloneNode(child, editor));
		});
		changeFn();
		diffNode.append(p);
		const pNew = $createParagraphNode();
		oldBlock.getChildren().forEach((child) => {
			pNew.append(child);
		});
		diffNode.append(pNew);
		oldBlock.append(diffNode);
		return;
	}
	if ($isTableCellNode(oldBlock) && !$isTableCellDiffNode(oldBlock) && $isTableRowNode(oldBlock.getParent())) {
		const before = $createDiffContentNode("before");
		oldBlock.getChildren().forEach((child) => before.append($cloneNode(child, editor)));
		changeFn();
		const newBlock = $getNodeByKey(oldBlock.getKey());
		if (!$isTableCellNode(newBlock)) throw new Error("Updated table cell node not found for modify wrapper.");
		const after = $createDiffContentNode("after");
		newBlock.getChildren().forEach((child) => after.append($cloneNode(child, editor)));
		newBlock.clear();
		newBlock.append($createDiffNode("modify").append(before, after));
		return;
	}
	const diffNode = $createDiffNode("modify");
	diffNode.append($cloneNode(oldBlock, editor));
	changeFn();
	const newBlock = $getNodeByKey(oldBlock.getKey());
	if (!newBlock) throw new Error("New block node not found for modify wrapper.");
	diffNode.append($cloneNode(newBlock, editor));
	newBlock.replace(diffNode, false);
}
function registerLiteXMLCommand(editor, dataSource) {
	return mergeRegister(editor.registerCommand(LITEXML_MODIFY_COMMAND, (operations) => {
		applyLiteXMLBatch(editor, dataSource, operations);
		return false;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(LITEXML_MODIFY_WITH_RESULTS_COMMAND, ({ operations, onResults }) => {
		onResults(applyLiteXMLBatch(editor, dataSource, operations));
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(LITEXML_APPLY_COMMAND, (payload) => {
		const { litexml, delay } = payload;
		const arrayXml = toArrayXml(litexml);
		if (!delay) {
			handleModify(editor, dataSource, arrayXml);
			return false;
		}
		const operation = {
			action: "modify",
			litexml
		};
		const document = getActiveSerializedDocument();
		try {
			const prepared = prepareModify(editor, dataSource, arrayXml);
			if (projectOperation(dataSource, document, toProjectionOperation(operation), prepared.readXml)) applyPreparedModify(editor, prepared);
		} catch (error) {
			logger$7.error("❌ Failed to apply LiteXML modification:", error);
		}
		return false;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(LITEXML_REMOVE_COMMAND, (payload) => {
		const { id, delay } = payload;
		if (!delay) {
			handleRemove(editor, id, delay);
			return false;
		}
		const operation = {
			action: "remove",
			id
		};
		if (projectOperation(dataSource, getActiveSerializedDocument(), toProjectionOperation(operation))) handleRemove(editor, id, delay);
		return false;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(LITEXML_INSERT_COMMAND, (payload) => {
		if (!payload.delay) {
			handleInsert(editor, payload, dataSource);
			return false;
		}
		if (projectOperation(dataSource, getActiveSerializedDocument(), toProjectionOperation({
			action: "insert",
			...payload
		}))) handleInsert(editor, payload, dataSource);
		return false;
	}, COMMAND_PRIORITY_EDITOR));
}
function applyPreparedModify(editor, prepared) {
	const modifyBlockNodes = /* @__PURE__ */ new Set();
	const diffNodeMap = /* @__PURE__ */ new Map();
	for (const { oldNode, newNode } of prepared.pairs) if (!handleReplaceForApplyDelay(oldNode, newNode, modifyBlockNodes, diffNodeMap, editor)) throw new Error(`Node id "${$getNodeId(oldNode)}" could not be modified.`);
	finalizeModifyBlocks(modifyBlockNodes, diffNodeMap, editor);
	return prepared.pairs.length > 0;
}
function handleModify(editor, dataSource, arrayXml) {
	let applied = false;
	arrayXml.forEach((xml) => {
		const inode = dataSource.readLiteXMLToInode(xml);
		let prevNode = null;
		inode.root.children.forEach((child) => {
			try {
				const { oldNode, newNode } = tryParseChild(child, editor);
				if (oldNode && newNode) {
					prevNode = oldNode.replace(newNode, false);
					applied = true;
				} else if (newNode) {
					if (prevNode) {
						if (!newNode.isInline()) {
							const prevBlock = $closest(prevNode, (node) => node.isInline() === false);
							if (prevBlock) prevNode = prevBlock.insertAfter(newNode);
							else {
								$insertNodes([newNode]);
								prevNode = newNode;
							}
							applied = true;
						} else {
							prevNode = prevNode.insertAfter(newNode);
							applied = true;
						}
					} else {
						$insertNodes([newNode]);
						applied = true;
					}
				}
			} catch (error) {
				logger$7.error("❌ Error replacing node:", error);
			}
		});
	});
	return applied;
}
function handleRemove(editor, nodeId, delay) {
	let applied = false;
	const node = $findNodeById(nodeId);
	if (!node) return false;
	if (!delay) {
		if ($isTableCellNode(node)) {
			const table = $getTableForCell(node);
			const columnIndex = $getTableCellColumnIndex(node);
			const span = node.getColSpan();
			node.remove();
			applied = true;
			if (table && columnIndex >= 0) $shrinkTableWidthsAfterCellRemoval(table, columnIndex, span);
			return true;
		}
		node.remove();
		applied = true;
		return true;
	}
	if ($isTableCellNode(node)) {
		const table = $getTableForCell(node);
		const columnIndex = $getTableCellColumnIndex(node);
		if (!table || columnIndex < 0) {
			logger$7.error(`❌ Table cell ${node.getKey()} is not attached to a valid table row.`);
			return false;
		}
		const changeId = `${table.getKey()}:column:${columnIndex}`;
		node.replace($createTableCellDiffFromCell(editor, node, "remove", changeId), false);
		applied = true;
		return true;
	}
	if ($isTableRowNode(node) && $isTableNode(node.getParent())) {
		node.replace($createTableRowDiffFromRow(editor, node, "remove"), false);
		applied = true;
		return true;
	}
	if (node.isInline() === false) {
		const originDiffNode = $closest(node, (node) => node.getType() === DiffNode.getType());
		if (originDiffNode) {
			switch (originDiffNode.diffType) {
				case "add":
					originDiffNode.remove();
					applied = true;
					return true;
				case "modify": {
					const children = originDiffNode.getChildren();
					const newDiff = $createDiffNode("remove");
					const before = children[0];
					newDiff.append(...$isDiffContentNode(before) ? before.getChildren() : [before]);
					originDiffNode.replace(newDiff, false);
					applied = true;
					return true;
				}
				case "listItemModify": {
					const children = originDiffNode.getChildren();
					originDiffNode.replace(children[0], false).selectEnd();
					applied = true;
					return true;
				}
			}
			return false;
		}
		if ($isListItemNode(node)) {
			const diffNode = $createDiffNode("listItemRemove");
			node.getChildren().forEach((child) => {
				diffNode.append($cloneNode(child, editor));
			});
			node.clear();
			node.append(diffNode);
			applied = true;
		} else {
			const diffNode = $createDiffNode("remove");
			diffNode.append($cloneNode(node, editor));
			node.replace(diffNode, false);
			applied = true;
		}
	} else {
		const oldBlock = $closest(node, (node) => node.isInline() === false);
		if (!oldBlock) throw new Error("Old block node not found for removal.");
		if ($closest(node, (node) => node.getType() === DiffNode.getType())) {
			node.remove();
			applied = true;
			return true;
		}
		wrapBlockModify(oldBlock, editor, () => {
			node.remove();
		});
		applied = true;
	}
	return applied;
}
function handleInsert(editor, payload, dataSource, referenceNodeOverride) {
	const { litexml, delay } = payload;
	const isBefore = "beforeId" in payload;
	const inode = dataSource.readLiteXMLToInode(litexml);
	let insertedNodeId = null;
	try {
		let referenceNode = referenceNodeOverride || null;
		if (!referenceNode) {
			if (isBefore) {
				if (payload.beforeId === "root") referenceNode = $getRoot().getFirstChild();
				else referenceNode = $findNodeById(payload.beforeId);
			} else if (payload.afterId === "root") referenceNode = $getRoot().getLastChild();
			else referenceNode = $findNodeById(payload.afterId);
		}
		if (!referenceNode) throw new Error("Reference node not found for insertion.");
		const newNodes = inode.root.children.map((child) => $parseSerializedNodeImpl(child, editor));
		$ensureUniqueNodeIds(newNodes);
		insertedNodeId = newNodes.length ? $getNodeId(newNodes.at(-1)) || null : null;
		const referencesTableCell = $isTableCellNode(referenceNode);
		const insertsOnlyTableCells = newNodes.length > 0 && newNodes.every($isTableCellNode);
		if (referencesTableCell || insertsOnlyTableCells) {
			if (!referencesTableCell || !insertsOnlyTableCells) {
				logger$7.error("❌ Table cells can only be inserted next to another cell in the same row.");
				return null;
			}
			const cellReference = referenceNode;
			const table = $getTableForCell(cellReference);
			const referenceIndex = $getTableCellColumnIndex(cellReference);
			if (!table || referenceIndex < 0) {
				logger$7.error("❌ Table cell insertion requires a valid table parent.");
				return null;
			}
			const rowWidthBefore = $getLogicalRowWidth(cellReference);
			const insertionIndex = isBefore ? referenceIndex : referenceIndex + cellReference.getColSpan();
			$updateTableWidthsForCellInsertion(table, rowWidthBefore, insertionIndex, newNodes.reduce((total, node) => total + ($isTableCellNode(node) ? node.getColSpan() : 0), 0));
			let spanOffset = 0;
			const cells = newNodes.map((node) => {
				const result = delay ? $createTableCellDiffFromCell(editor, node, "add", `${table.getKey()}:column:${insertionIndex + spanOffset}`) : node;
				spanOffset += node.getColSpan();
				return result;
			});
			if (isBefore) cells.reverse().forEach((cell) => {
				referenceNode = referenceNode.insertBefore(cell);
			});
			else cells.forEach((cell) => {
				referenceNode = referenceNode.insertAfter(cell);
			});
			return insertedNodeId;
		}
		if (!delay) {
			if (isBefore) newNodes.reverse().forEach((node) => {
				referenceNode = referenceNode.insertBefore(node);
			});
			else newNodes.forEach((node) => {
				if (referenceNode) referenceNode = referenceNode.insertAfter(node);
			});
			return insertedNodeId;
		}
		const referencesTableRow = $isTableRowNode(referenceNode);
		const insertsOnlyTableRows = newNodes.every($isTableRowNode);
		if (referencesTableRow || insertsOnlyTableRows) {
			if (!referencesTableRow || !insertsOnlyTableRows || !$isTableNode(referenceNode.getParent())) {
				logger$7.error("❌ Table rows can only be inserted next to another row in the same table.");
				return null;
			}
			if (isBefore) newNodes.reverse().forEach((node) => {
				if (!$isTableRowNode(node)) return;
				const diffRow = $createTableRowDiffFromRow(editor, node, "add");
				referenceNode = referenceNode.insertBefore(diffRow);
			});
			else newNodes.forEach((node) => {
				if (!$isTableRowNode(node)) return;
				const diffRow = $createTableRowDiffFromRow(editor, node, "add");
				referenceNode = referenceNode.insertAfter(diffRow);
			});
			return insertedNodeId;
		}
		if (isBefore) {
			if (referenceNode.isInline() === false) {
				const originDiffNode = $closest(referenceNode, (node) => node.getType() === DiffNode.getType());
				if (originDiffNode) referenceNode = originDiffNode;
				newNodes.map((node) => {
					if ($isListItemNode(node)) {
						const diffNode = $createDiffNode("listItemAdd");
						node.getChildren().forEach((child) => diffNode.append(child));
						return node.append(diffNode);
					}
					const diffNode = $createDiffNode("add");
					diffNode.append(node);
					return diffNode;
				}).reverse().forEach((diffNode) => {
					if (referenceNode) referenceNode = referenceNode.insertBefore(diffNode);
				});
			} else {
				const refBlock = $closest(referenceNode, (node) => node.isInline() === false);
				if (!refBlock) throw new Error("Reference block node not found for insertion.");
				if ($closest(referenceNode, (node) => node.getType() === DiffNode.getType())) newNodes.forEach((node) => {
					if (referenceNode) referenceNode = referenceNode.insertBefore(node);
				});
				else wrapBlockModify(refBlock, editor, () => {
					newNodes.forEach((node) => {
						if (referenceNode) referenceNode = referenceNode.insertBefore(node);
					});
				});
			}
		} else if (referenceNode.isInline() === false) {
			const originDiffNode = $closest(referenceNode, (node) => node.getType() === DiffNode.getType());
			if (originDiffNode) referenceNode = originDiffNode;
			newNodes.forEach((node) => {
				if (referenceNode) {
					if ($isListItemNode(node)) {
						const diffNode = $createDiffNode("listItemAdd");
						node.getChildren().forEach((child) => {
							diffNode.append(child);
						});
						node.append(diffNode);
						referenceNode = referenceNode.insertAfter(node);
					} else {
						const diffNode = $createDiffNode("add");
						diffNode.append(node);
						referenceNode = referenceNode.insertAfter(diffNode);
					}
				}
			});
		} else {
			const refBlock = $closest(referenceNode, (node) => node.isInline() === false);
			if (!refBlock) throw new Error("Reference block node not found for insertion.");
			if ($closest(referenceNode, (node) => node.getType() === DiffNode.getType())) newNodes.forEach((node) => {
				if (referenceNode) referenceNode = referenceNode.insertAfter(node);
			});
			else wrapBlockModify(refBlock, editor, () => {
				newNodes.forEach((node) => {
					if (referenceNode) referenceNode = referenceNode.insertAfter(node);
				});
			});
		}
	} catch (error) {
		logger$7.error("❌ Error inserting node:", error);
		insertedNodeId = null;
	}
	return insertedNodeId;
}
//#endregion
//#region src/plugins/litexml/command/diffCommand.ts
function doTableRowAction(editor, node, action) {
	const pair = $getTableRowDiffPair(node);
	if (pair) {
		const survivingRow = action === 1 ? pair.add : pair.remove;
		const discardedRow = action === 1 ? pair.remove : pair.add;
		const plainRow = $createPlainTableRowFromDiff(editor, survivingRow);
		discardedRow.remove();
		survivingRow.replace(plainRow, false);
		plainRow.selectStart();
		return;
	}
	if (node.getDiffType() === "remove") {
		if (action === 1) node.remove();
		else {
			const plainRow = $createPlainTableRowFromDiff(editor, node);
			node.replace(plainRow, false);
			plainRow.selectStart();
		}
		return;
	}
	if (action === 1) {
		const plainRow = $createPlainTableRowFromDiff(editor, node);
		node.replace(plainRow, false);
		plainRow.selectStart();
	} else node.remove();
}
function doTableCellAction(editor, node, action) {
	const group = $getTableCellDiffGroup(node);
	const table = $getTableForCell(node);
	const columnIndex = $getTableCellColumnIndex(node);
	const span = node.getColSpan();
	if (node.getDiffType() === "add" && action === 1 || node.getDiffType() === "remove" && action === 0) {
		group.forEach((cell) => cell.replace($createPlainTableCellFromDiff(editor, cell), false));
		return;
	}
	if (table && columnIndex >= 0) {
		const widthCount = table.getColWidths()?.length;
		$removeTableWidthsForCompleteCellGroup(table, group, columnIndex, span);
		group.forEach((cell) => cell.remove());
		if (table.getColWidths()?.length === widthCount) $shrinkTableWidthsAfterCellRemoval(table, columnIndex, span);
		return;
	}
	group.forEach((cell) => cell.remove());
}
function doAction(editor, node, action) {
	if ($isTableRowDiffNode(node)) {
		doTableRowAction(editor, node, action);
		return;
	}
	const parent = node.getParent();
	if ($isTableCellDiffNode(parent)) {
		doTableCellAction(editor, parent, action);
		return;
	}
	if (node.diffType === "modify") {
		const children = node.getChildren();
		const selectedChild = action === 1 ? children[1] : children[0];
		if ($isDiffContentNode(selectedChild)) {
			const parent = node.getParentOrThrow();
			selectedChild.getChildren().forEach((child) => node.insertBefore(child));
			node.remove();
			if ($isElementNode(parent)) parent.selectEnd();
		} else if (selectedChild) node.replace(selectedChild, false).selectEnd();
	}
	if (node.diffType === "remove") {
		if (action === 1) node.remove();
		else if (action === 0) {
			const children = node.getChildren();
			node.replace(children[0], false).selectEnd();
		}
	}
	if (node.diffType === "add") {
		if (action === 1) {
			const children = node.getChildren();
			const parent = node.getParentOrThrow();
			children.forEach((child) => node.insertBefore(child));
			node.remove();
			if ($isElementNode(parent)) parent.selectEnd();
		} else if (action === 0) node.remove();
	}
	if (node.diffType === "listItemModify") {
		const children = node.getChildren();
		if (action === 1) {
			const lastChild = children[1];
			if (!$isElementNode(lastChild)) throw new Error("Expected element node as child of DiffNode");
			const nodeChildrens = lastChild.getChildren();
			for (let i = nodeChildrens.length - 1; i >= 0; i--) node.insertAfter(nodeChildrens[i]);
			const parent = node.getParentOrThrow();
			node.remove();
			parent.selectEnd();
		} else if (action === 0) {
			const firstChild = children[0];
			if (!$isElementNode(firstChild)) throw new Error("Expected element node as child of DiffNode");
			const nodeChildrens = firstChild.getChildren();
			for (let i = nodeChildrens.length - 1; i >= 0; i--) node.insertAfter(nodeChildrens[i]);
			const parent = node.getParentOrThrow();
			node.remove();
			parent.selectEnd();
		}
	}
	if (node.diffType === "listItemRemove") {
		if (action === 1) node.getParentOrThrow().remove();
		else if (action === 0) {
			node.getChildren().forEach((child) => {
				node.getParentOrThrow().append(child);
			});
			node.getParentOrThrow().selectEnd();
			node.remove();
		}
	}
	if (node.diffType === "listItemAdd") {
		if (action === 1) {
			node.getChildren().forEach((child) => {
				node.getParentOrThrow().append(child);
			});
			node.getParentOrThrow().selectEnd();
			node.remove();
		} else if (action === 0) node.getParentOrThrow().remove();
	}
}
function registerLiteXMLDiffCommand(editor) {
	return mergeRegister(editor.registerCommand(LITEXML_DIFFNODE_COMMAND, (payload) => {
		const { action, nodeKey } = payload;
		editor.update(() => {
			const node = $getNodeByKey(nodeKey);
			if (!(node instanceof DiffNode) && !$isTableRowDiffNode(node)) return;
			doAction(editor, node, action);
		});
		return false;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(LITEXML_DIFFNODE_ALL_COMMAND, (payload) => {
		const { action } = payload;
		const nodeKeys = editor.getEditorState().read(() => {
			return Array.from(editor._editorState._nodeMap.values()).filter((node) => (node instanceof DiffNode || $isTableRowDiffNode(node)) && !!node.getParent()).map((node) => node.getKey());
		});
		if (!nodeKeys.length) return false;
		editor.update(() => {
			const handled = /* @__PURE__ */ new Set();
			nodeKeys.forEach((nodeKey) => {
				if (handled.has(nodeKey)) return;
				const node = $getNodeByKey(nodeKey);
				if (!(node instanceof DiffNode) && !$isTableRowDiffNode(node)) return;
				const pair = $isTableRowDiffNode(node) ? $getTableRowDiffPair(node) : null;
				if (pair) {
					handled.add(pair.remove.getKey());
					handled.add(pair.add.getKey());
				} else {
					const parent = node instanceof DiffNode ? node.getParent() : null;
					if ($isTableCellDiffNode(parent)) $getTableCellDiffGroup(parent).forEach((cell) => {
						const diff = cell.getFirstChild();
						if (diff instanceof DiffNode) handled.add(diff.getKey());
					});
					handled.add(nodeKey);
				}
				doAction(editor, node, action);
			});
		});
		return false;
	}, COMMAND_PRIORITY_EDITOR));
}
//#endregion
//#region src/plugins/inode/service/index.ts
/**
* Service ID for Node service
*/
const INodeService = genServiceId("INodeService");
/**
* Default implementation of INodeService
*/
var NodeService = class {
	constructor() {
		this.processNodeTreeHandlers = [];
	}
	registerProcessNodeTree(process) {
		this.processNodeTreeHandlers.push(process);
	}
	processNodeTree(inode) {
		for (const handler of this.processNodeTreeHandlers) handler(inode);
	}
};
//#endregion
//#region src/plugins/inode/plugin/index.ts
/**
* LitexmlPlugin - A plugin that provides XML-based data source support
* Allows converting between Lexical editor state and XML format
*/
const INodePlugin = class extends KernelPlugin {
	static {
		this.pluginName = "INodePlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		const nodeService = new NodeService();
		kernel.registerService(INodeService, nodeService);
	}
	onInit() {}
};
//#endregion
//#region src/plugins/litexml/service/litexml-service.ts
/**
* Service ID for Litexml service
*/
const ILitexmlService = genServiceId("ILitexmlService");
/**
* Default implementation of ILitexmlService
*/
var LitexmlService = class {
	constructor() {
		this.readers = {};
		this.writers = {};
	}
	registerXMLReader(tagName, reader) {
		const key = tagName.toLowerCase();
		if (this.readers[key]) {
			const existing = this.readers[key];
			this.readers[key] = Array.isArray(existing) ? [...existing, reader] : [existing, reader];
		} else this.readers[key] = reader;
	}
	registerXMLWriter(nodeType, writer) {
		if (this.writers[nodeType]) {
			const existing = this.writers[nodeType];
			this.writers[nodeType] = Array.isArray(existing) ? [...existing, writer] : [existing, writer];
		} else this.writers[nodeType] = writer;
	}
	getXMLReaders() {
		return { ...this.readers };
	}
	getXMLWriters() {
		return { ...this.writers };
	}
	hasXMLReader(tagName) {
		return !!this.readers[tagName.toLowerCase()];
	}
	hasXMLWriter(nodeType) {
		return !!this.writers[nodeType];
	}
};
//#endregion
//#region src/plugins/litexml/data-source/litexml-data-source.ts
const logger$6 = createDebugLogger("plugin", "litexml");
var IXmlWriterContext = class {
	createXmlNode(tagName, attributes, textContent) {
		return {
			attributes: attributes || {},
			children: [],
			tagName,
			textContent
		};
	}
};
/**
* LitexmlDataSource - Handles conversion between Lexical editor state and XML format
* Provides read (parse XML to Lexical) and write (export Lexical to XML) capabilities
*/
var LitexmlDataSource = class extends DataSource {
	constructor(dataType = "litexml", getService, service) {
		super(dataType);
		this.dataType = dataType;
		this.getService = getService;
		this.ctx = new IXmlWriterContext();
		this.litexmlService = service || new LitexmlService();
	}
	readLiteXMLToInode(litexml) {
		if (typeof litexml !== "string") throw new Error("Invalid data type. Expected string, got " + typeof litexml);
		const xml = this.parseXMLString(litexml);
		const inode = this.xmlToLexical(xml);
		this.getService?.(INodeService)?.processNodeTree(inode);
		logger$6.debug("Parsed XML to Lexical State:", inode);
		return inode;
	}
	/**
	* Parse XML string and set it to the editor
	* @param editor - The Lexical editor instance
	* @param data - XML string to parse
	*/
	read(editor, data) {
		try {
			const inode = this.readLiteXMLToInode(data);
			const newState = editor.parseEditorState(inode, () => {
				$normalizeNodeIds($getRoot());
			});
			editor.setEditorState(newState);
		} catch (error) {
			logger$6.error("Failed to parse XML:", error);
			throw error;
		}
	}
	/**
	* Export editor content to XML format
	* @param editor - The Lexical editor instance
	* @param options - Write options (e.g., selection flag)
	* @returns XML string representation of the editor content
	*/
	write(editor, options) {
		try {
			if (options?.selection) return editor.getEditorState().read(() => {
				const selection = $getSelection();
				if (!selection) return null;
				if ($isRangeSelection(selection)) {
					const selectedNodes = selection.getNodes();
					const rootNode = INodeHelper.createRootNode();
					if (selectedNodes.some((node) => node.isInline())) {
						const p = INodeHelper.createParagraph();
						INodeHelper.appendChild(p, ...selectedNodes.map((node) => node.exportJSON()));
						INodeHelper.appendChild(rootNode, p);
					} else INodeHelper.appendChild(rootNode, ...selectedNodes.map((node) => node.exportJSON()));
					return editor.parseEditorState({ root: rootNode }).read(() => {
						const lexicalRootNode = $getRoot();
						return this.lexicalToXML(lexicalRootNode);
					});
				}
				return null;
			});
			return editor.getEditorState().read(() => {
				const rootNode = $getRoot();
				return this.lexicalToXML(rootNode);
			});
		} catch (error) {
			logger$6.error("Failed to export to XML:", error);
			throw error;
		}
	}
	/**
	* Parse XML string using browser's built-in parser
	*/
	parseXMLString(xmlString) {
		const doc = new DOMParser$1().parseFromString(xmlString, "text/xml");
		if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Invalid XML: " + xmlString);
		return doc;
	}
	/**
	* Convert XML document to Lexical node structure
	*/
	xmlToLexical(xml) {
		const rootNode = INodeHelper.createRootNode();
		const xmlRoot = xml.documentElement;
		if (xmlRoot) this.processXMLElement(xmlRoot, rootNode);
		return { root: rootNode };
	}
	/**
	* Recursively process XML elements and convert to Lexical nodes
	*/
	processXMLElement(xmlElement, parentNode) {
		const tagName = xmlElement.tagName.toLowerCase();
		const customReaders = this.litexmlService.getXMLReaders();
		const publicId = xmlElement.getAttribute("id") || void 0;
		const attachPublicId = (node, id = publicId) => {
			if (!node || !id) return;
			node.id = id;
			node.$ = {
				...node.$,
				properties: {
					...node.$?.properties,
					nodeId: id
				}
			};
		};
		const append = (node) => {
			attachPublicId(node);
			INodeHelper.appendChild(parentNode, node);
		};
		if (customReaders[tagName]) {
			const readerOrReaders = customReaders[tagName];
			const readers = Array.isArray(readerOrReaders) ? readerOrReaders : [readerOrReaders];
			for (const reader of readers) {
				const children = [];
				this.processXMLChildren(xmlElement, { children });
				const result = reader(xmlElement, children);
				if (result !== false) {
					if (Array.isArray(result)) {
						if (result.length > 0) attachPublicId(result[0]);
						INodeHelper.appendChild(parentNode, ...result);
					} else if (result) append(result);
					return;
				}
			}
		}
		switch (tagName) {
			case "p":
			case "paragraph": {
				const paragraph = INodeHelper.createParagraph();
				this.processXMLChildren(xmlElement, paragraph);
				append(paragraph);
				break;
			}
			case "h1":
			case "h2":
			case "h3":
			case "h4":
			case "h5":
			case "h6": {
				const level = parseInt(tagName.charAt(1));
				const heading = INodeHelper.createElementNode("heading", {
					children: [],
					tag: `h${level}`
				});
				this.processXMLChildren(xmlElement, heading);
				append(heading);
				break;
			}
			case "ul":
			case "ol":
				Array.from(xmlElement.childNodes).forEach((child) => {
					if (child.nodeType !== 1) return;
					if (String(child.tagName).toLowerCase() !== "li") return;
					const listItem = INodeHelper.createElementNode("listitem", {
						children: [],
						value: 1
					});
					attachPublicId(listItem, child.getAttribute("id") || void 0);
					this.processXMLChildren(child, listItem);
					INodeHelper.appendChild(parentNode, listItem);
				});
				break;
			case "blockquote": {
				const quote = INodeHelper.createElementNode("quote", { children: [] });
				this.processXMLChildren(xmlElement, quote);
				append(quote);
				break;
			}
			case "code":
				append(INodeHelper.createElementNode("codeInline", { children: [INodeHelper.createTextNode(xmlElement.textContent || "")] }));
				break;
			case "text": {
				const textContent = xmlElement.textContent || "";
				if (textContent) append(INodeHelper.createTextNode(textContent));
				break;
			}
			default: this.processXMLChildren(xmlElement, parentNode);
		}
	}
	/**
	* Process XML element's children
	*/
	processXMLChildren(xmlElement, parentNode) {
		Array.from(xmlElement.childNodes).forEach((child) => {
			if (child.nodeType === 1) this.processXMLElement(child, parentNode);
			else if (child.nodeType === 3) {
				const text = child.textContent || "";
				if (text.trim()) {
					const textNode = INodeHelper.createTextNode(text);
					INodeHelper.appendChild(parentNode, textNode);
				}
			}
		});
	}
	/**
	* Convert Lexical node structure to XML string
	*/
	lexicalToXML(rootNode) {
		const xmlLines = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>"];
		xmlLines.push("<root>");
		rootNode.getChildren().forEach((child) => {
			this.nodesToXML(child, xmlLines);
		});
		xmlLines.push("</root>");
		return xmlLines.join("\n");
	}
	/**
	* Recursively convert Lexical nodes to XML elements
	*/
	nodesToXML(node, lines, indent = 1) {
		const indentStr = " ".repeat(indent * 2);
		const type = node.getType();
		const customWriters = this.litexmlService.getXMLWriters();
		const childLines = [];
		if (customWriters[type]) {
			const writerOrWriters = customWriters[type];
			const writers = Array.isArray(writerOrWriters) ? writerOrWriters : [writerOrWriters];
			for (const writer of writers) {
				const handled = writer(node, this.ctx, indent, this.nodesToXML.bind(this));
				if (handled) {
					if ("lines" in handled) {
						lines.push(...handled.lines);
						return;
					}
					const attributes = {
						id: $getNodeId(node),
						...handled.attributes
					};
					attributes.id = $getNodeId(node);
					const attrs = this.buildXMLAttributes(attributes);
					const openTag = `${indentStr}<${handled.tagName}${attrs}>`;
					const closeTag = `</${handled.tagName}>`;
					if (handled.textContent) lines.push(`${openTag}${handled.textContent}${closeTag}`);
					else if ($isElementNode(node)) {
						node.getChildren().forEach((child) => {
							this.nodesToXML(child, childLines, indent + 1);
						});
						lines.push(openTag, ...childLines, `${indentStr}${closeTag}`);
					} else lines.push(openTag, `${indentStr}${closeTag}`);
					return;
				}
			}
		}
		if ($isElementNode(node)) node.getChildren().forEach((child) => {
			this.nodesToXML(child, childLines, indent);
		});
		lines.push(...childLines);
	}
	/**
	* Build XML attribute string from attributes object
	*/
	buildXMLAttributes(attributes) {
		if (!attributes || typeof attributes !== "object") return "";
		return Object.entries(attributes).filter(([, value]) => value !== void 0 && value !== null && value !== "").map(([key, value]) => {
			return ` ${key}="${this.escapeXML(String(value))}"`;
		}).join("");
	}
	/**
	* Escape XML special characters
	*/
	escapeXML(text) {
		return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;").replaceAll("	", "&#9;").replaceAll("\n", "&#10;").replaceAll("\r", "&#13;");
	}
};
//#endregion
//#region src/plugins/markdown/utils/logger.ts
const logger$5 = createDebugLogger("plugin", "markdown");
//#endregion
//#region src/plugins/markdown/data-source/markdown/parse.ts
const selfClosingHtmlTags = /* @__PURE__ */ new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr"
]);
var MarkdownContext = class {
	constructor(root, markdown) {
		this.root = root;
		this.markdown = markdown;
		this.stack = [];
	}
	push(html) {
		this.stack.push(html);
	}
	get isReadingHTML() {
		return this.stack.length > 0;
	}
	get last() {
		return this.stack.at(-1);
	}
	pop() {
		return this.stack.pop();
	}
};
const getNodeRawMarkdown = (node, markdown) => {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (typeof start === "number" && typeof end === "number") return markdown.slice(start, end);
	if ("value" in node && typeof node.value === "string") return node.value;
	return "";
};
const createFallbackRawNode = (node, ctx, parentType) => {
	const raw = getNodeRawMarkdown(node, ctx.markdown);
	if (!raw) return null;
	if (parentType === null || parentType === "root") return {
		...INodeHelper.createParagraph(),
		children: [INodeHelper.createTextNode(raw)]
	};
	return INodeHelper.createTextNode(raw);
};
function convertMdastToLexical(node, index, ctx, markdownReaders = {}, parentType = null) {
	switch (node.type) {
		case "text": return INodeHelper.createTextNode(node.value);
		default: {
			if (!markdownReaders[node.type]) return createFallbackRawNode(node, ctx, parentType);
			let children = [];
			if ("children" in node && Array.isArray(node.children)) {
				const htmlStack = [];
				children = node.children.reduce((ret, child, index) => {
					if (child.type === "html") {
						if (!markdownReaders["html"]) {
							ret.push(INodeHelper.createTextNode(child.value));
							return ret;
						}
						if (child.value.startsWith("<!--") && child.value.endsWith("-->")) return ret;
						const tag = getHtmlTagName$1(child.value);
						const isEndTag = child.value.startsWith("</");
						const pairedTag = child.value.match(/^<\s*([a-z0-9-]+)\b[^>]*>([\s\S]*)<\/\s*\1\s*>$/i);
						if (!isEndTag && pairedTag) {
							const reader = markdownReaders["html"];
							const htmlChildren = pairedTag[2] ? [INodeHelper.createTextNode(pairedTag[2])] : [];
							if (Array.isArray(reader)) for (const element of reader) {
								const inode = element(child, htmlChildren, index);
								if (inode) {
									ret.push(inode);
									return ret;
								}
							}
							else if (typeof reader === "function") {
								const inode = reader(child, htmlChildren, index);
								if (inode) {
									ret.push(inode);
									return ret;
								}
							}
							ret.push(INodeHelper.createTextNode(child.value));
							return ret;
						}
						if (selfClosingHtmlTags.has(tag)) {
							const reader = markdownReaders["html"];
							if (Array.isArray(reader)) for (const element of reader) {
								const inode = element(child, [], index);
								if (inode) {
									ret.push(inode);
									return ret;
								}
							}
							else if (typeof reader === "function") {
								const inode = reader(child, [], index);
								if (inode) {
									ret.push(inode);
									return ret;
								}
							}
							return ret;
						}
						if (isEndTag) {
							const top = ctx.pop();
							htmlStack.pop();
							if (top?.tag !== tag) {
								logger$5.warn("HTML tag mismatch:", tag);
								ret.push(...top?.children || []);
								return ret;
							}
							const reader = markdownReaders["html"];
							const children = top.children.flat().filter(Boolean) || [];
							if (Array.isArray(reader)) for (const element of reader) {
								const inode = element(top.node, children, index);
								if (inode) {
									ret.push(inode);
									return ret;
								}
							}
							else if (typeof reader === "function") {
								const inode = reader(top.node, children, index);
								if (inode) {
									ret.push(inode);
									return ret;
								}
							}
							if (top) ret.push(...top.children);
							return ret;
						}
						const htmlStackItem = {
							children: [],
							index,
							isEndTag,
							node: child,
							tag
						};
						htmlStack.push(htmlStackItem);
						ctx.push(htmlStackItem);
						return ret;
					}
					if (htmlStack.length > 0) {
						const top = ctx.last;
						if (top) top.children.push(convertMdastToLexical(child, index, ctx, markdownReaders, node.type));
						return ret;
					}
					ret.push(convertMdastToLexical(child, index, ctx, markdownReaders, node.type));
					return ret;
				}, []).filter(Boolean).flat();
				while (htmlStack.length > 0) {
					const tag = htmlStack.shift();
					ctx.pop();
					children.push(INodeHelper.createTextNode(tag?.node.value), ...tag.children.flat());
					children = children.flat();
				}
			}
			if (markdownReaders[node.type]) {
				const reader = markdownReaders[node.type];
				if (Array.isArray(reader)) for (const element of reader) {
					const inode = element(node, children, index);
					if (inode) return inode;
				}
				else if (typeof reader === "function") {
					const inode = reader(node, children, index);
					if (inode) return inode;
				}
			}
			return children || null;
		}
	}
}
function getHtmlTagName$1(value) {
	return value.match(/^<\/?\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase() || value.replaceAll(/^<\/?|>$/g, "");
}
function registerDefaultReaders(markdownReaders) {
	if (!markdownReaders["root"]) markdownReaders["root"] = (node, children) => {
		return {
			...INodeHelper.createRootNode(),
			children
		};
	};
	if (!markdownReaders["paragraph"]) markdownReaders["paragraph"] = (node, children) => {
		return {
			...INodeHelper.createParagraph(),
			children
		};
	};
	if (!markdownReaders["heading"]) markdownReaders["heading"] = (node, children) => {
		const headingType = `h${Math.min(Math.max(node.depth, 1), 6)}`;
		return INodeHelper.createElementNode("heading", {
			children,
			direction: "ltr",
			format: "",
			indent: 0,
			tag: headingType
		});
	};
}
function parseMarkdownToLexical(markdown, markdownReaders = {}) {
	const ast = remark().use(remarkCjkFriendly).use(remarkMath).use([[remarkGfm, { singleTilde: false }]]).parse(markdown);
	logger$5.debug("Parsed MDAST:", ast);
	const ctx = new MarkdownContext(ast, markdown);
	registerDefaultReaders(markdownReaders);
	return convertMdastToLexical(ast, 0, ctx, markdownReaders);
}
//#endregion
//#region src/plugins/markdown/utils/index.ts
/**
* Returns true if the node can contain transformable markdown.
* Code nodes cannot contain transformable markdown.
* For example, `code **bold**` should not be transformed to
* <code>code <strong>bold</strong></code>.
*/
function canContainTransformableMarkdown(node) {
	return $isTextNode(node) && !node.hasFormat("code");
}
function isEqualSubString(stringA, aStart, stringB, bStart, length) {
	for (let i = 0; i < length; i++) if (stringA[aStart + i] !== stringB[bStart + i]) return false;
	return true;
}
const PUNCTUATION_OR_SPACE = /[!-/:-@[-`{-~\s]/;
function getOpenTagStartIndex(string, maxIndex, tag) {
	const tagLength = tag.length;
	for (let i = maxIndex; i >= tagLength; i--) {
		const startIndex = i - tagLength;
		if (isEqualSubString(string, startIndex, tag, 0, tagLength) && string[startIndex + tagLength] !== " ") return startIndex;
	}
	return -1;
}
function indexBy(list, callback) {
	const index = {};
	for (const item of list) {
		const key = callback(item);
		if (!key) continue;
		if (index[key]) index[key].push(item);
		else index[key] = [item];
	}
	return index;
}
let Punctuation = /[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~\u00A1\u2010-\u2027-]/;
try {
	Punctuation = new RegExp("[\\p{Pc}|\\p{Pd}|\\p{Pe}|\\p{Pf}|\\p{Pi}|\\p{Po}|\\p{Ps}]", "u");
} catch {}
/**
* Checks if a character is a punctuation character.
* @param char The character to check.
* @returns True if the character is a punctuation character, false otherwise.
*/
function isPunctuationChar(char) {
	return Punctuation.test(char);
}
function $updateSelectionOnInsert(selection) {
	if ($isRangeSelection(selection) && selection.isCollapsed()) {
		const anchor = selection.anchor;
		let nodeToInspect = null;
		const anchorCaret = $caretFromPoint(anchor, "previous");
		if (anchorCaret) {
			if ($isTextPointCaret(anchorCaret)) nodeToInspect = anchorCaret.origin;
			else {
				const range = $getCaretRange(anchorCaret, $getChildCaret($getRoot(), "next").getFlipped());
				for (const caret of range) if ($isTextNode(caret.origin)) {
					nodeToInspect = caret.origin;
					break;
				} else if ($isElementNode(caret.origin) && !caret.origin.isInline()) break;
			}
		}
		if (nodeToInspect && $isTextNode(nodeToInspect)) {
			const newFormat = nodeToInspect.getFormat();
			const newStyle = nodeToInspect.getStyle();
			if (selection.format !== newFormat || selection.style !== newStyle) {
				selection.format = newFormat;
				selection.style = newStyle;
				selection.dirty = true;
			}
		}
	}
}
/**
* Inserts Lexical nodes into the editor using different strategies depending on
* some simple selection-based heuristics. If you're looking for a generic way to
* to insert nodes into the editor at a specific selection point, you probably want
* {@link lexical.$insertNodes}
*
* @param editor LexicalEditor instance to insert the nodes into.
* @param nodes The nodes to insert.
* @param selection The selection to insert the nodes into.
*/
function $insertGeneratedNodes(editor, nodes, selection) {
	if (!editor.dispatchCommand(SELECTION_INSERT_CLIPBOARD_NODES_COMMAND, {
		nodes,
		selection
	})) {
		selection.insertNodes(nodes);
		$updateSelectionOnInsert(selection);
	}
}
/**
* Creates an object containing all the styles and their values provided in the CSS string.
* @param css - The CSS string of styles and their values.
* @returns The styleObject containing all the styles and their values.
*/
function getStyleObjectFromRawCSS(css) {
	const styleObject = {};
	if (!css) return styleObject;
	const styles = css.split(";");
	for (const style of styles) if (style !== "") {
		const [key, value] = style.split(/:([^]+)/);
		if (key && value) styleObject[key.trim()] = value.trim();
	}
	return styleObject;
}
/**
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*
*/
const CSS_TO_STYLES = /* @__PURE__ */ new Map();
/**
* Gets the TextNode's style object and adds the styles to the CSS.
* @param node - The TextNode to add styles to.
*/
function $addNodeStyle(node) {
	const CSSText = node.getStyle();
	const styles = getStyleObjectFromRawCSS(CSSText);
	CSS_TO_STYLES.set(CSSText, styles);
}
/**
* This method takes an array of objects conforming to the BaseSerializedNode interface and returns
* an Array containing instances of the corresponding LexicalNode classes registered on the editor.
* Normally, you'd get an Array of BaseSerialized nodes from {@link $generateJSONFromSelectedNodes}
*
* @param serializedNodes an Array of objects conforming to the BaseSerializedNode interface.
* @returns an Array of Lexical Node objects.
*/
function $generateNodesFromSerializedNodes(serializedNodes) {
	const nodes = [];
	for (const serializedNode of serializedNodes) {
		const node = $parseSerializedNode(serializedNode);
		if ($isTextNode(node)) $addNodeStyle(node);
		nodes.push(node);
	}
	return nodes;
}
function insertIRootNode(editor, root, selection) {
	$insertGeneratedNodes(editor, $generateNodesFromSerializedNodes(root.children), selection);
}
//#endregion
//#region src/plugins/markdown/command/index.ts
const logger$4 = createDebugLogger("plugin", "markdown");
const INSERT_MARKDOWN_COMMAND = createCommand("INSERT_MARKDOWN_COMMAND");
const GET_MARKDOWN_SELECTION_COMMAND = createCommand("GET_MARKDOWN_SELECTION_COMMAND");
function restoreToEntry(editor, entry) {
	if (!entry) return;
	editor.setEditorState(entry.editorState, { tag: HISTORIC_TAG });
}
const SPICAL_TEXT = "￰";
const getLineNumber = (content, charIndex) => {
	return content.slice(0, Math.max(0, charIndex)).split("\n").length;
};
function getNodeReferenceForKey(editor, key) {
	return editor.getEditorState().read(() => {
		const node = $getNodeByKey(key);
		if (!node) return null;
		if ($isRootNode(node)) return { kind: "root" };
		const id = $getNodeId(node);
		return id ? {
			id,
			kind: "node"
		} : null;
	});
}
function getNodeKeyForReference(editor, reference, offset) {
	return editor.getEditorState().read(() => {
		if (reference.kind === "node") {
			const node = $findNodeById(reference.id);
			return node ? {
				key: node.getKey(),
				offset
			} : void 0;
		}
		const root = $getRoot();
		const findBoundaryText = (node, first) => {
			if ($isTextNode(node)) return node;
			if (!$isElementNode(node)) return null;
			const children = node.getChildren();
			const orderedChildren = first ? children : [...children].reverse();
			for (const child of orderedChildren) {
				const textNode = findBoundaryText(child, first);
				if (textNode) return textNode;
			}
			return null;
		};
		if (offset === 0) {
			const firstText = findBoundaryText(root, true);
			if (firstText) return {
				key: firstText.getKey(),
				offset: 0
			};
		}
		if (offset === root.getChildrenSize()) {
			const lastText = findBoundaryText(root, false);
			if (lastText) return {
				key: lastText.getKey(),
				offset: lastText.getTextContentSize()
			};
		}
		return {
			key: root.getKey(),
			offset
		};
	}, { editor });
}
function mapSelectionToEditor(selection, sourceEditor, targetEditor) {
	const startReference = getNodeReferenceForKey(sourceEditor, selection.startNodeId);
	const endReference = getNodeReferenceForKey(sourceEditor, selection.endNodeId);
	if (!startReference || !endReference) return null;
	const startPoint = getNodeKeyForReference(targetEditor, startReference, selection.startOffset);
	const endPoint = getNodeKeyForReference(targetEditor, endReference, selection.endOffset);
	if (!startPoint || !endPoint) return null;
	return {
		...selection,
		endNodeId: endPoint.key,
		endOffset: endPoint.offset,
		startNodeId: startPoint.key,
		startOffset: startPoint.offset
	};
}
function registerMarkdownCommand(editor, kernel, service) {
	return mergeRegister(editor.registerCommand(INSERT_MARKDOWN_COMMAND, (payload) => {
		const { markdown } = payload;
		logger$4.debug("INSERT_MARKDOWN_COMMAND payload:", payload);
		restoreToEntry(editor, payload.historyState);
		setTimeout(() => {
			editor.update(() => {
				try {
					const root = parseMarkdownToLexical(markdown, service.markdownReaders);
					const selection = $getSelection();
					const nodes = $generateNodesFromSerializedNodes(root.children);
					logger$4.debug("INSERT_MARKDOWN_COMMAND nodes:", nodes);
					$insertGeneratedNodes(editor, nodes, selection);
					return true;
				} catch (error) {
					logger$4.error("Failed to handle markdown paste:", error);
				}
			}, { tag: HISTORY_PUSH_TAG });
		}, 0);
		return false;
	}, COMMAND_PRIORITY_HIGH), editor.registerCommand(GET_MARKDOWN_SELECTION_COMMAND, (payload) => {
		const newEditor = kernel.cloneNodeEditor();
		const sourceEditor = kernel.getLexicalEditor();
		const selection = kernel.getSelection();
		const targetEditor = newEditor.getLexicalEditor();
		const mappedSelection = sourceEditor && targetEditor && selection ? mapSelectionToEditor(selection, sourceEditor, targetEditor) : null;
		if (mappedSelection && targetEditor) {
			newEditor.setSelection(mappedSelection);
			newEditor.getLexicalEditor()?.update(() => {
				const sel = $getSelection();
				if (!sel) return;
				if ($isRangeSelection(sel)) {
					const { key: anchorKey, offset: anchorOffset, type: anchorType } = sel.anchor;
					const { key: focusKey, offset: focusOffset, type: focusType } = sel.focus;
					const newRang = sel.clone();
					newRang.anchor.set(anchorKey, anchorOffset, anchorType);
					newRang.focus.set(anchorKey, anchorOffset, anchorType);
					newRang.insertText(SPICAL_TEXT);
					newRang.focus.set(focusKey, focusOffset, focusType);
					newRang.anchor.set(focusKey, focusOffset, focusType);
					newRang.insertText(SPICAL_TEXT);
				}
			}, { onUpdate: () => {
				const markdownContent = newEditor.getDocument("markdown");
				const startIndex = markdownContent.indexOf(SPICAL_TEXT);
				const endIndex = markdownContent.lastIndexOf(SPICAL_TEXT);
				const startLine = getLineNumber(markdownContent, startIndex);
				const endLine = getLineNumber(markdownContent, endIndex);
				payload.onResult(startLine, endLine);
				logger$4.debug("GET_MARKDOWN_SELECTION_COMMAND markdownContent:", markdownContent);
				logger$4.debug("GET_MARKDOWN_SELECTION_COMMAND startLine:", startLine, "endLine:", endLine);
				return markdownContent;
			} });
		}
		return false;
	}, COMMAND_PRIORITY_HIGH));
}
//#endregion
//#region src/plugins/markdown/data-source/markdown-writer-context.ts
var MarkdownWriterContext = class MarkdownWriterContext {
	constructor(markdownService) {
		this.before = "";
		this.after = "";
		this.children = [];
		this.markdownService = markdownService;
	}
	appendLine(line) {
		this.children.push(line);
	}
	newChild() {
		const child = new MarkdownWriterContext(this.markdownService);
		this.children.push(child);
		return child;
	}
	wrap(before, after) {
		this.before = before;
		this.after = after;
	}
	addProcessor(processor) {
		this.processor = processor;
	}
	toString() {
		const content = this.before + this.children.map((child) => child.toString()).join("") + this.after;
		return this.processor ? this.processor(this.before, this.children.map((child) => child.toString()).join(""), this.after) : content;
	}
	processChild(parentCtx, child) {
		const writer = this.markdownService.markdownWriters[child.getType()];
		let currentCtx = parentCtx;
		if ($isElementNode(child)) currentCtx = currentCtx.newChild();
		let skipChildren = false;
		if (writer) skipChildren = writer(currentCtx, child);
		if (skipChildren) return;
		if ($isElementNode(child)) child.getChildren().forEach((child) => this.processChild(currentCtx, child));
	}
};
//#endregion
//#region src/plugins/markdown/data-source/markdown-data-source.ts
var MarkdownDataSource = class extends DataSource {
	formatMarkdown(markdown) {
		try {
			const result = remark().use([[remarkGfm, { singleTilde: false }]]).data("settings", {
				bullet: "-",
				emphasis: "*",
				fences: true,
				rule: "-",
				strong: "*",
				tightDefinitions: true
			}).processSync(markdown);
			return String(result);
		} catch (error) {
			logger$5.error("Failed to format markdown:", error);
			return markdown;
		}
	}
	constructor(dataType, markdownService, getService) {
		super(dataType);
		this.dataType = dataType;
		this.markdownService = markdownService;
		this.getService = getService;
	}
	read(editor, data) {
		const inode = { root: parseMarkdownToLexical(data, this.markdownService.markdownReaders) };
		this.getService?.(INodeService)?.processNodeTree(inode);
		logger$5.debug("Parsed Lexical State:", inode);
		const editorState = editor.parseEditorState(inode, () => {
			$normalizeNodeIds($getRoot());
		});
		editor.setEditorState(editorState);
	}
	write(editor, options) {
		if (options?.selection) return editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!selection) return null;
			const selectedNodes = selection.getNodes();
			if ($isRangeSelection(selection)) {
				const lastIndex = selectedNodes.length - 1;
				const anchor = selection.anchor;
				const focus = selection.focus;
				const isBefore = anchor.isBefore(focus);
				const firstNode = selectedNodes[0];
				const lastNode = selectedNodes[lastIndex];
				const [anchorOffset, focusOffset] = $getCharacterOffsets(selection);
				const lastElement = [];
				const rootNodes = [];
				for (let i = 0; i < selectedNodes.length; i++) {
					const node = selectedNodes[i];
					if ($isElementNode(node)) {
						const sNode = {
							...node.exportJSON(),
							$key: node.getKey()
						};
						for (let i = 0; i < rootNodes.length; i++) {
							const child = rootNodes[i];
							const childNode = $getNodeByKey(child.$key);
							if (node.isParentOf(childNode)) {
								sNode.children.push(child);
								rootNodes.splice(i, 1);
								i--;
							}
						}
						let hasPush = false;
						for (let i = lastElement.length - 1; i >= 0; i--) if ($getNodeByKey(lastElement[i].$key)?.isParentOf(node)) {
							lastElement[i].children.push(sNode);
							hasPush = true;
							break;
						} else lastElement.pop();
						if (!hasPush) rootNodes.push(sNode);
						lastElement.push(sNode);
					} else if ($isTextNode(node)) {
						const sNode = {
							...node.exportJSON(),
							$key: node.getKey()
						};
						if (node === firstNode) {
							if (node === lastNode) {
								if (anchor.type !== "element" || focus.type !== "element" || focus.offset === anchor.offset) sNode.text = anchorOffset < focusOffset ? sNode.text.slice(anchorOffset, focusOffset) : sNode.text.slice(focusOffset, anchorOffset);
							} else sNode.text = isBefore ? sNode.text.slice(anchorOffset) : sNode.text.slice(focusOffset);
						} else if (node === lastNode) sNode.text = isBefore ? sNode.text.slice(0, focusOffset) : sNode.text.slice(0, anchorOffset);
						let hasPush = false;
						for (let i = lastElement.length - 1; i >= 0; i--) if ($getNodeByKey(lastElement[i].$key)?.isParentOf(node)) {
							lastElement[i].children.push(sNode);
							hasPush = true;
							break;
						} else lastElement.pop();
						if (!hasPush) rootNodes.push(sNode);
					} else {
						const sNode = {
							...node.exportJSON(),
							$key: node.getKey()
						};
						let hasPush = false;
						for (let i = lastElement.length - 1; i >= 0; i--) if ($getNodeByKey(lastElement[i].$key)?.isParentOf(node)) {
							lastElement[i].children.push(sNode);
							hasPush = true;
							break;
						} else lastElement.pop();
						if (!hasPush) rootNodes.push(sNode);
					}
				}
				const rootNode = INodeHelper.createRootNode();
				if (rootNodes.some((node) => INodeHelper.isTextNode(node))) {
					const p = INodeHelper.createParagraph();
					INodeHelper.appendChild(p, ...rootNodes);
					INodeHelper.appendChild(rootNode, p);
				} else INodeHelper.appendChild(rootNode, ...rootNodes);
				const editorState = editor.parseEditorState({ root: rootNode });
				const lexicalRootNode = editorState._nodeMap.get("root");
				const rootCtx = new MarkdownWriterContext(this.markdownService);
				return editorState.read(() => {
					lexicalRootNode.getChildren().forEach((child) => rootCtx.processChild(rootCtx, child));
					return this.formatMarkdown(rootCtx.toString());
				});
			} else if ($isTableSelection(selection)) {}
			const rootNode = INodeHelper.createRootNode();
			if (selectedNodes.some((node) => node.isInline())) {
				const p = INodeHelper.createParagraph();
				INodeHelper.appendChild(p, ...selectedNodes.map((node) => node.exportJSON()));
				INodeHelper.appendChild(rootNode, p);
			} else INodeHelper.appendChild(rootNode, ...selectedNodes.map((node) => node.exportJSON()));
			const editorState = editor.parseEditorState({ root: rootNode });
			const lexicalRootNode = editorState._nodeMap.get("root");
			const rootCtx = new MarkdownWriterContext(this.markdownService);
			return editorState.read(() => {
				lexicalRootNode.getChildren().forEach((child) => rootCtx.processChild(rootCtx, child));
				return rootCtx.toString();
			});
		});
		return editor.getEditorState().read(() => {
			const rootNode = $getRoot();
			const rootCtx = new MarkdownWriterContext(this.markdownService);
			rootNode.getChildren().forEach((child) => rootCtx.processChild(rootCtx, child));
			return this.formatMarkdown(rootCtx.toString());
		});
	}
};
//#endregion
//#region src/plugins/markdown/service/transformers.ts
function testElementTransformers(parentNode, anchorNode, anchorOffset, elementTransformers, fromTrigger) {
	const grandParentNode = parentNode.getParent();
	if (!$isRootOrShadowRoot(grandParentNode) || parentNode.getFirstChild() !== anchorNode) return false;
	const textContent = anchorNode.getTextContent();
	if (fromTrigger !== "enter" && textContent[anchorOffset - 1] !== " ") return false;
	for (const { regExp, trigger } of elementTransformers) {
		const match = textContent.match(regExp);
		if (fromTrigger === trigger && match && match[0].length === (fromTrigger === "enter" || match[0].endsWith(" ") ? anchorOffset : anchorOffset - 1)) return true;
	}
	return false;
}
function runElementTransformers(parentNode, anchorNode, anchorOffset, elementTransformers, fromTrigger) {
	const grandParentNode = parentNode.getParent();
	if (!$isRootOrShadowRoot(grandParentNode) || parentNode.getFirstChild() !== anchorNode) return false;
	const textContent = anchorNode.getTextContent();
	if (fromTrigger !== "enter" && textContent[anchorOffset - 1] !== " ") return false;
	for (const { regExp, replace, trigger } of elementTransformers) {
		const match = textContent.match(regExp);
		if (fromTrigger === trigger && match && match[0].length === (fromTrigger === "enter" || match[0].endsWith(" ") ? anchorOffset : anchorOffset - 1)) {
			const nextSiblings = anchorNode.getNextSiblings();
			const [leadingNode, remainderNode] = anchorNode.splitText(anchorOffset);
			if (replace(parentNode, remainderNode ? [remainderNode, ...nextSiblings] : nextSiblings, match, false) !== false) {
				leadingNode.remove();
				return true;
			}
		}
	}
	return false;
}
function runTextMatchTransformers(anchorNode, anchorOffset, transformersByTrigger) {
	let textContent = anchorNode.getTextContent();
	const transformers = transformersByTrigger[textContent[anchorOffset - 1]];
	if (!transformers) return false;
	if (anchorOffset < textContent.length) textContent = textContent.slice(0, anchorOffset);
	for (const transformer of transformers) {
		if (!transformer.replace || !transformer.regExp) continue;
		const match = textContent.match(transformer.regExp);
		if (match === null) continue;
		const startIndex = match.index || 0;
		const endIndex = startIndex + match[0].length;
		let replaceNode;
		if (startIndex === 0) [replaceNode] = anchorNode.splitText(endIndex);
		else [, replaceNode] = anchorNode.splitText(startIndex, endIndex);
		replaceNode.selectNext(0, 0);
		transformer.replace(replaceNode, match);
		return true;
	}
	return false;
}
function $runTextFormatTransformers(anchorNode, anchorOffset, textFormatTransformers) {
	const textContent = anchorNode.getTextContent();
	const closeTagEndIndex = anchorOffset - 1;
	const closeChar = textContent[closeTagEndIndex];
	const matchers = textFormatTransformers[closeChar];
	if (!matchers) return false;
	for (const matcher of matchers) {
		const { tag } = matcher;
		const tagLength = tag.length;
		const closeTagStartIndex = closeTagEndIndex - tagLength + 1;
		if (tagLength > 1 && !isEqualSubString(textContent, closeTagStartIndex, tag, 0, tagLength)) continue;
		if (textContent[closeTagStartIndex - 1] === " ") continue;
		const afterCloseTagChar = textContent[closeTagEndIndex + 1];
		if (matcher.intraword === false && afterCloseTagChar && !PUNCTUATION_OR_SPACE.test(afterCloseTagChar)) continue;
		const closeNode = anchorNode;
		let openNode = closeNode;
		let openTagStartIndex = getOpenTagStartIndex(textContent, closeTagStartIndex, tag);
		let sibling = openNode;
		while (openTagStartIndex < 0 && (sibling = sibling.getPreviousSibling())) {
			if ($isLineBreakNode(sibling)) break;
			if ($isTextNode(sibling)) {
				if (sibling.hasFormat("code")) continue;
				const siblingTextContent = sibling.getTextContent();
				openNode = sibling;
				openTagStartIndex = getOpenTagStartIndex(siblingTextContent, siblingTextContent.length, tag);
			}
		}
		if (openTagStartIndex < 0) continue;
		if (openNode === closeNode && openTagStartIndex + tagLength === closeTagStartIndex) continue;
		const prevOpenNodeText = openNode.getTextContent();
		if (openTagStartIndex > 0 && prevOpenNodeText[openTagStartIndex - 1] === closeChar) continue;
		const beforeOpenTagChar = prevOpenNodeText[openTagStartIndex - 1];
		if (matcher.intraword === false && beforeOpenTagChar && !PUNCTUATION_OR_SPACE.test(beforeOpenTagChar)) continue;
		const prevCloseNodeText = closeNode.getTextContent();
		const closeNodeText = prevCloseNodeText.slice(0, closeTagStartIndex) + prevCloseNodeText.slice(closeTagEndIndex + 1);
		closeNode.setTextContent(closeNodeText);
		const openNodeText = openNode === closeNode ? closeNodeText : prevOpenNodeText;
		openNode.setTextContent(openNodeText.slice(0, openTagStartIndex) + openNodeText.slice(openTagStartIndex + tagLength));
		const selection = $getSelection();
		const nextSelection = $createRangeSelection();
		$setSelection(nextSelection);
		const newOffset = closeTagEndIndex - tagLength * (openNode === closeNode ? 2 : 1) + 1;
		nextSelection.anchor.set(openNode.__key, openTagStartIndex, "text");
		nextSelection.focus.set(closeNode.__key, newOffset, "text");
		if (matcher.process) {
			if (matcher.process(nextSelection) === false) {
				const currentOpenNode = $getNodeByKey(openNode.__key);
				const currentCloseNode = $getNodeByKey(closeNode.__key);
				if ($isTextNode(currentOpenNode)) currentOpenNode.setTextContent(prevOpenNodeText);
				if (currentCloseNode !== currentOpenNode && $isTextNode(currentCloseNode)) currentCloseNode.setTextContent(prevCloseNodeText);
				$setSelection(anchorNode.selectEnd());
				continue;
			}
			return true;
		} else if (matcher.format) {
			for (const format of matcher.format) if (!nextSelection.hasFormat(format)) nextSelection.formatText(format);
			nextSelection.anchor.set(nextSelection.focus.key, nextSelection.focus.offset, nextSelection.focus.type);
			for (const format of matcher.format) if (nextSelection.hasFormat(format)) nextSelection.toggleFormat(format);
			if ($isRangeSelection(selection)) nextSelection.format = selection.format;
		} else {
			$setSelection(selection);
			continue;
		}
		return true;
	}
	return false;
}
const IMarkdownShortCutService = genServiceId("MarkdownShortCutService");
var MarkdownShortCutService = class {
	constructor(kernel) {
		this.kernel = kernel;
		this.elementTransformers = [];
		this.textFormatTransformers = [];
		this.textMatchTransformers = [];
		this.logger = createDebugLogger("service", "markdown");
		this._markdownWriters = {};
		this._markdownReaders = [
			{},
			{},
			{}
		];
		this._textFormatTransformersByTrigger = null;
		this._textMatchTransformersByTrigger = null;
	}
	get markdownWriters() {
		return this._markdownWriters;
	}
	get markdownReaders() {
		return this._markdownReaders.reduce((acc, curr) => {
			Object.keys(curr).forEach((key) => {
				if (!acc[key]) acc[key] = [];
				const existing = acc[key];
				const adding = curr[key];
				existing.push(...adding);
			});
			return acc;
		}, {});
	}
	get textMatchTransformersByTrigger() {
		if (!this._textMatchTransformersByTrigger) this._textMatchTransformersByTrigger = indexBy(this.textMatchTransformers, ({ trigger }) => trigger);
		return this._textMatchTransformersByTrigger;
	}
	get textFormatTransformersByTrigger() {
		if (!this._textFormatTransformersByTrigger) this._textFormatTransformersByTrigger = indexBy(this.textFormatTransformers, ({ tag }) => tag.at(-1));
		return this._textFormatTransformersByTrigger;
	}
	registerMarkdownShortCut(transformer) {
		switch (transformer.type) {
			case "element":
				this.elementTransformers.push(transformer);
				break;
			case "text-format":
				this.textFormatTransformers.push(transformer);
				break;
			case "text-match":
				this.textMatchTransformers.push(transformer);
				break;
			default: throw new Error(`Unknown transformer type: ${transformer}`);
		}
	}
	registerMarkdownShortCuts(transformers) {
		for (const transformer of transformers) this.registerMarkdownShortCut(transformer);
	}
	testTransformers(parentNode, anchorNode, anchorOffset, trigger) {
		if (testElementTransformers(parentNode, anchorNode, anchorOffset, this.elementTransformers, trigger)) return true;
		return false;
	}
	runTransformers(parentNode, anchorNode, anchorOffset, trigger) {
		if (runElementTransformers(parentNode, anchorNode, anchorOffset, this.elementTransformers, trigger)) return true;
		if (runTextMatchTransformers(anchorNode, anchorOffset, this.textMatchTransformersByTrigger)) return true;
		if ($runTextFormatTransformers(anchorNode, anchorOffset, this.textFormatTransformersByTrigger)) return true;
		return false;
	}
	registerMarkdownWriter(type, writer) {
		if (!this._markdownWriters[type]) {
			this._markdownWriters[type] = writer;
			return;
		}
		if (this.kernel?.isHotReloadMode()) {
			this.logger.warn(`🔄 Hot reload: markdown writer "${type}"`);
			this._markdownWriters[type] = writer;
			return;
		}
		throw new Error(`Markdown writer for type "${type}" is already registered.`);
	}
	registerMarkdownReader(type, reader, level = 2) {
		if (!this._markdownReaders[level][type]) this._markdownReaders[level][type] = [];
		if (this._markdownReaders[level]) this._markdownReaders[level][type]?.push(reader);
	}
	parseMarkdownToLexical(markdown) {
		return parseMarkdownToLexical(markdown, this.markdownReaders);
	}
	insertIRootNode(editor, root, selection) {
		insertIRootNode(editor, root, selection);
	}
};
//#endregion
//#region src/plugins/markdown/utils/detectLanguage.ts
const LANGUAGE_PATTERNS = {
	bash: {
		optional: [
			/\|\||&&/,
			/echo\s+/,
			/if\s+\[/
		],
		required: [/^#!\/bin\/(ba)?sh/, /\${?\w+}?/],
		weight: 7
	},
	csharp: {
		optional: [
			/\[.*]/,
			/async\s+Task/,
			/var\s+\w+\s*=/
		],
		required: [/(public|private|protected)\s+(class|interface|namespace)/, /using\s+\w+/],
		weight: 8
	},
	css: {
		optional: [/@media|@import|@keyframes/, /!important/],
		required: [/[#.]?[\w-]+\s*{/, /:\s*[\w#%-]+;/],
		weight: 8
	},
	dockerfile: {
		required: [/^FROM\s+/, /^(RUN|CMD|COPY|ADD|WORKDIR|ENV|EXPOSE)\s+/m],
		weight: 10
	},
	go: {
		optional: [
			/import\s+\(/,
			/:=/,
			/defer|goroutine/
		],
		required: [/package\s+\w+/, /func\s+\w+/],
		weight: 8
	},
	graphql: {
		optional: [/fragment\s+/, /on\s+\w+/],
		required: [/(query|mutation|subscription)\s+/, /{[\S\s]*}/],
		weight: 8
	},
	html: {
		optional: [/<\/\w+>/, /class=|id=/],
		required: [/<(html|head|body|div|span|p|a|img|script|style|link|meta)/i],
		weight: 9
	},
	ini: {
		exclude: [/^\s*</, /{.*}/],
		required: [/^\[.*]$/m, /\w+\s*=\s*/],
		weight: 6
	},
	java: {
		optional: [
			/@Override|@Autowired/,
			/extends|implements/,
			/System\.out/
		],
		required: [/(public|private|protected)\s+(class|interface|static)/, /\w+\s+\w+\s*\([^)]*\)\s*{/],
		weight: 8
	},
	javascript: {
		exclude: [
			/^\s*</,
			/interface\s+\w+/,
			/:\s*\w+\s*[;=]/
		],
		optional: [
			/=>\s*{/,
			/console\.(log|error|warn)/,
			/\.then\(/,
			/require\(/
		],
		required: [/(function|const|let|var|class|import|export|async|await)\s/],
		weight: 7
	},
	json: {
		optional: [/"[^"]*"\s*:/, /:\s*["'[{]/],
		required: [/^\s*[[{]/, /[\]}]\s*$/],
		weight: 10
	},
	jsx: {
		exclude: [/^\s*<!DOCTYPE/, /^\s*<html/],
		optional: [
			/className=/,
			/{.*}/,
			/import.*from/
		],
		required: [/<\w+[^>]*>/, /(const|function|class)\s+\w+/],
		weight: 8
	},
	makefile: {
		optional: [/\$\(.*\)/, /\.PHONY/],
		required: [/^[\w-]+:\s*/, /^\t/m],
		weight: 7
	},
	markdown: {
		optional: [
			/```/,
			/\*\*.*\*\*/,
			/^\s*[*+-]\s+/m
		],
		required: [/^#{1,6}\s+/, /\[.*]\(.*\)/],
		weight: 6
	},
	php: {
		optional: [
			/function\s+\w+/,
			/class\s+\w+/,
			/echo|print/
		],
		required: [/<\?php/, /\$\w+/],
		weight: 10
	},
	powershell: {
		optional: [
			/\|\s*Where/,
			/\|\s*Select/,
			/param\(/
		],
		required: [/\$\w+/, /(Get|Set|New|Remove)-\w+/],
		weight: 8
	},
	python: {
		optional: [
			/if __name__|print\(/,
			/self\.|lambda/,
			/@\w+\s*$/m
		],
		required: [/(def|class|import|from)\s+\w+/, /:\s*$/m],
		weight: 8
	},
	ruby: {
		optional: [
			/do\s*\|.*\|/,
			/puts|require/,
			/:\w+\s*=>/
		],
		required: [/(def|class|module|end)\s/, /@\w+/],
		weight: 7
	},
	rust: {
		optional: [
			/::\w+/,
			/&mut|&str/,
			/#\[derive\(/
		],
		required: [/(fn|struct|impl|trait|use)\s+/, /let\s+(mut\s+)?\w+/],
		weight: 8
	},
	scss: {
		optional: [/@mixin|@include|@extend/, /#{.*}/],
		required: [/\$[\w-]+\s*:/, /[&@]\w+/],
		weight: 8
	},
	sql: {
		optional: [/from|where|join|group by|order by/i, /\*/],
		required: [/(select|insert|update|delete|create|alter|drop)\s+/i],
		weight: 9
	},
	toml: {
		optional: [/\[\[.*]]/, /"""[\S\s]*"""/],
		required: [/^\[.*]$/m, /\w+\s*=\s*[\w"']/],
		weight: 8
	},
	tsx: {
		optional: [
			/:\s*React\./,
			/:\s*FC</,
			/useState|useEffect/
		],
		required: [/<\w+[^>]*>/, /interface|type\s+\w+/],
		weight: 9
	},
	typescript: {
		optional: [
			/<\w+>/,
			/as\s+\w+/,
			/implements|extends/
		],
		required: [/(interface|type|enum)\s+\w+/, /:\s*\w+(\[]|<.+>)?\s*[);=]/],
		weight: 8
	},
	xml: {
		optional: [/<\/\w+>/, /xmlns/],
		required: [/<\?xml|<\w+[^>]*>/],
		weight: 9
	},
	yaml: {
		exclude: [/^\s*[[\]{]/],
		required: [/^[\s-]*\w+:\s*/, /^[\s-]*-\s+/m],
		weight: 8
	}
};
/**
* Detect the programming language of a code snippet
* @param code - The code snippet to analyze
* @returns Language detection result with confidence score
*/
function detectLanguage(code) {
	if (!code || code.trim().length === 0) return null;
	const trimmed = code.trim();
	const scores = {};
	for (const [language, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
		let score = 0;
		const baseWeight = pattern.weight || 5;
		if (pattern.exclude) {
			if (pattern.exclude.some((regex) => regex.test(trimmed))) continue;
		}
		if (pattern.required) {
			if (!pattern.required.every((regex) => regex.test(trimmed))) continue;
			score += baseWeight * 2;
		}
		if (pattern.optional) {
			const matchedOptional = pattern.optional.filter((regex) => regex.test(trimmed)).length;
			score += matchedOptional * baseWeight;
		}
		if (score > 0) scores[language] = score;
	}
	const entries = Object.entries(scores);
	if (entries.length === 0) return null;
	entries.sort((a, b) => b[1] - a[1]);
	const [topLanguage, topScore] = entries[0];
	const maxPossibleScore = (LANGUAGE_PATTERNS[topLanguage].weight || 5) * 5;
	const confidence = Math.min(100, Math.round(topScore / maxPossibleScore * 100));
	if (confidence < 30) return null;
	return {
		confidence,
		language: topLanguage
	};
}
/**
* Simple detection for common formats with high confidence
* Falls back to detectLanguage for more complex detection
*/
function detectCodeLanguage(code) {
	const trimmed = code.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith("[") && trimmed.endsWith("]")) try {
		JSON.parse(trimmed);
		return "json";
	} catch {}
	if (/^\s*(select|insert|update|delete|create|alter|drop)\s+/i.test(code)) return "sql";
	if (/^<\?xml/i.test(code)) return "xml";
	if (/^FROM\s+|^RUN\s+|^CMD\s+/m.test(code)) return "dockerfile";
	if (/<\?php/.test(code)) return "php";
	const result = detectLanguage(code);
	return result && result.confidence > 50 ? result.language : null;
}
//#endregion
//#region src/plugins/markdown/plugin/index.ts
const DEFAULT_PASTE_MARKDOWN_AUTO_CONVERT_THRESHOLD = 5;
const RICH_HTML_SELECTOR = "strong,em,b,i,h1,h2,h3,h4,h5,h6,ul,ol,table,img,blockquote,pre>code,a[href]";
const normalizeMarkdownForClipboard = (markdown) => markdown.replace(/\r?\n$/, "");
const MARKDOWN_DETECTION_RULES = [
	{
		name: "headers",
		score: 5,
		test: (text) => /^#{1,6}\s+\S/m.test(text)
	},
	{
		name: "code-fence-start",
		score: 5,
		test: (text) => /^```[\w-]*$/m.test(text)
	},
	{
		name: "links",
		score: 4,
		test: (text) => /\[[^\]]+]\([^)]+\)/.test(text)
	},
	{
		name: "images",
		score: 5,
		test: (text) => /!\[[^\]]*]\([^)]+\)/.test(text)
	},
	{
		name: "tables",
		score: 5,
		test: (text) => /^\|.+\|$/m.test(text) && /^\|[\s:|-]+\|$/m.test(text)
	},
	{
		name: "admonitions",
		score: 5,
		test: (text) => /^>\s*\[!(?:note|tip|warning|caution|important)]/im.test(text)
	},
	{
		name: "task-lists",
		score: 4,
		test: (text) => /^[*-]\s+\[[ x]]/m.test(text)
	},
	{
		name: "bold",
		score: 2,
		test: (text) => /\*\*.+?\*\*/.test(text)
	},
	{
		name: "italic",
		score: 1,
		test: (text) => /(?<!\*)\*(?!\*)(?!\s).+?(?<!\s)(?<!\*)\*(?!\*)/.test(text)
	},
	{
		name: "unordered-lists",
		score: 1,
		test: (text) => /^[*+-]\s+\S/m.test(text)
	},
	{
		name: "ordered-lists",
		score: 1,
		test: (text) => /^\d+\.\s+\S/m.test(text)
	},
	{
		name: "blockquotes",
		score: 1,
		test: (text) => /^>\s+\S/m.test(text)
	},
	{
		name: "inline-code",
		score: 1,
		test: (text) => /`.+?`/.test(text)
	},
	{
		name: "horizontal-rules",
		score: 2,
		test: (text) => /^[*_-]{3,}$/m.test(text)
	},
	{
		name: "multi-paragraph",
		score: 5,
		test: (text) => text.split(/\n{2,}/).filter(Boolean).length >= 2
	},
	{
		name: "short-text-penalty",
		score: -3,
		test: (text) => text.length < 20
	},
	{
		name: "single-line-penalty",
		score: -2,
		test: (text) => !text.includes("\n")
	}
];
const MarkdownPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "MarkdownPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		this.logger = createDebugLogger("plugin", "markdown");
		this.service = new MarkdownShortCutService(kernel);
		kernel.registerService(IMarkdownShortCutService, this.service);
		this.markdownDataSource = new MarkdownDataSource("markdown", this.service, (serviceId) => {
			return kernel.requireService(serviceId);
		});
		kernel.registerDataSource(this.markdownDataSource);
	}
	onInit(editor) {
		this.register(editor.registerUpdateListener(({ tags, dirtyLeaves, editorState, prevEditorState }) => {
			if (tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) return;
			if (editor.isComposing()) return;
			const selection = editorState.read($getSelection);
			const prevSelection = prevEditorState.read($getSelection);
			if (!$isRangeSelection(prevSelection) || !$isRangeSelection(selection) || !selection.isCollapsed() || selection.is(prevSelection)) return;
			const anchorKey = selection.anchor.key;
			const anchorOffset = selection.anchor.offset;
			const anchorNode = editorState._nodeMap.get(anchorKey);
			if (!$isTextNode(anchorNode) || !dirtyLeaves.has(anchorKey) || anchorOffset !== 1 && anchorOffset > prevSelection.anchor.offset + 1) return;
			editor.update(() => {
				if (!canContainTransformableMarkdown(anchorNode)) return;
				const parentNode = anchorNode.getParent();
				if (parentNode === null || $isCodeNode(parentNode)) return;
				this.service.runTransformers(parentNode, anchorNode, selection.anchor.offset);
			});
		}));
		this.register(editor.registerCommand(KEY_ENTER_COMMAND, (payload) => {
			const ret = editor.getEditorState().read(() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
				const anchorKey = selection.anchor.key;
				const anchorNode = $getNodeByKey(anchorKey);
				if (!anchorNode) return false;
				return {
					anchorNode,
					offset: selection.anchor.offset
				};
			});
			if (!ret) return false;
			const { anchorNode, offset } = ret;
			if (!canContainTransformableMarkdown(anchorNode)) return false;
			const parentNode = anchorNode.getParent();
			if (parentNode === null || $isCodeNode(parentNode)) return false;
			if (this.service.testTransformers(parentNode, anchorNode, offset, "enter")) {
				queueMicrotask(() => {
					editor.update(() => {
						this.service.runTransformers(parentNode, anchorNode, offset, "enter");
					});
				});
				payload?.stopPropagation();
				payload?.stopImmediatePropagation();
				payload?.preventDefault();
				return true;
			}
			return false;
		}, COMMAND_PRIORITY_CRITICAL));
		this.register(editor.registerCommand(PASTE_COMMAND, (event) => {
			if (!(event instanceof ClipboardEvent)) return false;
			if (!this.shouldHandlePasteMarkdown()) return false;
			const clipboardData = event.clipboardData;
			if (!clipboardData) return false;
			const text = clipboardData.getData("text/plain").trimEnd().replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "");
			const html = clipboardData.getData("text/html").trimEnd();
			if (!text) return false;
			this.logger.debug("paste content analysis:", {
				clipboardTypes: Array.from(clipboardData.types || []),
				hasHTML: !!(html && html.trim()),
				htmlLength: html?.length || 0,
				textLength: text.length
			});
			if (this.hasRichHTML(clipboardData)) {
				this.logger.debug("rich HTML detected, skipping markdown auto-convert");
				return false;
			}
			const detectionResult = this.getMarkdownDetectionResult(text);
			if (detectionResult.shouldAutoConvert) {
				this.logger.debug("markdown auto-convert detected:", detectionResult);
				const historyState = this.kernel.getHistoryState().current;
				setTimeout(() => {
					editor.dispatchCommand(INSERT_MARKDOWN_COMMAND, {
						historyState,
						markdown: text
					});
					this.kernel.emit("markdownParse", {
						cacheState: editor.getEditorState(),
						historyState,
						markdown: text,
						matchedPatterns: detectionResult.matchedPatterns,
						score: detectionResult.score
					});
				}, 10);
			} else this.logger.debug("markdown score below auto-convert threshold, keeping as plain text:", detectionResult);
			return false;
		}, COMMAND_PRIORITY_CRITICAL));
		this.register(registerMarkdownCommand(editor, this.kernel, this.service));
		this.register(editor.registerCommand(COPY_COMMAND, (event) => {
			if (!(event instanceof ClipboardEvent)) return false;
			const clipboardData = event.clipboardData;
			if (!clipboardData) return false;
			const selection = $getSelection();
			if (!selection || selection.isCollapsed()) return false;
			const rawMarkdown = this.markdownDataSource.write(editor, { selection: true });
			if (!rawMarkdown) return false;
			const markdown = normalizeMarkdownForClipboard(rawMarkdown);
			event.preventDefault();
			const data = $getClipboardDataFromSelection(selection);
			setLexicalClipboardDataTransfer(clipboardData, data);
			clipboardData.setData("text/plain", markdown);
			clipboardData.setData("text/markdown", markdown);
			this.logger.debug("copy with text/markdown:", { markdownLength: markdown.length });
			return true;
		}, COMMAND_PRIORITY_LOW));
	}
	/**
	* Detect if content is code and should be inserted as code block
	* Uses advanced language detection with pattern matching
	* Excludes markdown because markdown content is handled by the paste auto-convert flow
	*/
	detectCodeContent(text) {
		const detected = detectLanguage(text);
		if (detected && detected.confidence > 50) {
			if (detected.language === "markdown") return null;
			this.logger.debug("language detected:", detected);
			return detected;
		}
		const fastDetected = detectCodeLanguage(text);
		if (fastDetected) {
			if (fastDetected === "markdown") return null;
			return {
				confidence: 80,
				language: fastDetected
			};
		}
		return null;
	}
	hasRichHTML(clipboardData) {
		const html = clipboardData.getData("text/html");
		if (!html) return false;
		if (/data-vscode|vscode-/i.test(html)) return false;
		if (typeof DOMParser === "undefined") return false;
		return new DOMParser().parseFromString(html, "text/html").body.querySelectorAll(RICH_HTML_SELECTOR).length > 0;
	}
	/**
	* Analyze pasted text and determine whether it should auto convert to markdown
	*/
	getMarkdownDetectionResult(text) {
		if (this.detectCodeContent(text)) return {
			matchedPatterns: [],
			score: 0,
			shouldAutoConvert: false
		};
		const matchedPatterns = [];
		let score = 0;
		const threshold = this.getPasteMarkdownAutoConvertThreshold();
		for (const rule of MARKDOWN_DETECTION_RULES) {
			if (!rule.test(text)) continue;
			matchedPatterns.push(rule.name);
			score += rule.score;
		}
		return {
			matchedPatterns,
			score,
			shouldAutoConvert: score >= threshold
		};
	}
	getPasteMarkdownAutoConvertThreshold() {
		const threshold = this.config?.pasteMarkdownAutoConvertThreshold;
		if (typeof threshold !== "number" || Number.isNaN(threshold)) return DEFAULT_PASTE_MARKDOWN_AUTO_CONVERT_THRESHOLD;
		return Math.max(1, threshold);
	}
	shouldHandlePasteMarkdown() {
		if (this.config?.enablePasteMarkdown === false) return false;
		return this.config?.autoFormatMarkdown !== false;
	}
};
//#endregion
//#region src/plugins/litexml/plugin/index.ts
/**
* LitexmlPlugin - A plugin that provides XML-based data source support
* Allows converting between Lexical editor state and XML format
*/
const LitexmlPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "LitexmlPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		kernel.registerThemes({
			diffNode: config?.theme || "editor_diffNode",
			tableRowDiff: config?.tableRowDiffTheme || "editor_tableRowDiff",
			tableCellDiff: config?.tableCellDiffTheme || "editor_tableCellDiff"
		});
		const litexmlService = new LitexmlService();
		this.service = litexmlService;
		kernel.registerService(ILitexmlService, litexmlService);
		this.datasource = new LitexmlDataSource("litexml", (serviceId) => {
			return kernel.requireService(serviceId);
		}, litexmlService);
		kernel.registerNodes([
			DiffNode,
			DiffContentNode,
			TableRowDiffNode,
			TableCellDiffNode
		]);
		kernel.registerDecorator(DiffNode.getType(), {
			queryDOM: (el) => el.querySelector(".toolbar"),
			render: (node, editor) => {
				return config?.decorator ? config.decorator(node, editor) : null;
			}
		});
		if (config?.enabled !== false) kernel.registerDataSource(this.datasource);
	}
	onInit(editor) {
		this.register(registerNodeIdentityPolicy(editor, liteXmlIdentityPolicy));
		this.register(registerLiteXMLCommand(editor, this.datasource));
		this.register(registerLiteXMLDiffCommand(editor));
		this.register(registerLegacyTableCellDiffNormalization(editor));
		this.register(registerTableRowDiffNormalization(editor));
		this.register(editor.registerNodeTransform(DiffNode, (node) => {
			if (node.diffType === "modify" && node.getChildrenSize() === 1) node.setDiffType("remove");
		}));
		this.register(editor.registerUpdateListener(({ editorState, prevEditorState, tags }) => {
			if (editorState === prevEditorState) return;
			if (tags.has(HISTORIC_TAG)) return;
			let shouldNormalize = false;
			editorState.read(() => {
				shouldNormalize = $nodesOfType(DiffNode).some((node) => node.diffType === "modify" && node.getChildrenSize() === 1);
			});
			if (!shouldNormalize) return;
			editor.update(() => {
				const diffNodes = $nodesOfType(DiffNode);
				for (const node of diffNodes) if (node.diffType === "modify" && node.getChildrenSize() === 1) node.setDiffType("remove");
			});
		}));
		this.registerLiteXml();
		this.registerMarkdown();
	}
	registerLiteXml() {
		this.service.registerXMLWriter(DiffNode.getType(), (node, ctx, indent, nodeToXML) => {
			const diffNode = node;
			const lines = [];
			switch (diffNode.diffType) {
				case "modify": {
					const after = diffNode.getChildAtIndex(1);
					if ($isDiffContentNode(after)) after.getChildren().forEach((child) => nodeToXML(child, lines, indent));
					else nodeToXML(after, lines, indent);
					break;
				}
				case "listItemAdd":
				case "add":
					diffNode.getChildren().forEach((child) => nodeToXML(child, lines, indent));
					break;
				case "remove": break;
				case "listItemRemove": break;
				case "listItemModify": diffNode.getChildAtIndex(1).getChildren().forEach((child) => {
					nodeToXML(child, lines, indent);
				});
			}
			return { lines };
		});
		this.service.registerXMLWriter(TableRowDiffNode.getType(), (node, ctx) => {
			if (!$isTableRowDiffNode(node)) return false;
			if (node.getDiffType() === "remove") return { lines: [] };
			return ctx.createXmlNode("tr", {});
		});
		this.service.registerXMLWriter(TableCellDiffNode.getType(), (node, ctx) => {
			if (!$isTableCellDiffNode(node)) return false;
			if (node.getDiffType() === "remove") return { lines: [] };
			const attributes = {};
			if (node.getColSpan() > 1) attributes.colSpan = String(node.getColSpan());
			if (node.getRowSpan() > 1) attributes.rowSpan = String(node.getRowSpan());
			if (node.getBackgroundColor()) attributes.backgroundColor = node.getBackgroundColor();
			return ctx.createXmlNode("td", attributes);
		});
	}
	registerMarkdown() {
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		markdownService?.registerMarkdownWriter(TableCellDiffNode.getType(), (ctx, node) => {
			if (!$isTableCellDiffNode(node)) return false;
			if (node.getDiffType() === "remove") return true;
			if (!node.getNextSibling()) ctx.wrap("|", "|");
			else ctx.wrap("|", "");
			return true;
		});
		markdownService?.registerMarkdownWriter(TableRowDiffNode.getType(), (ctx, node) => {
			if (!$isTableRowDiffNode(node)) return false;
			if (node.getDiffType() === "remove") return true;
			const parent = node.getParent();
			if (!$isTableNode(parent)) return true;
			if (node.getPreviousSiblings().some((sibling) => !$isTableRowDiffNode(sibling) || sibling.getDiffType() !== "remove")) ctx.wrap("", "\n");
			else ctx.wrap("", `\n${parent.getColWidths()?.map(() => "|:--").join("")}|\n`);
		});
		markdownService?.registerMarkdownWriter(DiffNode.getType(), (ctx, node) => {
			const diffNode = node;
			switch (diffNode.diffType) {
				case "modify": {
					const after = diffNode.getChildAtIndex(1);
					if ($isDiffContentNode(after)) after.getChildren().forEach((child) => ctx.processChild(ctx, child));
					else ctx.processChild(ctx, after);
					break;
				}
				case "listItemAdd":
				case "add":
					diffNode.getChildren().forEach((child) => ctx.processChild(ctx, child));
					break;
				case "remove": break;
				case "listItemRemove": break;
				case "listItemModify": diffNode.getChildAtIndex(1).getChildren().forEach((child) => {
					ctx.processChild(ctx, child);
				});
			}
			return true;
		});
	}
};
//#endregion
//#region src/plugins/common/data-source/json-data-source.ts
var JSONDataSource = class extends DataSource {
	read(editor, data, options = {}) {
		let inputData;
		if (typeof data === "string") inputData = JSON.parse(data);
		else inputData = data;
		const dataObj = structuredClone(inputData);
		if (!(options.keepId ?? dataObj.keepId ?? false)) {
			const stripNodeIds = (node) => {
				delete node.id;
				const state = node.$;
				if (state && typeof state === "object" && state.properties) {
					const properties = { ...state.properties };
					delete properties.nodeId;
					if (Object.keys(properties).length > 0) node.$ = {
						...state,
						properties
					};
					else {
						const nextState = { ...state };
						delete nextState.properties;
						if (Object.keys(nextState).length > 0) node.$ = nextState;
						else delete node.$;
					}
				}
				if (Array.isArray(node.children)) node.children.forEach((child) => stripNodeIds(child));
			};
			stripNodeIds(dataObj.root);
		} else migrateSerializedNodeIds(dataObj.root);
		const process = (node) => {
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				if ("children" in child && Array.isArray(child.children)) process(child);
				if (child.type === "text" && "format" in child && typeof child.format === "number" && (child.format & IS_CODE) > 0) {
					node.children[i] = {
						children: [{
							...child,
							format: child.format & ~IS_CODE
						}],
						direction: "ltr",
						format: "",
						indent: 0,
						type: "codeInline",
						version: 1
					};
					node.children.splice(i + 1, 0, cursorNodeSerialized);
				}
			}
		};
		process(dataObj.root);
		const editorState = editor.parseEditorState({ root: dataObj.root }, () => {
			$normalizeNodeIds($getRoot());
		});
		editor.setEditorState(editorState);
	}
	write(editor, options) {
		if (options?.selection) return editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!selection) return null;
			if ($isRangeSelection(selection)) {
				const selectedNodes = selection.getNodes();
				const lastIndex = selectedNodes.length - 1;
				const anchor = selection.anchor;
				const focus = selection.focus;
				const isBefore = anchor.isBefore(focus);
				const firstNode = selectedNodes[0];
				const lastNode = selectedNodes[lastIndex];
				const [anchorOffset, focusOffset] = $getCharacterOffsets(selection);
				const lastElement = [];
				const rootNodes = [];
				for (let i = 0; i < selectedNodes.length; i++) {
					const node = selectedNodes[i];
					if ($isElementNode(node)) {
						const sNode = {
							...node.exportJSON(),
							$key: node.getKey()
						};
						for (let i = 0; i < rootNodes.length; i++) {
							const child = rootNodes[i];
							const childNode = $getNodeByKey(child.$key);
							if (node.isParentOf(childNode)) {
								sNode.children.push(child);
								rootNodes.splice(i, 1);
								i--;
							}
						}
						let hasPush = false;
						for (let i = lastElement.length - 1; i >= 0; i--) if ($getNodeByKey(lastElement[i].$key)?.isParentOf(node)) {
							lastElement[i].children.push(sNode);
							hasPush = true;
							break;
						} else lastElement.pop();
						if (!hasPush) rootNodes.push(sNode);
						lastElement.push(sNode);
					} else if ($isTextNode(node)) {
						const sNode = {
							...node.exportJSON(),
							$key: node.getKey()
						};
						if (node === firstNode) {
							if (node === lastNode) {
								if (anchor.type !== "element" || focus.type !== "element" || focus.offset === anchor.offset) sNode.text = anchorOffset < focusOffset ? sNode.text.slice(anchorOffset, focusOffset) : sNode.text.slice(focusOffset, anchorOffset);
							} else sNode.text = isBefore ? sNode.text.slice(anchorOffset) : sNode.text.slice(focusOffset);
						} else if (node === lastNode) sNode.text = isBefore ? sNode.text.slice(0, focusOffset) : sNode.text.slice(0, anchorOffset);
						let hasPush = false;
						for (let i = lastElement.length - 1; i >= 0; i--) if ($getNodeByKey(lastElement[i].$key)?.isParentOf(node)) {
							lastElement[i].children.push(sNode);
							hasPush = true;
							break;
						} else lastElement.pop();
						if (!hasPush) rootNodes.push(sNode);
					} else {
						const sNode = {
							...node.exportJSON(),
							$key: node.getKey()
						};
						let hasPush = false;
						for (let i = lastElement.length - 1; i >= 0; i--) if ($getNodeByKey(lastElement[i].$key)?.isParentOf(node)) {
							lastElement[i].children.push(sNode);
							hasPush = true;
							break;
						} else lastElement.pop();
						if (!hasPush) rootNodes.push(sNode);
					}
				}
				return rootNodes;
			} else if ($isTableSelection(selection)) {}
			return selection.getNodes().map((node) => exportNodeToJSON$1(node));
		});
		return editor.read(() => ({ root: exportNodeToJSON$1($getRoot()) }));
	}
};
//#endregion
//#region src/plugins/common/data-source/text-data-source.ts
var TextDataSource = class extends DataSource {
	read(editor, data) {
		if (typeof data !== "string") throw new Error("Invalid data type " + typeof data);
		const lines = data.split(/\n/g);
		const rootNode = INodeHelper.createRootNode();
		lines.forEach((line) => {
			const paragraph = INodeHelper.createParagraph();
			if (line) {
				const textNode = INodeHelper.createTextNode(line);
				INodeHelper.appendChild(paragraph, textNode);
			}
			INodeHelper.appendChild(rootNode, paragraph);
		});
		const editorState = editor.parseEditorState({ root: rootNode }, () => {
			$normalizeNodeIds($getRoot());
		});
		editor.setEditorState(editorState);
	}
	write(editor, options) {
		if (options?.selection) return editor.getEditorState().read(() => {
			const selection = $getSelection();
			return selection ? selection.getTextContent().replaceAll("﻿", "") : null;
		});
		return editor.getEditorState().read(() => {
			return $getRoot().getTextContent().replaceAll("﻿", "");
		});
	}
};
//#endregion
//#region src/plugins/common/node/ElementDOMSlot.ts
function getElement(node) {
	if (node.nodeType === Node.ELEMENT_NODE) return node;
	return node.parentElement;
}
function registerBreakLineClick(editor) {
	return mergeRegister(editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
		if (CAN_USE_DOM) {
			const sel = document.getSelection();
			if (sel?.anchorNode) {
				const node = getElement(sel.anchorNode);
				if (node?.hasAttribute("data-lexical-linebreak") && node.parentElement) {
					const p = node.parentElement;
					editor.update(() => {
						const elem = $getNodeFromDOMNode(p, editor);
						if (elem) elem.selectEnd();
					});
					return true;
				}
			}
		}
		return false;
	}, COMMAND_PRIORITY_HIGH));
}
//#endregion
//#region src/plugins/common/plugin/mdReader.ts
function registerMDReader(markdownService) {
	markdownService.registerMarkdownReader("blockquote", (node, children) => {
		return INodeHelper.createElementNode("quote", {
			children,
			direction: "ltr",
			format: "",
			indent: 0,
			version: 1
		});
	});
	markdownService.registerMarkdownReader("strong", (node, children) => {
		return children.map((child) => {
			if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | IS_BOLD;
			return child;
		});
	});
	markdownService.registerMarkdownReader("emphasis", (node, children) => {
		return children.map((child) => {
			if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | IS_ITALIC;
			return child;
		});
	});
	markdownService.registerMarkdownReader("delete", (node, children) => {
		return children.map((child) => {
			if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | IS_STRIKETHROUGH;
			return child;
		});
	});
	markdownService.registerMarkdownReader("subscript", (node, children) => {
		return children.map((child) => {
			if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | IS_SUBSCRIPT;
			return child;
		});
	});
	markdownService.registerMarkdownReader("superscript", (node, children) => {
		return children.map((child) => {
			if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | IS_SUPERSCRIPT;
			return child;
		});
	});
	markdownService.registerMarkdownReader("html", (node, children) => {
		if (["<ins>", "<u>"].includes(node.value.toLocaleLowerCase())) return children.map((child) => {
			if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | IS_UNDERLINE;
			return child;
		});
		else if (["<em>"].includes(node.value.toLocaleLowerCase())) return children.map((child) => {
			if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | IS_ITALIC;
			return child;
		});
		else if (["<strong>"].includes(node.value.toLocaleLowerCase())) return children.map((child) => {
			if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | IS_BOLD;
			return child;
		});
		return false;
	});
}
//#endregion
//#region src/plugins/codemirror-block/node/CodeMirrorNode.ts
const LANGUAGE_DATA_ATTRIBUTE = "data-language";
const THEME_DATA_ATTRIBUTE = "data-theme";
const DEFAULT_OPTIONS = {
	indentWithTabs: false,
	lineNumbers: false,
	tabSize: 2
};
const extractSerializedCodeText$1 = (children) => children.map((child) => {
	if (!child || typeof child !== "object") return "";
	const record = child;
	if (record.type === "linebreak") return "\n";
	if (record.type === "tab") return "	";
	if (typeof record.text === "string") return record.text;
	if (Array.isArray(record.children)) return extractSerializedCodeText$1(record.children);
	return "";
}).join("");
function hasChildDOMNodeTag(node, tagName) {
	for (const child of node.childNodes) {
		if (isHTMLElement(child) && child.tagName === tagName) return true;
		hasChildDOMNodeTag(child, tagName);
	}
	return false;
}
function isGitHubCodeTable(table) {
	return table.classList.contains("js-file-line-container");
}
function isGitHubCodeCell(cell) {
	return cell.classList.contains("js-file-line");
}
var CodeMirrorNode = class CodeMirrorNode extends DecoratorNode {
	static getType() {
		return "code";
	}
	static clone(node) {
		return new CodeMirrorNode(node.__lang, node.__code, node.__codeTheme, node.__options, node.__key);
	}
	static importJSON(serializedNode) {
		let code = serializedNode.code;
		if ("children" in serializedNode && Array.isArray(serializedNode.children)) code = extractSerializedCodeText$1(serializedNode.children);
		return $createCodeMirrorNode(serializedNode.language, code, serializedNode.codeTheme, serializedNode.options).updateFromJSON(serializedNode);
	}
	static importDOM() {
		return {
			code: (node) => {
				return node.textContent !== null && (/\r?\n/.test(node.textContent) || hasChildDOMNodeTag(node, "BR")) ? {
					conversion: $convertPreElement,
					priority: 1
				} : null;
			},
			div: () => ({
				conversion: $convertDivElement,
				priority: 1
			}),
			pre: () => ({
				conversion: $convertPreElement,
				priority: 0
			}),
			table: (node) => {
				if (isGitHubCodeTable(node)) return {
					conversion: $convertTableElement,
					priority: 3
				};
				return null;
			},
			td: (node) => {
				const td = node;
				const table = td.closest("table");
				if (isGitHubCodeCell(td) || table && isGitHubCodeTable(table)) return {
					conversion: convertCodeNoop,
					priority: 3
				};
				return null;
			},
			tr: (node) => {
				const table = node.closest("table");
				if (table && isGitHubCodeTable(table)) return {
					conversion: convertCodeNoop,
					priority: 3
				};
				return null;
			}
		};
	}
	constructor(lang, code, codeTheme, options, key) {
		super(key);
		this.__lang = lang;
		this.__code = code;
		this.__codeTheme = codeTheme;
		this.__options = options;
	}
	get lang() {
		return this.__lang;
	}
	get code() {
		return this.__code;
	}
	get codeTheme() {
		return this.__codeTheme;
	}
	get options() {
		return this.__options;
	}
	exportDOM(editor) {
		const element = document.createElement("pre");
		addClassNamesToElement(element, editor._config.theme.code);
		element.setAttribute("spellcheck", "false");
		const language = this.__lang;
		if (language) element.setAttribute(LANGUAGE_DATA_ATTRIBUTE, language);
		const theme = this.__codeTheme;
		if (theme) element.setAttribute(THEME_DATA_ATTRIBUTE, theme);
		element.textContent = this.__code;
		return { element };
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			code: this.code,
			codeTheme: this.codeTheme,
			language: this.lang,
			options: this.options
		};
	}
	setLang(lang) {
		const writer = this.getWritable();
		writer.__lang = lang;
		return this;
	}
	setCode(code) {
		const writer = this.getWritable();
		writer.__code = code;
		return this;
	}
	setCodeTheme(codeTheme) {
		const writer = this.getWritable();
		writer.__codeTheme = codeTheme;
		return this;
	}
	setTabSize(tabSize) {
		const writer = this.getWritable();
		writer.__options.tabSize = tabSize;
		return this;
	}
	setIndentWithTabs(indentWithTabs) {
		const writer = this.getWritable();
		writer.__options.indentWithTabs = indentWithTabs;
		return this;
	}
	setLineNumbers(lineNumbers) {
		const writer = this.getWritable();
		writer.__options.lineNumbers = lineNumbers;
		return this;
	}
	createDOM(config) {
		const element = document.createElement("div");
		addClassNamesToElement(element, config.theme.hr);
		return element;
	}
	getTextContent() {
		return "\n";
	}
	isInline() {
		return false;
	}
	updateDOM() {
		return false;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator("codemirror");
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		else return decorator.render(this, editor);
	}
};
function $createCodeMirrorNode(lang, code = "", codeTheme = "default", options = DEFAULT_OPTIONS) {
	return $applyNodeReplacement(new CodeMirrorNode(lang, code, codeTheme, options));
}
function isCodeElement(div) {
	return div.style.fontFamily.match("monospace") !== null;
}
function isCodeChildElement(node) {
	let parent = node.parentElement;
	while (parent !== null) {
		if (isCodeElement(parent)) return true;
		parent = parent.parentElement;
	}
	return false;
}
function $convertDivElement(domNode) {
	const div = domNode;
	const isCode = isCodeElement(div);
	if (!isCode && !isCodeChildElement(div)) return { node: null };
	return { node: isCode ? $createCodeMirrorNode("plain", domNode.textContent || "", "") : null };
}
function $convertTableElement() {
	return { node: $createCodeMirrorNode("plain", "", "") };
}
function $convertPreElement(domNode) {
	const language = domNode.getAttribute(LANGUAGE_DATA_ATTRIBUTE);
	const codeTheme = domNode.getAttribute(THEME_DATA_ATTRIBUTE) || "";
	return { node: $createCodeMirrorNode(language || "plain", domNode.textContent || "", codeTheme) };
}
function $isCodeMirrorNode(node) {
	return node.getType() === CodeMirrorNode.getType();
}
function convertCodeNoop() {
	return { node: null };
}
//#endregion
//#region src/plugins/common/plugin/paste-handler.ts
/**
* Check if it's a file paste - skip plain text handling to let file uploads work normally
*/
const handleFilePaste = ({ clipboardData }) => {
	const items = clipboardData.items;
	for (const item of items) if (item.kind === "file") return "skip";
	return "next";
};
/**
* Handle VS Code paste - create code block with language from vscode-editor-data
*/
const handleVSCodePaste = ({ clipboardData, config, editor, event }) => {
	if (!config.pasteVSCodeAsCodeBlock) return "next";
	const vscodeDataStr = clipboardData.getData("vscode-editor-data");
	if (!vscodeDataStr) return "next";
	try {
		const vscodeData = JSON.parse(vscodeDataStr);
		const language = vscodeData.mode || vscodeData.language || "plaintext";
		const text = clipboardData.getData("text/plain");
		if (!text) return "next";
		event.preventDefault();
		editor.update(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return;
			const codeNode = $createCodeMirrorNode(language, text);
			$insertNodes([codeNode]);
			const nodeSelection = $createNodeSelection();
			nodeSelection.add(codeNode.getKey());
			$setSelection(nodeSelection);
		});
		return "handled";
	} catch {
		return "next";
	}
};
/**
* Handle plain text paste - fallback handler that pastes as plain text
*/
const handlePlainTextPaste = ({ clipboardData, editor, event }) => {
	const text = clipboardData.getData("text/plain");
	if (!text) return "skip";
	event.preventDefault();
	editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, text);
	return "handled";
};
/**
* Run paste handlers in sequence (middleware chain pattern)
* @returns true if event was handled, false to let default behavior continue
*/
function runPasteHandlers(ctx, handlers) {
	for (const handler of handlers) {
		const result = handler(ctx);
		if (result === "handled") return true;
		if (result === "skip") return false;
	}
	return false;
}
//#endregion
//#region src/plugins/common/plugin/progressive-select-all.ts
const COLLAPSIBLE_NODE_TYPE = "collapsible";
function registerProgressiveSelectAll(editor) {
	return editor.registerCommand(SELECT_ALL_COMMAND, () => {
		const selection = $getSelection();
		if ($isTableSelection(selection)) return $expandTableSelection(selection);
		if (!$isRangeSelection(selection)) return false;
		const anchorCell = $findNearestNode(selection.anchor.getNode(), $isTableCellNode);
		const focusCell = $findNearestNode(selection.focus.getNode(), $isTableCellNode);
		if (anchorCell && focusCell && anchorCell.is(focusCell)) {
			const table = $findNearestNode(anchorCell, $isTableNode);
			if (table) {
				const tableSelection = $createTableSelection();
				tableSelection.set(table.getKey(), anchorCell.getKey(), anchorCell.getKey());
				$setSelection(tableSelection);
				return true;
			}
		}
		const anchorCollapsible = $findCollapsibleAncestor(selection.anchor.getNode());
		const focusCollapsible = $findCollapsibleAncestor(selection.focus.getNode());
		if (!anchorCollapsible || !focusCollapsible || !anchorCollapsible.is(focusCollapsible)) return false;
		if ($isEntireElementSelected(selection, anchorCollapsible)) $selectDocument();
		else anchorCollapsible.select(0, anchorCollapsible.getChildrenSize());
		return true;
	}, COMMAND_PRIORITY_HIGH);
}
function $expandTableSelection(selection) {
	const table = $getNodeByKey(selection.tableKey);
	if (!$isTableNode(table)) return false;
	const cells = $getTableCells(table);
	if (!cells) return false;
	const selectedCellKeys = new Set(selection.getNodes().filter($isTableCellNode).map((cell) => cell.getKey()));
	if (cells.keys.every((key) => selectedCellKeys.has(key))) {
		$selectDocument();
		return true;
	}
	const tableSelection = $createTableSelection();
	tableSelection.set(table.getKey(), cells.first.getKey(), cells.last.getKey());
	$setSelection(tableSelection);
	return true;
}
function $getTableCells(table) {
	if (!$isTableNode(table)) return null;
	const [tableMap] = $computeTableMapSkipCellCheck(table, null, null);
	const entries = tableMap.flat().filter(Boolean);
	const first = entries[0]?.cell;
	const last = entries.at(-1)?.cell;
	if (!first || !last) return null;
	return {
		first,
		keys: Array.from(new Set(entries.map(({ cell }) => cell.getKey()))),
		last
	};
}
function $findNearestNode(node, predicate) {
	let current = node;
	while (current) {
		if (predicate(current)) return current;
		current = current.getParent();
	}
	return null;
}
function $findCollapsibleAncestor(node) {
	return $findNearestNode(node, (candidate) => $isElementNode(candidate) && candidate.getType() === COLLAPSIBLE_NODE_TYPE);
}
function $isEntireElementSelected(selection, element) {
	const startOffset = 0;
	const endOffset = element.getChildrenSize();
	return $isPointAt(selection.anchor, element, startOffset) && $isPointAt(selection.focus, element, endOffset) || $isPointAt(selection.focus, element, startOffset) && $isPointAt(selection.anchor, element, endOffset);
}
function $isPointAt(point, element, offset) {
	return point.key === element.getKey() && point.offset === offset && point.type === "element";
}
function $selectDocument() {
	const root = $getRoot();
	root.select(0, root.getChildrenSize());
}
//#endregion
//#region src/plugins/common/plugin/register.ts
const logger$3 = createDebugLogger("plugin", "common");
function resolveElement(element, isBackward, focusOffset) {
	const parent = element.getParent();
	let offset = focusOffset;
	let block = element;
	if (parent !== null) {
		if (isBackward && focusOffset === 0) {
			offset = block.getIndexWithinParent();
			block = parent;
		} else if (!isBackward && focusOffset === block.getChildrenSize()) {
			offset = block.getIndexWithinParent() + 1;
			block = parent;
		}
	}
	const childIndex = isBackward ? offset - 1 : offset;
	if (childIndex < 0 || childIndex >= block.getChildrenSize()) return null;
	return block.getChildAtIndex(childIndex);
}
function isCodeNodeLastLine(focusNode) {
	if (!$isCodeHighlightNode(focusNode)) return false;
	const codeNode = focusNode.getParent();
	if (!$isCodeNode(codeNode)) return false;
	let last = codeNode.getLastChild();
	do {
		if ($isLineBreakNode(last)) return false;
		if (last === focusNode) return codeNode;
		last = last?.getPreviousSibling();
	} while (last !== focusNode && last);
	if (last === focusNode) return codeNode;
	return false;
}
function $getAdjacentNode(focus, isBackward) {
	const focusOffset = focus.offset;
	if (focus.type === "element") return resolveElement(focus.getNode(), isBackward, focusOffset);
	else {
		const focusNode = focus.getNode();
		if (isBackward && focusOffset === 0 || !isBackward && focusOffset === focusNode.getTextContentSize()) {
			const possibleNode = isBackward ? focusNode.getPreviousSibling() : focusNode.getNextSibling();
			if (possibleNode === null) return resolveElement(focusNode.getParentOrThrow(), isBackward, focusNode.getIndexWithinParent() + (isBackward ? 0 : 1));
			return possibleNode;
		} else if (!isBackward && isCodeNodeLastLine(focusNode)) return focusNode.getParent()?.getNextSibling() || null;
	}
	return null;
}
function $getDownUpNode(focus, isUp) {
	let blockParent = focus.getNode();
	while (blockParent !== null && blockParent.isInline()) blockParent = blockParent.getParent();
	if (!blockParent) return null;
	let nextNode = isUp ? blockParent.getPreviousSibling() : blockParent.getNextSibling();
	while (!nextNode && !$isRootOrShadowRoot(blockParent)) {
		blockParent = blockParent.getParent();
		if (!blockParent) return null;
		nextNode = isUp ? blockParent.getPreviousSibling() : blockParent.getNextSibling();
	}
	if (!nextNode) return null;
	return nextNode;
}
function $isSelectionAtEndOfRoot(selection) {
	const focus = selection.focus;
	return focus.key === "root" && focus.offset === $getRoot().getChildrenSize();
}
function $isSelectionInList(selection) {
	return Boolean($closest(selection.focus.getNode(), (node) => $isListNode(node) || $isListItemNode(node)));
}
function $getLeadingQuoteNode(selection) {
	const anchor = selection.anchor;
	if (anchor.offset !== 0) return false;
	let node = anchor.getNode();
	let current = node;
	let quoteNode = null;
	while (current) {
		if ($isQuoteNode(current)) {
			quoteNode = current;
			break;
		}
		current = current.getParent();
	}
	if (!quoteNode) return false;
	while (node !== quoteNode) {
		if (node.getIndexWithinParent() !== 0) return false;
		const parent = node.getParent();
		if (!parent) return false;
		node = parent;
	}
	return quoteNode;
}
function $unwrapQuoteNode(quoteNode) {
	const children = quoteNode.getChildren();
	if (children.length === 0) {
		const paragraphNode = $createParagraphNode();
		quoteNode.replace(paragraphNode);
		paragraphNode.select(0, 0);
		return;
	}
	let firstNode = null;
	for (const child of children) {
		if ($isElementNode(child)) {
			quoteNode.insertBefore(child);
			firstNode ||= child;
			continue;
		}
		const paragraphNode = $createParagraphNode();
		paragraphNode.append(child);
		quoteNode.insertBefore(paragraphNode);
		firstNode ||= paragraphNode;
	}
	quoteNode.remove();
	if ($isElementNode(firstNode)) firstNode.select(0, 0);
}
function registerBlockBackspace(editor) {
	return editor.registerCommand(KEY_BACKSPACE_COMMAND, (payload) => {
		const headingNode = editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
			const anchor = selection.anchor;
			if (anchor.offset !== 0) return false;
			const anchorNode = anchor.getNode();
			if ($isTextNode(anchorNode)) {
				if (anchorNode.getPreviousSibling()) return false;
				const parent = anchorNode.getParentOrThrow();
				if (!$isHeadingNode(parent)) return false;
				return parent;
			}
			if ($isHeadingNode(anchorNode)) return anchorNode;
			return false;
		});
		if (headingNode) {
			payload.stopImmediatePropagation();
			payload.preventDefault();
			payload.stopPropagation();
			editor.update(() => {
				const node = $createParagraphNode();
				headingNode.replace(node, true);
				node.select(0, 0);
			});
			return true;
		}
		if (editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
			return $getLeadingQuoteNode(selection);
		})) {
			payload.stopImmediatePropagation();
			payload.preventDefault();
			payload.stopPropagation();
			editor.update(() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
				const leadingQuoteNode = $getLeadingQuoteNode(selection);
				if (leadingQuoteNode) $unwrapQuoteNode(leadingQuoteNode);
			});
			return true;
		}
		return false;
	}, COMMAND_PRIORITY_NORMAL);
}
function registerRichKeydown(editor, kernel, options) {
	const { enableHotkey = true } = options || {};
	return mergeRegister(kernel.registerHotkey(HotkeyEnum.PasteAsPlainText, async () => {
		try {
			const text = await navigator.clipboard.readText();
			editor.update(() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection)) return;
				selection.insertText(text);
			});
		} catch (error) {
			logger$3.error("❌ Failed to paste as plain text:", error);
		}
	}, {
		enabled: enableHotkey,
		preventDefault: true,
		stopPropagation: true
	}), kernel.registerHotkey(HotkeyEnum.Bold, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}), kernel.registerHotkey(HotkeyEnum.Italic, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}), kernel.registerHotkey(HotkeyEnum.Underline, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline"), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}), kernel.registerHotkey(HotkeyEnum.Strikethrough, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough"), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}), kernel.registerHotkey(HotkeyEnum.Undo, () => editor.dispatchCommand(UNDO_COMMAND, void 0), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}), kernel.registerHotkey(HotkeyEnum.Redo, () => editor.dispatchCommand(REDO_COMMAND, void 0), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}), kernel.registerHighCommand(KEY_ARROW_UP_COMMAND, (event) => {
		const selection = $getSelection();
		if ($isNodeSelection(selection)) {
			const nodes = selection.getNodes();
			if (nodes.length > 0) {
				nodes[0].selectPrevious();
				event.preventDefault();
				return true;
			}
		} else if ($isRangeSelection(selection)) {
			if ($isSelectionInList(selection)) return false;
			const possibleNode = $getAdjacentNode(selection.focus, true);
			const upblock = possibleNode || $getDownUpNode(selection.focus, true);
			if (!event.shiftKey && $isDecoratorNode(possibleNode)) {
				const nodeSelection = $createNodeSelection();
				nodeSelection.add(possibleNode.getKey());
				editor.update(() => {
					$setSelection(nodeSelection);
				});
				event.preventDefault();
				return true;
			} else if (!event.shiftKey && $isDecoratorNode(upblock)) {
				const nodeSelection = $createNodeSelection();
				nodeSelection.add(upblock.getKey());
				editor.update(() => {
					$setSelection(nodeSelection);
				});
				event.preventDefault();
				return true;
			} else if (possibleNode && possibleNode.getType() !== "linebreak") {
				possibleNode?.selectEnd();
				event.preventDefault();
				return true;
			}
		}
		return false;
	}, COMMAND_PRIORITY_EDITOR), kernel.registerHighCommand(KEY_ARROW_DOWN_COMMAND, (event) => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) {
			if (!selection.isCollapsed()) return false;
			const focusNode = selection.focus.getNode();
			const quotaNode = $closest(focusNode, (node) => node.getType() === QuoteNode.getType());
			if (!quotaNode) return false;
			if (quotaNode.getNextSibling()) return false;
			const lastChild = quotaNode.getLastChild();
			if (!lastChild) return false;
			if (!$closest(focusNode, (node) => node === lastChild)) return false;
			event.preventDefault();
			editor.update(() => {
				const paragraph = $createParagraphNode();
				quotaNode.insertAfter(paragraph);
				paragraph.select();
			});
			return true;
		}
		return false;
	}, COMMAND_PRIORITY_LOW), kernel.registerHighCommand(KEY_ARROW_DOWN_COMMAND, (event) => {
		const selection = $getSelection();
		if ($isNodeSelection(selection)) {
			const nodes = selection.getNodes();
			if (nodes.length > 0) {
				const node = nodes[0].getNextSibling();
				if ($isRootOrShadowRoot(node)) {
					const parent = node.getParent();
					if (parent) {
						const index = node.getIndexWithinParent();
						parent.select(index, index);
						event.preventDefault();
						return true;
					}
				}
				node?.selectStart();
				event.preventDefault();
				return true;
			}
		} else if ($isRangeSelection(selection)) {
			if ($isSelectionAtEndOfRoot(selection)) {
				event.preventDefault();
				return true;
			}
			if ($isSelectionInList(selection)) return false;
			const possibleNode = $getAdjacentNode(selection.focus, false);
			const upblock = possibleNode || $getDownUpNode(selection.focus, false);
			if (!event.shiftKey && $isDecoratorNode(possibleNode)) {
				const nodeSelection = $createNodeSelection();
				nodeSelection.add(possibleNode.getKey());
				editor.update(() => {
					$setSelection(nodeSelection);
				});
				event.preventDefault();
				return true;
			} else if (!event.shiftKey && $isDecoratorNode(upblock)) {
				const nodeSelection = $createNodeSelection();
				nodeSelection.add(upblock.getKey());
				editor.update(() => {
					$setSelection(nodeSelection);
				});
				event.preventDefault();
				return true;
			} else if (possibleNode && possibleNode.getType() !== "linebreak") {
				possibleNode?.selectStart();
				event.preventDefault();
				return true;
			}
		}
		return false;
	}, COMMAND_PRIORITY_EDITOR), kernel.registerHighCommand(KEY_ARROW_RIGHT_COMMAND, (event) => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) {
			const focusNode = selection.focus.getNode();
			if ($isElementNode(focusNode) && focusNode.getChildAtIndex(selection.focus.offset)?.getType() === "table") {
				focusNode.getChildAtIndex(selection.focus.offset)?.selectStart();
				event.preventDefault();
				return true;
			}
		} else if ($isNodeSelection(selection)) {
			const nodes = selection.getNodes();
			if (nodes.length > 0) {
				const node = nodes[0].getNextSibling();
				if ($isRootOrShadowRoot(node)) {
					const parent = node.getParent();
					if (parent) {
						const index = node.getIndexWithinParent();
						parent.select(index, index);
						event.preventDefault();
						return true;
					}
				}
			}
		}
		return false;
	}, COMMAND_PRIORITY_EDITOR));
}
const NEEDS_FOLLOWING_PARAGRAPH_TYPES = /* @__PURE__ */ new Set([
	"code",
	"table",
	"block-image"
]);
function registerLastElement(editor) {
	let isProcessing = false;
	return editor.registerUpdateListener(({ dirtyElements }) => {
		if (!editor.isEditable()) return;
		if (!dirtyElements.has("root") && !Array.from(dirtyElements.keys()).some((key) => {
			return editor.getEditorState()._nodeMap.get(key)?.getParent()?.getKey() === "root";
		})) return;
		if (isProcessing) return;
		if (editor.getEditorState().read(() => {
			const lastChild = $getRoot().getLastChild();
			return NEEDS_FOLLOWING_PARAGRAPH_TYPES.has(lastChild?.getType());
		})) {
			isProcessing = true;
			queueMicrotask(() => {
				editor.update(() => {
					const root = $getRoot();
					const currentLast = root.getLastChild();
					if (NEEDS_FOLLOWING_PARAGRAPH_TYPES.has(currentLast?.getType())) {
						const paragraph = $createParagraphNode();
						root.append(paragraph);
					}
					isProcessing = false;
				}, { tag: HISTORIC_TAG });
			});
		}
	});
}
//#endregion
//#region src/plugins/common/plugin/index.ts
const CommonPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "CommonPlugin";
	}
	constructor(kernel, config = {}) {
		super();
		this.kernel = kernel;
		this.config = config;
		this.identityService = new NodeIdentityService();
		this.formats = {
			bold: true,
			header: true,
			italic: true,
			quote: true,
			strikethrough: true,
			subscript: false,
			superscript: false
		};
		kernel.registerService(INodeIdentityService, this.identityService);
		const markdownOption = config.markdownOption ?? true;
		if (typeof markdownOption === "object") {
			this.formats.bold = markdownOption.bold ?? true;
			this.formats.header = markdownOption.header ?? true;
			this.formats.italic = markdownOption.italic ?? true;
			this.formats.quote = markdownOption.quote ?? true;
			this.formats.strikethrough = markdownOption.strikethrough ?? true;
			this.formats.subscript = markdownOption.subscript ?? false;
			this.formats.superscript = markdownOption.superscript ?? false;
		} else if (markdownOption === false) {
			this.formats.bold = false;
			this.formats.header = false;
			this.formats.italic = false;
			this.formats.quote = false;
			this.formats.strikethrough = false;
			this.formats.subscript = false;
			this.formats.superscript = false;
		}
		kernel.registerDataSource(new JSONDataSource("json"));
		kernel.registerDataSource(new TextDataSource("text"));
		kernel.registerNodes([
			HeadingNode,
			QuoteNode,
			CursorNode
		]);
		if (config?.theme) kernel.registerThemes({
			quote: config.theme.quote,
			text: {
				bold: config.theme.textBold,
				code: config.theme.textCode,
				highlight: config.theme.textHighlight,
				italic: config.theme.textItalic,
				strikethrough: config.theme.textStrikethrough,
				subscript: config.theme.textSubscript,
				superscript: config.theme.textSuperscript,
				underline: config.theme.textUnderline,
				underlineStrikethrough: config.theme.textUnderlineStrikethrough
			}
		});
	}
	registerMarkdown(kernel) {
		const markdownService = kernel.requireService(IMarkdownShortCutService);
		if (!markdownService) return;
		const breakMark = (this.config?.markdownOption ?? true) !== false ? "\n\n" : "\n";
		const formats = this.formats;
		if (formats.quote) markdownService.registerMarkdownShortCut({
			regExp: /^(>|》)\s/,
			replace: (parentNode, children, _match, isImport) => {
				if (isImport) {
					const previousNode = parentNode.getPreviousSibling();
					if ($isQuoteNode(previousNode)) {
						previousNode.splice(previousNode.getChildrenSize(), 0, [$createLineBreakNode(), ...children]);
						parentNode.remove();
						return;
					}
				}
				const node = $createQuoteNode();
				node.append(...children);
				parentNode.replace(node);
				if (!isImport) node.select(0, 0);
			},
			type: "element"
		});
		if (formats.header) markdownService.registerMarkdownShortCut({
			regExp: /^(#{1,6})\s/,
			replace: createBlockNode((match, parentNode) => {
				const tag = "h" + match[1].length;
				if ($isHeadingNode(parentNode) && parentNode.getTag() === tag) return $createParagraphNode();
				return $createHeadingNode(tag);
			}),
			type: "element"
		});
		const textFormatShortcuts = [];
		if (formats.bold) textFormatShortcuts.push({
			format: ["bold"],
			tag: "**",
			type: "text-format"
		}, {
			format: ["bold"],
			intraword: false,
			tag: "__",
			type: "text-format"
		});
		if (formats.strikethrough) textFormatShortcuts.push({
			format: ["strikethrough"],
			tag: "~~",
			type: "text-format"
		});
		if (formats.italic) textFormatShortcuts.push({
			format: ["italic"],
			tag: "*",
			type: "text-format"
		}, {
			format: ["italic"],
			intraword: false,
			tag: "_",
			type: "text-format"
		});
		if (formats.superscript) textFormatShortcuts.push({
			format: ["superscript"],
			tag: "^",
			type: "text-format"
		});
		if (formats.subscript) textFormatShortcuts.push({
			format: ["subscript"],
			tag: "~",
			type: "text-format"
		});
		if (textFormatShortcuts.length > 0) markdownService.registerMarkdownShortCuts(textFormatShortcuts);
		markdownService.registerMarkdownWriter("paragraph", (ctx) => {
			ctx.wrap("", breakMark);
		});
		if (formats.quote) markdownService.registerMarkdownWriter("quote", (ctx, node) => {
			if ($isQuoteNode(node)) ctx.wrap("> ", breakMark);
		});
		if (formats.header) markdownService.registerMarkdownWriter("heading", (ctx, node) => {
			if ($isHeadingNode(node)) switch (node.getTag()) {
				case "h1":
					ctx.wrap("# ", "\n\n");
					break;
				case "h2":
					ctx.wrap("## ", "\n\n");
					break;
				case "h3":
					ctx.wrap("### ", "\n\n");
					break;
				case "h4":
					ctx.wrap("#### ", "\n\n");
					break;
				case "h5":
					ctx.wrap("##### ", "\n\n");
					break;
				case "h6":
					ctx.wrap("###### ", "\n\n");
					break;
				default: ctx.wrap("", "\n\n");
			}
		});
		markdownService.registerMarkdownWriter("text", (ctx, node) => {
			if (!$isTextNode(node)) return;
			let parentNode = node.getParent();
			let isInTableCell = false;
			while (parentNode) {
				if (parentNode.getType() === "tablecell" || parentNode.getType() === "table-cell-diff") {
					isInTableCell = true;
					break;
				}
				parentNode = parentNode.getParent();
			}
			const isBold = formats.bold && node.hasFormat("bold");
			const isItalic = formats.italic && node.hasFormat("italic");
			const isUnderline = node.hasFormat("underline");
			const isStrikethrough = formats.strikethrough && node.hasFormat("strikethrough");
			const isSuperscript = formats.superscript && node.hasFormat("superscript");
			const isSubscript = formats.subscript && node.hasFormat("subscript");
			if (isBold) ctx.appendLine("**");
			if (isStrikethrough) ctx.appendLine("~~");
			if (isItalic) ctx.appendLine("_");
			if (isUnderline) ctx.appendLine("<ins>");
			if (isSuperscript) ctx.appendLine("^");
			if (isSubscript) ctx.appendLine("~");
			const textContent = node.getTextContent();
			const res = textContent.match(/\s+$/);
			let tailSpace = "";
			if (res) tailSpace = res[0];
			const append = textContent.trimEnd();
			const lastChar = append.at(-1);
			const markdownText = isInTableCell ? append.replaceAll("\\", "\\\\").replaceAll("|", "\\|") : append;
			ctx.appendLine(markdownText);
			if (isSubscript) ctx.appendLine("~");
			if (isSuperscript) ctx.appendLine("^");
			if (isUnderline) ctx.appendLine("</ins>");
			if (isItalic) ctx.appendLine("_");
			if (isStrikethrough) ctx.appendLine("~~");
			if (isBold) ctx.appendLine("**");
			if (tailSpace) ctx.appendLine(tailSpace);
			else if (lastChar && isPunctuationChar(lastChar)) ctx.appendLine(" ");
		});
		markdownService.registerMarkdownWriter("linebreak", (ctx) => {
			ctx.appendLine("\n");
		});
		registerMDReader(markdownService);
	}
	onInit(editor) {
		this.register(this.identityService.bindEditor(editor));
		this.register(editor.registerNodeTransform(RootNode, $normalizeNodeIds));
		this.register(editor.registerCommand(SELECTION_INSERT_CLIPBOARD_NODES_COMMAND, ({ nodes }) => {
			const clearCopiedIds = (node) => {
				$clearNodeId(node);
				if ($isElementNode(node)) node.getChildren().forEach(clearCopiedIds);
			};
			nodes.forEach(clearCopiedIds);
			return false;
		}, COMMAND_PRIORITY_CRITICAL));
		this.register(this.kernel.registerHighCommand(PASTE_COMMAND, (event) => {
			if (!(event instanceof ClipboardEvent)) return false;
			const clipboardData = event.clipboardData;
			if (!clipboardData) return false;
			this.kernel.emit("onPaste", event);
			const ctx = {
				clipboardData,
				config: this.config,
				editor,
				event
			};
			if (this.config?.pasteVSCodeAsCodeBlock) {
				if (handleVSCodePaste(ctx) === "handled") return true;
			}
			if (this.config?.pasteAsPlainText) return runPasteHandlers(ctx, [handleFilePaste, handlePlainTextPaste]);
			return false;
		}, COMMAND_PRIORITY_CRITICAL));
		let dragonCleanup;
		const clearDragon = () => {
			dragonCleanup?.();
			dragonCleanup = void 0;
		};
		this.register(this.kernel.registerRootListener((rootElement) => {
			clearDragon();
			if (!rootElement || !CAN_USE_DOM) return;
			dragonCleanup = registerDragonSupport(editor);
		}));
		this.register(clearDragon);
		this.registerClears(registerRichText(editor), registerProgressiveSelectAll(editor), registerHistory(editor, this.kernel.getHistoryState(), 300), registerBlockBackspace(editor), registerRichKeydown(editor, this.kernel, { enableHotkey: this.config?.enableHotkey }), registerCommands(editor), registerBreakLineClick(editor), registerCursorNode(editor), registerLastElement(editor), editor.registerCommand(INSERT_LINE_BREAK_COMMAND, () => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return false;
			const { inCell, inTable } = $isCursorInTable(selection);
			if (inCell) return false;
			if (inTable) return false;
			if ($isCursorInQuote(selection)) return false;
			editor.update(() => {
				editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, void 0);
			});
			return true;
		}, COMMAND_PRIORITY_HIGH));
		this.registerMarkdown(this.kernel);
		this.registerLiteXml();
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		const formats = this.formats;
		litexmlService.registerXMLWriter(TextNode.getType(), (node, ctx) => {
			const attr = {};
			if ($isTextNode(node)) {
				if (formats.bold && node.hasFormat("bold")) attr["bold"] = "true";
				if (formats.italic && node.hasFormat("italic")) attr["italic"] = "true";
				if (node.hasFormat("underline")) attr["underline"] = "true";
				if (formats.strikethrough && node.hasFormat("strikethrough")) attr["strikethrough"] = "true";
				if (formats.subscript && node.hasFormat("subscript")) attr["subscript"] = "true";
				if (formats.superscript && node.hasFormat("superscript")) attr["superscript"] = "true";
				return ctx.createXmlNode("span", attr, node.getTextContent());
			}
			return false;
		});
		if (formats.bold) {
			litexmlService.registerXMLReader("b", sampleReader.bind(this, TEXT_TYPE_TO_FORMAT["bold"]));
			litexmlService.registerXMLReader("strong", sampleReader.bind(this, TEXT_TYPE_TO_FORMAT["bold"]));
		}
		if (formats.italic) {
			litexmlService.registerXMLReader("i", sampleReader.bind(this, TEXT_TYPE_TO_FORMAT["italic"]));
			litexmlService.registerXMLReader("emphasis", sampleReader.bind(this, TEXT_TYPE_TO_FORMAT["italic"]));
		}
		litexmlService.registerXMLReader("u", sampleReader.bind(this, TEXT_TYPE_TO_FORMAT["underline"]));
		litexmlService.registerXMLReader("ins", sampleReader.bind(this, TEXT_TYPE_TO_FORMAT["underline"]));
		litexmlService.registerXMLReader("span", (xmlElement, children) => {
			const bold = xmlElement.getAttribute("bold");
			const italic = xmlElement.getAttribute("italic");
			const underline = xmlElement.getAttribute("underline");
			const strikethrough = xmlElement.getAttribute("strikethrough");
			const subscript = xmlElement.getAttribute("subscript");
			const superscript = xmlElement.getAttribute("superscript");
			let format = 0;
			if (formats.bold && bold === "true") format |= TEXT_TYPE_TO_FORMAT["bold"];
			if (formats.italic && italic === "true") format |= TEXT_TYPE_TO_FORMAT["italic"];
			if (underline === "true") format |= TEXT_TYPE_TO_FORMAT["underline"];
			if (formats.strikethrough && strikethrough === "true") format |= TEXT_TYPE_TO_FORMAT["strikethrough"];
			if (formats.subscript && subscript === "true") format |= TEXT_TYPE_TO_FORMAT["subscript"];
			if (formats.superscript && superscript === "true") format |= TEXT_TYPE_TO_FORMAT["superscript"];
			children.forEach((child) => {
				if (INodeHelper.isTextNode(child)) child.format = (child.format || 0) | format;
			});
			return children;
		});
		if (formats.quote) {
			litexmlService.registerXMLWriter("quote", (node, ctx) => {
				if ($isQuoteNode(node)) return ctx.createXmlNode("quote", {});
				return false;
			});
			litexmlService.registerXMLReader("quote", (xmlElement, children) => {
				return INodeHelper.createElementNode(QuoteNode.getType(), { children });
			});
		}
		if (formats.header) {
			litexmlService.registerXMLWriter("heading", (node, ctx) => {
				if ($isHeadingNode(node)) return ctx.createXmlNode(node.getTag(), {});
				return false;
			});
			[
				"h1",
				"h2",
				"h3",
				"h4",
				"h5",
				"h6"
			].forEach((tag) => {
				litexmlService.registerXMLReader(tag, (xmlElement, children) => {
					return INodeHelper.createElementNode(HeadingNode.getType(), {
						children,
						tag
					});
				});
			});
		}
		litexmlService.registerXMLWriter(ParagraphNode.getType(), (node, ctx) => {
			return ctx.createXmlNode("p", {});
		});
		litexmlService.registerXMLReader("p", (xmlElement, children) => {
			return INodeHelper.createElementNode(ParagraphNode.getType(), { children });
		});
	}
	destroy() {
		super.destroy();
	}
};
//#endregion
//#region src/plugins/code/node/code.ts
var CodeNode = class CodeNode extends CardLikeElementNode {
	static getType() {
		return "codeInline";
	}
	static clone(node) {
		return new CodeNode(node.__key);
	}
	static importJSON(serializedNode) {
		return $createCodeNode().updateFromJSON(serializedNode);
	}
	createDOM(config) {
		const element = document.createElement("span");
		element.setAttribute("data-lexical-key", this.getKey());
		const childContainer = document.createElement("ne-content");
		element.append(childContainer);
		addClassNamesToElement(element, config.theme.codeInline);
		return element;
	}
	getDOMSlot(element) {
		const neContent = element.querySelector("ne-content");
		if (!neContent) throw new Error("CodeNode: ne-content not found");
		return super.getDOMSlot(element).withElement(neContent);
	}
	canBeEmpty() {
		return false;
	}
	isCardLike() {
		return true;
	}
	isInline() {
		return true;
	}
	canIndent() {
		return false;
	}
	canInsertTextBefore() {
		return true;
	}
	canInsertTextAfter() {
		return true;
	}
	updateDOM(prevNode, dom, config) {
		if ((prevNode ? prevNode : null) !== this) addClassNamesToElement(dom, config.theme.codeInline);
		return false;
	}
};
function $createCodeNode(textContent) {
	const codeNode = $applyNodeReplacement(new CodeNode());
	const cursorNode = $createCursorNode();
	codeNode.append(cursorNode);
	if (textContent) codeNode.append($createTextNode(textContent));
	return codeNode;
}
function $isCodeInlineNode(node) {
	return node instanceof CodeNode;
}
function getCodeInlineNode(node) {
	if ($isCursorNode(node)) {
		const parent = node.getParent();
		if ($isCodeInlineNode(parent)) return parent;
		if ($isCodeInlineNode(node.getNextSibling())) return node.getNextSibling();
		if ($isCodeInlineNode(node.getPreviousSibling())) return node.getPreviousSibling();
		return null;
	}
	if ($isCodeInlineNode(node.getParent())) return node.getParent();
	return null;
}
//#endregion
//#region src/plugins/code/command/index.ts
const INSERT_CODEINLINE_COMMAND = createCommand("INSERT_CODEINLINE_COMMAND");
function registerCodeInlineCommand(editor) {
	return editor.registerCommand(INSERT_CODEINLINE_COMMAND, () => {
		editor.update(() => {
			const selection = $getSelection();
			if (!selection || !$isRangeSelection(selection)) return false;
			const focusNode = selection.focus.getNode();
			const anchorNode = selection.anchor.getNode();
			if ($isCodeHighlightNode(focusNode) || $isCodeHighlightNode(anchorNode)) return false;
			const code = getCodeInlineNode(focusNode);
			if (code !== getCodeInlineNode(anchorNode)) return false;
			if ($isCodeInlineNode(code)) {
				for (const node of code.getChildren().slice(0)) code.insertBefore(node);
				code.remove();
				return true;
			}
			const codeNode = $createCodeNode(selection.getTextContent());
			$insertNodes([codeNode, $createCursorNode()]);
			codeNode.select();
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR);
}
//#endregion
//#region src/plugins/code/plugin/registry.ts
function registerCodeInline(editor, kernel, options) {
	const { enableHotkey = true } = options || {};
	return mergeRegister(editor.registerUpdateListener(({ mutatedNodes }) => {
		const keys = (mutatedNodes?.get(CodeNode))?.keys() || [];
		const needAddBefore = /* @__PURE__ */ new Set();
		editor.getEditorState().read(() => {
			for (const key of keys) {
				const node = $getNodeByKey(key);
				if (!node) return;
				if (node.getParent()?.getFirstChild() === node) needAddBefore.add(node);
			}
		});
		if (needAddBefore.size > 0) editor.update(() => {
			needAddBefore.forEach((node) => {
				if (!node.getPreviousSibling()) node.insertBefore($createCursorNode());
			});
		}, { tag: HISTORY_MERGE_TAG });
	}), kernel.registerHotkey(HotkeyEnum.CodeInline, () => editor.dispatchCommand(INSERT_CODEINLINE_COMMAND, void 0), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}));
}
//#endregion
//#region src/plugins/code/plugin/index.ts
const CodePlugin = class extends KernelPlugin {
	static {
		this.pluginName = "CodePlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		kernel.registerNodes([CodeNode]);
		kernel.registerThemes({ codeInline: config?.theme || "editor-code" });
	}
	onInit(editor) {
		this.register(registerCodeInlineCommand(editor));
		this.register(registerCodeInline(editor, this.kernel, { enableHotkey: this.config?.enableHotkey }));
		this.register(editor.registerNodeTransform(TextNode, (node) => {
			if (node.hasFormat("code")) node.replace($createCodeNode(node.getTextContent())).insertAfter($createCursorNode());
		}));
		this.registerMarkdown();
		this.registerLiteXml();
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(CodeNode.getType(), (node, ctx) => {
			return ctx.createXmlNode("codeInline", {});
		});
		litexmlService.registerXMLReader("codeInline", (xmlElement, children) => {
			return INodeHelper.createElementNode(CodeNode.getType(), { children });
		});
	}
	registerMarkdown() {
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		if (!markdownService) return;
		markdownService.registerMarkdownWriter(CodeNode.getType(), (ctx, node) => {
			ctx.appendLine(`\`${node.getTextContent().replaceAll("﻿", "")}\``);
			return true;
		});
		markdownService.registerMarkdownShortCuts([{
			process: (selection) => {
				if (selection.getNodes().some((node) => node.getType() === CodeNode.getType())) return false;
				const text = selection.getTextContent();
				selection.removeText();
				selection.insertNodes([$createCodeNode(text), $createCursorNode()]);
				$setSelection(selection);
			},
			tag: "`",
			type: "text-format"
		}]);
		markdownService.registerMarkdownReader("inlineCode", (node) => {
			return [INodeHelper.createElementNode("codeInline", {
				children: [cursorNodeSerialized, INodeHelper.createTextNode(node.value || "", {})],
				direction: "ltr",
				format: "",
				indent: 0,
				type: "codeInline",
				version: 1
			}), cursorNodeSerialized];
		});
	}
};
//#endregion
//#region src/plugins/codeblock/command/symbols.ts
const UPDATE_CODEBLOCK_LANG = createCommand("UPDATE_CODEBLOCK_LANG");
//#endregion
//#region src/plugins/codemirror-block/command/index.ts
const INSERT_CODEMIRROR_COMMAND = createCommand("INSERT_CODEMIRROR_COMMAND");
const SELECT_BEFORE_CODEMIRROR_COMMAND = createCommand("SELECT_BEFORE_CODEMIRROR_COMMAND");
const SELECT_AFTER_CODEMIRROR_COMMAND = createCommand("SELECT_AFTER_CODEMIRROR_COMMAND");
function registerCodeMirrorCommand(editor) {
	return mergeRegister(editor.registerCommand(INSERT_CODEMIRROR_COMMAND, () => {
		editor.update(() => {
			const codeMirrorNode = $createCodeMirrorNode("", "");
			$insertNodes([codeMirrorNode]);
			const selection = $createNodeSelection();
			selection.add(codeMirrorNode.getKey());
			$setSelection(selection);
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(UPDATE_CODEBLOCK_LANG, (payload) => {
		const codeMirrorNode = editor.getEditorState().read(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) {
				if (selection.isCollapsed()) return $findMatchingParent(selection.anchor.getNode(), $isCodeMirrorNode);
				else {
					const anchor = $findMatchingParent(selection.anchor.getNode(), $isCodeMirrorNode);
					const focus = $findMatchingParent(selection.focus.getNode(), $isCodeMirrorNode);
					if (anchor && focus && anchor === focus) return anchor;
					return null;
				}
			}
			return false;
		});
		if (!codeMirrorNode) return false;
		queueMicrotask(() => {
			editor.update(() => {
				if ($isCodeMirrorNode(codeMirrorNode)) codeMirrorNode.setLang(payload.lang);
			});
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(SELECT_BEFORE_CODEMIRROR_COMMAND, (payload) => {
		editor.update(() => {
			const node = $getNodeByKey(payload.key);
			if (!node) return;
			const prevNode = node.getPreviousSibling();
			const sel = prevNode?.selectEnd();
			console.info("SELECT_BEFORE_CODEMIRROR_COMMAND", prevNode, sel);
			if (sel) $setSelection(sel);
			editor.focus();
		});
		return false;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(SELECT_AFTER_CODEMIRROR_COMMAND, (payload) => {
		editor.update(() => {
			const node = $getNodeByKey(payload.key);
			if (!node) return;
			const selection = node.getNextSibling()?.selectStart();
			if (selection) $setSelection(selection);
			else {
				const paragraph = $createParagraphNode();
				node.insertAfter(paragraph);
				const paragraphSelection = paragraph.selectStart();
				if (paragraphSelection) $setSelection(paragraphSelection);
			}
			editor.focus();
		});
		return false;
	}, COMMAND_PRIORITY_EDITOR));
}
//#endregion
//#region src/codemirror/constants.ts
const LANGUAGES = [
	{
		ext: ["agda"],
		name: "Agda",
		syntax: "text/x-agda",
		value: "agda"
	},
	{
		ext: ["ets", "arkts"],
		name: "ArkTS",
		syntax: "text/x-arkts",
		value: "arkts"
	},
	{
		ext: ["bash"],
		name: "Bash",
		syntax: "shell",
		value: "bash"
	},
	{
		ext: ["vbs"],
		name: "Basic",
		syntax: "vbscript",
		value: "basic"
	},
	{
		ext: [
			"c",
			"h",
			"ino"
		],
		name: "C",
		syntax: "text/x-csrc",
		value: "c"
	},
	{
		ext: [
			"cpp",
			"c++",
			"cc",
			"cxx",
			"hpp",
			"h++",
			"hh",
			"hxx"
		],
		name: "C++",
		syntax: "text/x-c++src",
		value: "cpp"
	},
	{
		ext: ["cs"],
		name: "C#",
		syntax: "text/x-csharp",
		value: "csharp"
	},
	{
		ext: ["css"],
		name: "CSS",
		syntax: "css",
		value: "css"
	},
	{
		ext: ["dart"],
		name: "Dart",
		syntax: "dart",
		value: "dart"
	},
	{
		ext: ["diff", "patch"],
		name: "Diff",
		syntax: "diff",
		value: "diff"
	},
	{
		name: "Dockerfile",
		syntax: "dockerfile",
		value: "dockerfile"
	},
	{
		ext: ["erl"],
		name: "Erlang",
		syntax: "erlang",
		value: "erlang"
	},
	{
		ext: ["glsl"],
		name: "Glsl",
		syntax: "x-shader/x-vertex",
		value: "glsl"
	},
	{
		name: "Git",
		syntax: "shell",
		value: "git"
	},
	{
		ext: ["go"],
		name: "Go",
		syntax: "go",
		value: "go"
	},
	{
		name: "GraphQL",
		syntax: "graphql",
		value: "graphql"
	},
	{
		ext: ["groovy", "gradle"],
		name: "Groovy",
		syntax: "groovy",
		value: "groovy"
	},
	{
		ext: [
			"html",
			"htm",
			"handlebars",
			"hbs"
		],
		name: "HTML",
		syntax: "htmlmixed",
		value: "html"
	},
	{
		name: "HTTP",
		syntax: "http",
		value: "http"
	},
	{
		ext: ["java"],
		name: "Java",
		syntax: "text/x-java",
		value: "java"
	},
	{
		ext: ["js"],
		name: "JavaScript",
		syntax: "text/javascript",
		value: "javascript"
	},
	{
		ext: ["json", "map"],
		name: "JSON",
		syntax: "application/json",
		value: "json"
	},
	{
		ext: ["jsx"],
		name: "JSX",
		syntax: "jsx",
		value: "jsx"
	},
	{
		name: "KaTeX",
		syntax: "simplemode",
		value: "katex"
	},
	{
		ext: ["kt"],
		name: "Kotlin",
		syntax: "text/x-kotlin",
		value: "kotlin"
	},
	{
		ext: ["less"],
		name: "Less",
		syntax: "css",
		value: "less"
	},
	{
		name: "Makefile",
		syntax: "cmake",
		value: "makefile"
	},
	{
		ext: [
			"markdown",
			"md",
			"mkd"
		],
		name: "Markdown",
		syntax: "markdown",
		value: "markdown"
	},
	{
		ext: ["mermaid", "mmd"],
		name: "Mermaid",
		syntax: "simplemode",
		value: "mermaid"
	},
	{
		name: "MATLAB",
		syntax: "octave",
		value: "matlab"
	},
	{
		ext: ["conf"],
		name: "Nginx",
		syntax: "nginx",
		value: "nginx"
	},
	{
		ext: ["m"],
		name: "Objective-C",
		syntax: "text/x-objectivec",
		value: "objectivec"
	},
	{
		ext: ["p", "pas"],
		name: "Pascal",
		syntax: "pascal",
		value: "pascal"
	},
	{
		ext: ["pl", "pm"],
		name: "Perl",
		syntax: "perl",
		value: "perl"
	},
	{
		ext: [
			"php",
			"php3",
			"php4",
			"php5",
			"php7",
			"phtml"
		],
		name: "PHP",
		syntax: "text/x-php",
		value: "php"
	},
	{
		ext: [
			"ps1",
			"psd1",
			"psm1"
		],
		name: "PowerShell",
		syntax: "powershell",
		value: "powershell"
	},
	{
		ext: ["proto"],
		name: "Protobuf",
		syntax: "protobuf",
		value: "protobuf"
	},
	{
		ext: [
			"build",
			"bzl",
			"py",
			"pyw"
		],
		name: "Python",
		syntax: "python",
		value: "python"
	},
	{
		ext: ["r", "R"],
		name: "R",
		syntax: "r",
		value: "r"
	},
	{
		ext: ["rb"],
		name: "Ruby",
		syntax: "ruby",
		value: "ruby"
	},
	{
		ext: ["rs"],
		name: "Rust",
		syntax: "rust",
		value: "rust"
	},
	{
		ext: ["scala"],
		name: "Scala",
		syntax: "text/x-scala",
		value: "scala"
	},
	{
		ext: ["sh", "ksh"],
		name: "Shell",
		syntax: "shell",
		value: "shell"
	},
	{
		ext: ["sql"],
		name: "SQL",
		syntax: "text/x-sql",
		value: "sql"
	},
	{
		name: "PL/SQL",
		syntax: "text/x-plsql",
		value: "plsql"
	},
	{
		ext: ["swift"],
		name: "Swift",
		syntax: "swift",
		value: "swift"
	},
	{
		ext: ["ts"],
		name: "TypeScript",
		syntax: "text/typescript",
		value: "typescript"
	},
	{
		ext: ["vb"],
		name: "VB.net",
		syntax: "vb",
		value: "vbnet"
	},
	{
		ext: ["vtl"],
		name: "Velocity",
		syntax: "velocity",
		value: "velocity"
	},
	{
		ext: [
			"xml",
			"xsl",
			"xsd",
			"svg"
		],
		name: "XML",
		syntax: "xml",
		value: "xml"
	},
	{
		ext: ["yaml", "yml"],
		name: "YAML",
		syntax: "yaml",
		value: "yaml"
	},
	{
		name: "sTeX",
		syntax: "text/x-stex",
		value: "stex"
	},
	{
		ext: [
			"text",
			"ltx",
			"tex"
		],
		name: "LaTeX",
		syntax: "text/x-latex",
		value: "latex"
	},
	{
		ext: ["sv", "svh"],
		name: "SystemVerilog",
		syntax: "text/x-systemverilog",
		value: "systemverilog"
	},
	{
		ext: ["sass", "scss"],
		name: "Sass",
		syntax: "text/x-sass",
		value: "sass"
	},
	{
		ext: ["tcl"],
		name: "Tcl",
		syntax: "text/x-tcl",
		value: "tcl"
	},
	{
		ext: ["v"],
		name: "Verilog",
		syntax: "text/x-verilog",
		value: "verilog"
	},
	{
		name: "Vue",
		syntax: "text/x-vue",
		value: "vue"
	},
	{
		ext: ["lua"],
		name: "Lua",
		syntax: "text/x-lua",
		value: "lua"
	},
	{
		ext: ["hs"],
		name: "Haskell",
		syntax: "haskell",
		value: "haskell"
	},
	{
		ext: [
			"properties",
			"ini",
			"in"
		],
		name: "Properties",
		syntax: "properties",
		value: "properties"
	},
	{
		ext: ["toml"],
		name: "TOML",
		syntax: "toml",
		value: "toml"
	},
	{
		ext: ["cyp", "cypher"],
		name: "Cypher",
		syntax: "cypher",
		value: "cypher"
	},
	{
		ext: ["tsx"],
		name: "TSX",
		syntax: "jsx",
		value: "tsx"
	},
	{
		ext: ["fs"],
		name: "F#",
		syntax: "mllike",
		value: "f#"
	},
	{
		ext: [
			"ml",
			"mli",
			"mll",
			"mly"
		],
		name: "OCaml",
		syntax: "mllike",
		value: "ocaml"
	},
	{
		ext: [
			"clj",
			"cljc",
			"cljx"
		],
		name: "Clojure",
		syntax: "clojure",
		value: "clojure"
	},
	{
		name: "ABAP",
		syntax: "abap",
		value: "abap"
	},
	{
		ext: ["jl"],
		name: "Julia",
		syntax: "julia",
		value: "julia"
	},
	{
		ext: ["cmake"],
		name: "CMake",
		syntax: "cmake",
		value: "cmake"
	},
	{
		ext: ["scm", "ss"],
		name: "Scheme",
		syntax: "scheme",
		value: "scheme"
	},
	{
		ext: [
			"cl",
			"lisp",
			"el"
		],
		name: "Lisp",
		syntax: "commonlisp",
		value: "commonlisp"
	},
	{
		ext: [
			"f90",
			"f95",
			"f03"
		],
		name: "Fortran",
		syntax: "fortran",
		value: "fortran"
	},
	{
		ext: ["sol"],
		name: "Solidity",
		syntax: "solidity",
		value: "solidity"
	}
];
LANGUAGES.sort((modeA, modeB) => {
	const nameA = modeA.name.toLowerCase();
	const nameB = modeB.name.toLowerCase();
	if (nameA === nameB) return 0;
	if (nameA < nameB) return -1;
	return 1;
});
LANGUAGES.unshift({
	name: "Plain Text",
	syntax: "simplemode",
	value: "plain"
});
//#endregion
//#region src/plugins/codemirror-block/lib/mode.ts
function modeMatch(mode = "") {
	mode = mode.toLocaleLowerCase() || "plain";
	return LANGUAGES.find((m) => m.value === mode || m.ext?.includes(mode))?.value || "plain";
}
//#endregion
//#region src/plugins/codemirror-block/service/index.ts
const ICodemirrorEditLockService = genServiceId("CodemirrorEditLockService");
var CodemirrorEditLockService = class {
	constructor() {
		this.providerUnsubscribers = /* @__PURE__ */ new Map();
		this.providers = /* @__PURE__ */ new Set();
		this.subscribers = /* @__PURE__ */ new Set();
	}
	acquireLock(key, label) {
		if (this.getRemoteLockOwner(key)) return false;
		const acquiredProviders = [];
		for (const provider of this.providers) {
			if (!provider.acquireLock(key, label)) {
				acquiredProviders.forEach((acquiredProvider) => acquiredProvider.releaseLock(key));
				this.notify();
				return false;
			}
			acquiredProviders.push(provider);
		}
		this.notify();
		return true;
	}
	getRemoteLockOwner(key) {
		for (const provider of this.providers) {
			const owner = provider.getRemoteLockOwner(key);
			if (owner) return owner;
		}
		return null;
	}
	registerProvider(provider) {
		this.providers.add(provider);
		this.providerUnsubscribers.set(provider, provider.subscribe(() => this.notify()));
		this.notify();
		return () => {
			this.providerUnsubscribers.get(provider)?.();
			this.providerUnsubscribers.delete(provider);
			this.providers.delete(provider);
			this.notify();
		};
	}
	releaseLock(key) {
		this.providers.forEach((provider) => provider.releaseLock(key));
		this.notify();
	}
	subscribe(listener) {
		this.subscribers.add(listener);
		listener();
		return () => {
			this.subscribers.delete(listener);
		};
	}
	notify() {
		this.subscribers.forEach((listener) => listener());
	}
};
//#endregion
//#region src/plugins/codemirror-block/plugin/index.ts
const CodemirrorPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "CodemirrorPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		kernel.registerNodes([CodeMirrorNode]);
		kernel.registerThemes({ hr: config?.theme || "" });
		kernel.registerServiceHotReload(ICodemirrorEditLockService, new CodemirrorEditLockService());
		this.registerDecorator(kernel, "codemirror", (node, editor) => {
			return config?.decorator ? config.decorator(node, editor) : null;
		});
	}
	onInit(editor) {
		this.register(registerCodeMirrorCommand(editor));
		this.registerMarkdown();
		this.registerLiteXml();
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(CodeMirrorNode.getType(), (node, ctx) => {
			const codeMirrorNode = node;
			return ctx.createXmlNode("code", { lang: codeMirrorNode.lang || "plain" }, codeMirrorNode.code);
		});
		litexmlService.registerXMLReader("code", (xmlElement, children) => {
			const text = children.map((v) => v.text || "").join("");
			const language = xmlElement.getAttribute("lang") || "plain";
			return INodeHelper.createTypeNode("code", {
				code: text || xmlElement.textContent || "",
				language: modeMatch(language),
				version: 1
			});
		});
	}
	registerMarkdown() {
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		markdownService?.registerMarkdownShortCut({
			regExp: /^(```|···)(.+)?$/,
			replace: (parentNode, _, match) => {
				const code = $createCodeMirrorNode(modeMatch(match[2]), "");
				parentNode.replace(code);
				const sel = $createNodeSelection();
				sel.add(code.getKey());
				$setSelection(sel);
			},
			trigger: "enter",
			type: "element"
		});
		markdownService?.registerMarkdownWriter(CodeMirrorNode.getType(), (ctx, node) => {
			if (node instanceof CodeMirrorNode) {
				ctx.appendLine("```" + node.lang);
				ctx.appendLine("\n");
				ctx.appendLine(node.code);
				ctx.appendLine("\n```\n");
			}
		});
		markdownService?.registerMarkdownReader("code", (node) => {
			const language = node.lang ? modeMatch(node.lang) : "plain";
			return INodeHelper.createTypeNode("code", {
				code: node.value,
				language,
				version: 1
			});
		});
	}
};
//#endregion
//#region src/plugins/upload/service/i-upload-service.ts
const IUploadService = genServiceId("UploadService");
//#endregion
//#region src/plugins/file/node/FileNode.ts
var FileNode = class FileNode extends DecoratorNode {
	static getType() {
		return "file";
	}
	static clone(node) {
		return new FileNode(node.__name, node.__fileUrl, node.__size, node.__status, node.__message, node.__key);
	}
	static importJSON(serializedNode) {
		return new FileNode(serializedNode.name, serializedNode.fileUrl, serializedNode.size, serializedNode.status, serializedNode.message);
	}
	static importDOM() {
		return { span: (node) => {
			if (node.classList.contains("file")) return {
				conversion: $convertFileElement,
				priority: 0
			};
			return null;
		} };
	}
	get name() {
		return this.__name;
	}
	get fileUrl() {
		return this.__fileUrl;
	}
	get size() {
		return this.__size;
	}
	get status() {
		return this.__status;
	}
	get message() {
		return this.__message;
	}
	constructor(name, fileUrl, size, status, message, key) {
		super(key);
		this.__name = name;
		this.__fileUrl = fileUrl;
		this.__size = size;
		this.__status = status || "pending";
		this.__message = message;
	}
	setUploaded(url) {
		const writable = this.getWritable();
		writable.__fileUrl = url;
		writable.__status = "uploaded";
		writable.__message = void 0;
	}
	setError(message) {
		const writable = this.getWritable();
		writable.__status = "error";
		writable.__message = message;
	}
	exportDOM() {
		return { element: document.createElement("span") };
	}
	createDOM(config) {
		const element = document.createElement("span");
		addClassNamesToElement(element, config.theme.file);
		return element;
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			fileUrl: this.fileUrl,
			message: this.message,
			name: this.name,
			size: this.size,
			status: this.status
		};
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode);
	}
	getTextContent() {
		return "\n";
	}
	updateDOM() {
		return false;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator("file");
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		return {
			queryDOM: decorator.queryDOM,
			render: decorator.render(this, editor)
		};
	}
};
function $createFileNode(name = "unknown", fileUrl, size, status, message) {
	return $applyNodeReplacement(new FileNode(name, fileUrl, size, status, message));
}
function $convertFileElement() {
	return { node: $createFileNode() };
}
function $isFileNode(node) {
	return node.getType() === FileNode.getType();
}
//#endregion
//#region src/plugins/file/command/index.ts
const logger$2 = createDebugLogger("plugin", "file");
const INSERT_FILE_COMMAND = createCommand("INSERT_FILE_COMMAND");
function registerFileCommand(editor, handleUpload) {
	return editor.registerCommand(INSERT_FILE_COMMAND, (payload) => {
		if (!editor.isEditable()) return false;
		const { file } = payload;
		editor.update(() => {
			const fileNode = $createFileNode(file.name);
			$insertNodes([fileNode]);
			if ($isRootOrShadowRoot(fileNode.getParentOrThrow())) $wrapNodeInElement(fileNode, $createParagraphNode).selectEnd();
			handleUpload(file).then((url) => {
				editor.update(() => {
					fileNode.setUploaded(url.url);
				});
			}).catch((error) => {
				logger$2.error("❌ File upload failed:", error);
				editor.update(() => {
					fileNode.setError("File upload failed : " + error.message);
				});
			});
		});
		return false;
	}, COMMAND_PRIORITY_HIGH);
}
//#endregion
//#region src/plugins/file/utils/index.ts
function registerFileNodeSelectionObserver(editor) {
	const selectFileKeys = [];
	return editor.registerUpdateListener(({ editorState }) => {
		const selection = editorState.read(() => $getSelection());
		const newSelectFileKeys = [];
		if ($isNodeSelection(selection)) editorState.read(() => selection.getNodes()).forEach((node) => {
			if (node.getType() === "file") newSelectFileKeys.push(node.getKey());
		});
		else if ($isRangeSelection(selection) && !selection.isCollapsed()) editorState.read(() => {
			selection.getNodes().forEach((node) => {
				if (node.getType() === "file") newSelectFileKeys.push(node.getKey());
			});
		});
		const removeKeys = selectFileKeys.filter((key) => !newSelectFileKeys.includes(key));
		const addKeys = newSelectFileKeys.filter((key) => !selectFileKeys.includes(key));
		selectFileKeys.length = 0;
		selectFileKeys.push(...newSelectFileKeys);
		removeKeys.forEach((key) => {
			editor.getElementByKey(key)?.classList.remove("selected");
		});
		addKeys.forEach((key) => {
			editor.getElementByKey(key)?.classList.add("selected");
		});
	});
}
//#endregion
//#region src/plugins/file/plugin/index.ts
const FilePlugin = class extends KernelPlugin {
	static {
		this.pluginName = "FilePlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		this.logger = createDebugLogger("plugin", "file");
		kernel.registerNodes([FileNode]);
		if (config?.theme) kernel.registerThemes(config?.theme);
		this.registerDecorator(kernel, FileNode.getType(), (node, editor) => {
			return config?.decorator ? config.decorator(node, editor) : null;
		});
	}
	onInit(editor) {
		const handleUpload = this.config?.handleUpload;
		if (handleUpload) {
			this.kernel.requireService(IUploadService)?.registerUpload(async (file, from, range) => {
				editor.update(() => {
					if (range) {
						const rangeSelection = $createRangeSelection();
						if (range !== null && range !== void 0) rangeSelection.applyDOMRange(range);
						$setSelection(rangeSelection);
					}
					const fileNode = $createFileNode(file.name);
					$insertNodes([fileNode]);
					if ($isRootOrShadowRoot(fileNode.getParentOrThrow())) $wrapNodeInElement(fileNode, $createParagraphNode).selectEnd();
					handleUpload(file).then((url) => {
						editor.update(() => {
							fileNode.setUploaded(url.url);
						});
					}).catch((error) => {
						this.logger.error("File upload failed:", error);
						editor.update(() => {
							fileNode.setError("File upload failed : " + error.message);
						});
					});
				});
				return null;
			});
			this.register(registerFileCommand(editor, handleUpload));
		}
		if (this.config?.decorator) this.register(registerFileNodeSelectionObserver(editor));
		this.registerLiteXml();
		this.registerMarkdownWriter();
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(FileNode.getType(), (node, ctx) => {
			if ($isFileNode(node)) return ctx.createXmlNode("file", {
				fileUrl: node.fileUrl || "",
				message: node.message || "",
				name: node.name,
				size: node.size?.toString() || "0",
				status: node.status
			});
			return false;
		});
		litexmlService.registerXMLReader("file", (xmlElement) => {
			const name = xmlElement.getAttribute("name") || "unknown";
			const fileUrl = xmlElement.getAttribute("fileUrl") || "";
			const status = xmlElement.getAttribute("status");
			return INodeHelper.createTypeNode(FileNode.getType(), {
				fileUrl,
				message: xmlElement.getAttribute("message") || "",
				name,
				size: parseInt(xmlElement.getAttribute("size") || "0", 10),
				status
			});
		});
	}
	registerMarkdownWriter() {
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		if (!markdownService) return;
		markdownService.registerMarkdownWriter(FileNode.getType(), (ctx, node) => {
			if ($isFileNode(node)) {
				if (this.config?.markdownWriter) {
					ctx.appendLine(this.config.markdownWriter(node));
					return;
				}
				if (node.status === "pending") ctx.appendLine(`Uploading ${node.name}...`);
				else if (node.status === "error") ctx.appendLine(`Failed to upload ${node.name}: ${node.message}`);
				else ctx.appendLine(`[${node.name}](${node.fileUrl})`);
			}
		});
	}
};
//#endregion
//#region src/plugins/hr/node/HorizontalRuleNode.ts
var HorizontalRuleNode = class HorizontalRuleNode extends DecoratorNode {
	static getType() {
		return "horizontalrule";
	}
	static clone(node) {
		return new HorizontalRuleNode(node.__key);
	}
	static importJSON(serializedNode) {
		return $createHorizontalRuleNode().updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { hr: () => ({
			conversion: $convertHorizontalRuleElement,
			priority: 0
		}) };
	}
	exportDOM() {
		return { element: document.createElement("hr") };
	}
	createDOM(config) {
		const element = document.createElement("div");
		addClassNamesToElement(element, config.theme.hr);
		return element;
	}
	getTextContent() {
		return "\n";
	}
	isInline() {
		return false;
	}
	updateDOM() {
		return false;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator("horizontalrule");
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		return {
			queryDOM: decorator.queryDOM,
			render: decorator.render(this, editor)
		};
	}
};
function $createHorizontalRuleNode() {
	return $applyNodeReplacement(new HorizontalRuleNode());
}
function $convertHorizontalRuleElement() {
	return { node: $createHorizontalRuleNode() };
}
function $isHorizontalRuleNode(node) {
	return node.getType() === HorizontalRuleNode.getType();
}
//#endregion
//#region src/plugins/hr/command/index.ts
const INSERT_HORIZONTAL_RULE_COMMAND = createCommand("INSERT_HORIZONTAL_RULE_COMMAND");
function registerHorizontalRuleCommand(editor) {
	return editor.registerCommand(INSERT_HORIZONTAL_RULE_COMMAND, () => {
		editor.update(() => {
			const hrNode = $createHorizontalRuleNode();
			$insertNodes([hrNode]);
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR);
}
//#endregion
//#region src/plugins/hr/plugin/index.ts
const HRPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "HRPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		kernel.registerNodes([HorizontalRuleNode]);
		kernel.registerThemes({ hr: config?.theme || "" });
		this.registerDecorator(kernel, "horizontalrule", (node, editor) => {
			return config?.decorator ? config.decorator(node, editor) : null;
		});
	}
	onInit(editor) {
		this.register(registerHorizontalRuleCommand(editor));
		this.registerMarkdown();
		this.registerLiteXml();
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(HorizontalRuleNode.getType(), (node, ctx) => {
			if ($isHorizontalRuleNode(node)) return ctx.createXmlNode("hr", {});
			return false;
		});
		litexmlService.registerXMLReader("hr", () => {
			return INodeHelper.createElementNode(HorizontalRuleNode.getType(), {});
		});
	}
	registerMarkdown() {
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownShortCut({
			regExp: /^(---|\*\*\*|___)$/,
			replace: (parentNode, _1, _2, isImport) => {
				const line = $createHorizontalRuleNode();
				if (isImport || parentNode.getNextSibling()) parentNode.replace(line);
				else parentNode.insertBefore(line);
				line.selectNext();
			},
			trigger: "enter",
			type: "element"
		});
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownWriter(HorizontalRuleNode.getType(), (ctx, node) => {
			if ($isHorizontalRuleNode(node)) ctx.appendLine("---\n\n");
		});
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownReader("thematicBreak", () => {
			return INodeHelper.createElementNode("horizontalrule", {});
		});
	}
};
//#endregion
//#region src/plugins/image/node/basie-image-node.ts
var BaseImageNode = class BaseImageNode extends DecoratorNode {
	static clone(node) {
		return new BaseImageNode(node.__src, node.__altText, node.__maxWidth, node.__width, node.__height, node.__key);
	}
	static importJSON(serializedNode) {
		const { altText, height, width, maxWidth, src } = serializedNode;
		return new BaseImageNode(src, altText, maxWidth, width, height);
	}
	static getType() {
		return "image";
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode);
	}
	exportDOM() {
		const element = document.createElement("img");
		element.setAttribute("src", this.__src);
		element.setAttribute("alt", this.__altText);
		element.setAttribute("width", this.__width.toString());
		element.setAttribute("height", this.__height.toString());
		return { element };
	}
	constructor(src, altText, maxWidth, width, height, key) {
		super(key);
		this.__src = src;
		this.__altText = altText;
		this.__maxWidth = maxWidth;
		this.__width = width || "inherit";
		this.__height = height || "inherit";
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			altText: this.getAltText(),
			height: this.__height === "inherit" ? 0 : this.__height,
			maxWidth: this.__maxWidth,
			src: this.getSrc(),
			width: this.__width === "inherit" ? 0 : this.__width
		};
	}
	setWidthAndHeight(width, height) {
		const writable = this.getWritable();
		writable.__width = width;
		writable.__height = height;
	}
	isInline() {
		return true;
	}
	createDOM(config) {
		const span = document.createElement("span");
		const className = config.theme.image;
		if (className !== void 0) span.className = className;
		return span;
	}
	updateDOM() {
		return false;
	}
	getSrc() {
		return this.__src;
	}
	getAltText() {
		return this.__altText;
	}
};
//#endregion
//#region src/plugins/image/node/block-image-node.tsx
var BlockImageNode = class BlockImageNode extends BaseImageNode {
	static {
		this._decorate = () => null;
	}
	static setDecorate(decorate) {
		BlockImageNode._decorate = decorate;
	}
	static getType() {
		return "block-image";
	}
	get isLoading() {
		return this.__loading;
	}
	get status() {
		return this.__status;
	}
	get message() {
		return this.__message;
	}
	get src() {
		return this.__src;
	}
	get altText() {
		return this.__altText;
	}
	get maxWidth() {
		return this.__maxWidth;
	}
	get width() {
		return this.__width;
	}
	get height() {
		return this.__height;
	}
	constructor(opt) {
		super(opt.src, opt.altText, opt.maxWidth, opt.width, opt.height, opt.key);
		this.__loading = true;
		this.__status = "uploaded";
		this.__message = null;
		this.__extra = null;
		this.__status = opt.status ?? "uploaded";
	}
	isInline() {
		return false;
	}
	setMaxWidth(maxWidth) {
		const writable = this.getWritable();
		writable.__maxWidth = maxWidth;
	}
	setWidth(width) {
		const writable = this.getWritable();
		writable.__width = width;
	}
	setStatus(status) {
		const writable = this.getWritable();
		writable.__status = status;
	}
	setUploaded(url) {
		const writable = this.getWritable();
		writable.__loading = false;
		writable.__src = url;
		writable.__status = "uploaded";
	}
	setError(message) {
		const writable = this.getWritable();
		writable.__loading = false;
		writable.__status = "error";
		writable.__message = message;
	}
	static clone(node) {
		return new BlockImageNode({
			altText: node.__altText,
			height: node.__height,
			key: node.__key,
			maxWidth: node.__maxWidth,
			src: node.__src,
			status: node.__status,
			width: node.__width
		});
	}
	static importJSON(serializedNode) {
		const { altText, height, width, maxWidth, src, status } = serializedNode;
		return $createBlockImageNode({
			altText,
			height,
			maxWidth,
			src,
			status,
			width
		}).updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { img: () => ({
			conversion: $convertImageElement$1,
			priority: 0
		}) };
	}
	decorate() {
		return BlockImageNode._decorate(this);
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			status: this.__status
		};
	}
	createDOM(config) {
		const span = document.createElement("div");
		const className = config.theme.blockImage;
		if (className !== void 0) span.className = className;
		return span;
	}
};
function $createBlockImageNode({ altText, height, maxWidth = 4200, src, width, key, status }) {
	return $applyNodeReplacement(new BlockImageNode({
		altText,
		height,
		key,
		maxWidth,
		src,
		status,
		width
	}));
}
function $convertImageElement$1(domNode) {
	const img = domNode;
	if (img.src.startsWith("file:///")) return null;
	const { alt: altText, src, width, height } = img;
	return { node: $createBlockImageNode({
		altText,
		height,
		src,
		width
	}) };
}
function $isBlockImageNode(node) {
	return node.getType() === BlockImageNode.getType();
}
//#endregion
//#region src/plugins/image/node/image-node.tsx
var ImageNode = class ImageNode extends BaseImageNode {
	static {
		this._decorate = () => null;
	}
	static setDecorate(decorate) {
		ImageNode._decorate = decorate;
	}
	static getType() {
		return "image";
	}
	constructor(opt) {
		super(opt.src, opt.altText, opt.maxWidth, opt.width, opt.height, opt.key);
		this.__loading = true;
		this.__status = "uploaded";
		this.__message = null;
		this.__extra = null;
		this.__status = opt.status ?? "uploaded";
	}
	get isLoading() {
		return this.__loading;
	}
	get status() {
		return this.__status;
	}
	get message() {
		return this.__message;
	}
	get src() {
		return this.__src;
	}
	get altText() {
		return this.__altText;
	}
	get maxWidth() {
		return this.__maxWidth;
	}
	get width() {
		return this.__width;
	}
	get height() {
		return this.__height;
	}
	setMaxWidth(maxWidth) {
		const writable = this.getWritable();
		writable.__maxWidth = maxWidth;
	}
	setStatus(status) {
		const writable = this.getWritable();
		writable.__status = status;
	}
	setWidth(width) {
		const writable = this.getWritable();
		writable.__width = width;
	}
	setUploaded(url) {
		const writable = this.getWritable();
		writable.__loading = false;
		writable.__src = url;
		writable.__status = "uploaded";
	}
	setError(message) {
		const writable = this.getWritable();
		writable.__loading = false;
		writable.__status = "error";
		writable.__message = message;
	}
	static clone(node) {
		return new ImageNode({
			altText: node.__altText,
			height: node.__height,
			key: node.__key,
			maxWidth: node.__maxWidth,
			src: node.__src,
			status: node.__status,
			width: node.__width
		});
	}
	static importJSON(serializedNode) {
		const { altText, height, width, maxWidth, src, status } = serializedNode;
		return $createImageNode({
			altText,
			height,
			maxWidth,
			src,
			status,
			width
		}).updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { img: () => ({
			conversion: $convertImageElement,
			priority: 0
		}) };
	}
	decorate() {
		return ImageNode._decorate(this);
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			status: this.__status
		};
	}
};
function $createImageNode({ altText, height, maxWidth = 500, src, width, key, status }) {
	return $applyNodeReplacement(new ImageNode({
		altText,
		height,
		key,
		maxWidth,
		src,
		status,
		width
	}));
}
function $convertImageElement(domNode) {
	const img = domNode;
	if (img.src.startsWith("file:///")) return null;
	const { alt: altText, src, width, height } = img;
	return { node: $createImageNode({
		altText,
		height,
		src,
		width
	}) };
}
function $isImageNode(node) {
	return node.getType() === ImageNode.getType();
}
//#endregion
//#region src/plugins/image/command/index.ts
const logger$1 = createDebugLogger("plugin", "image");
const INSERT_IMAGE_COMMAND = createCommand("INSERT_IMAGE_COMMAND");
function isImageFile(file) {
	return file.type.startsWith("image/");
}
function registerImageCommand(editor, handleUpload, defaultBlockImage = false) {
	return editor.registerCommand(INSERT_IMAGE_COMMAND, (payload) => {
		if (!editor.isEditable()) return false;
		const { file, range, block, maxWidth } = payload;
		const isBlock = block ?? defaultBlockImage;
		if (!isImageFile(file)) return false;
		const placeholderURL = URL.createObjectURL(file);
		editor.update(() => {
			if (range) {
				const rangeSelection = $createRangeSelection();
				if (range !== null && range !== void 0) rangeSelection.applyDOMRange(range);
				$setSelection(rangeSelection);
			}
			const imageNode = isBlock ? $createBlockImageNode({
				altText: file.name,
				maxWidth: maxWidth || 800,
				src: placeholderURL,
				status: "loading"
			}) : $createImageNode({
				altText: file.name,
				maxWidth: maxWidth || 800,
				src: placeholderURL,
				status: "loading"
			});
			$insertNodes([imageNode]);
			if (!isBlock && $isRootOrShadowRoot(imageNode.getParentOrThrow())) $wrapNodeInElement(imageNode, $createParagraphNode).selectEnd();
			handleUpload(file).then((res) => {
				editor.update(() => {
					imageNode.setUploaded(res.url);
				});
			}).catch((error) => {
				logger$1.error("❌ Image upload failed:", error);
				editor.update(() => {
					imageNode.setError("Image upload failed : " + error.message);
				});
			});
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR);
}
//#endregion
//#region src/plugins/image/plugin/index.ts
const ImagePlugin = class extends KernelPlugin {
	static {
		this.pluginName = "ImagePlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		kernel.registerNodes([ImageNode, BlockImageNode]);
		ImageNode.setDecorate(config?.renderImage ?? (() => null));
		BlockImageNode.setDecorate(config?.renderImage ?? (() => null));
		if (config?.theme) kernel.registerThemes(config.theme);
	}
	onInit(editor) {
		if (this.config?.handleUpload) this.register(registerImageCommand(editor, this.config.handleUpload, this.config?.defaultBlockImage !== false));
		this.registerMarkdown();
		this.registerLiteXml();
		this.registerINode();
		this.registerUpload(editor);
		if (this.config?.needRehost && this.config?.handleRehost) {
			const needRehost = this.config.needRehost;
			const handleRehost = this.config.handleRehost;
			this.register(editor.registerNodeTransform(ImageNode, (node) => {
				if (node.status === "uploaded" && needRehost(node.src)) {
					node.setStatus("loading");
					handleRehost(node.src).then(({ url }) => {
						editor.update(() => {
							node.setUploaded(url);
						});
					}).catch(() => {
						editor.update(() => {
							node.setError("Rehost failed");
						});
					});
				}
			}));
			this.register(editor.registerNodeTransform(BlockImageNode, (node) => {
				if (node.status === "uploaded" && needRehost(node.src)) {
					node.setStatus("loading");
					handleRehost(node.src).then(({ url }) => {
						editor.update(() => {
							node.setUploaded(url);
						});
					}).catch(() => {
						editor.update(() => {
							node.setError("Rehost failed");
						});
					});
				}
			}));
		}
	}
	registerUpload(editor) {
		const uploadService = this.kernel.requireService(IUploadService);
		if (!uploadService) return;
		if (!this.config?.handleUpload) return;
		uploadService.registerUpload(async (file, from, range) => {
			const imageWidth = await this.config?.getImageWidth?.(file);
			if (!editor.isEditable()) return false;
			return editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
				block: this.config?.defaultBlockImage !== false,
				file,
				maxWidth: imageWidth,
				range
			});
		}, 0);
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(ImageNode.getType(), (node, ctx) => {
			if ($isImageNode(node)) {
				const attributes = { src: node.src };
				if (node.altText) attributes.alt = node.altText;
				return ctx.createXmlNode("img", attributes);
			}
			return false;
		});
		litexmlService.registerXMLWriter(BlockImageNode.getType(), (node, ctx) => {
			if ($isBlockImageNode(node)) {
				const attributes = {
					block: "true",
					src: node.src
				};
				if (node.altText) attributes.alt = node.altText;
				if (node.width) attributes.width = String(node.width);
				if (node.maxWidth) attributes["max-width"] = String(node.maxWidth);
				return ctx.createXmlNode("img", attributes);
			}
			return false;
		});
		litexmlService.registerXMLReader("img", (xmlNode) => {
			if (this.config?.defaultBlockImage !== false) return INodeHelper.createElementNode(BlockImageNode.getType(), {
				altText: xmlNode.getAttribute("alt") || "",
				maxWidth: xmlNode.getAttribute("max-width") ? parseInt(xmlNode.getAttribute("max-width"), 10) : void 0,
				src: xmlNode.getAttribute("src") || "",
				width: xmlNode.getAttribute("width") ? parseInt(xmlNode.getAttribute("width"), 10) : void 0
			});
			if (xmlNode.getAttribute("block") === "true") return INodeHelper.createElementNode(BlockImageNode.getType(), {
				altText: xmlNode.getAttribute("alt") || "",
				maxWidth: xmlNode.getAttribute("max-width") ? parseInt(xmlNode.getAttribute("max-width"), 10) : void 0,
				src: xmlNode.getAttribute("src") || "",
				width: xmlNode.getAttribute("width") ? parseInt(xmlNode.getAttribute("width"), 10) : void 0
			});
			else return INodeHelper.createElementNode(ImageNode.getType(), {
				altText: xmlNode.getAttribute("alt") || "",
				maxWidth: xmlNode.getAttribute("max-width") ? parseInt(xmlNode.getAttribute("max-width"), 10) : void 0,
				src: xmlNode.getAttribute("src") || "",
				width: xmlNode.getAttribute("width") ? parseInt(xmlNode.getAttribute("width"), 10) : void 0
			});
		});
	}
	registerMarkdown() {
		const defaultBlockImage = this.config?.defaultBlockImage !== false;
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		if (!markdownService) return;
		markdownService.registerMarkdownWriter(ImageNode.getType(), (ctx, node) => {
			if ($isImageNode(node)) ctx.appendLine(`![${node.altText}](${node.src})`);
		});
		markdownService.registerMarkdownWriter(BlockImageNode.getType(), (ctx, node) => {
			if ($isBlockImageNode(node)) ctx.appendLine(`![${node.altText}](${node.src})\n\n`);
		});
		markdownService.registerMarkdownReader("image", (node) => {
			const altText = node.alt;
			const src = node.url;
			return INodeHelper.createTypeNode(defaultBlockImage ? BlockImageNode.getType() : ImageNode.getType(), {
				altText,
				showCaption: false,
				src,
				version: 1
			});
		});
	}
	registerINode() {
		const service = this.kernel.requireService(INodeService);
		if (!service) return;
		service.registerProcessNodeTree(({ root }) => {
			const loopNodes = (node) => {
				if ("children" in node && Array.isArray(node.children)) {
					if (node.type === "paragraph" && node.children.length === 1 && node.children[0].type === BlockImageNode.getType()) return node.children[0];
					node.children = node.children.map((child) => {
						return loopNodes(child);
					});
				}
				return node;
			};
			root.children = root.children.map((child) => {
				return loopNodes(child);
			});
		});
	}
};
//#endregion
//#region src/plugins/link/service/i-link-service.ts
const ILinkService = genServiceId("LinkService");
const DEFAULT_LABELS = {
	convertToBlockCard: "Convert to block card",
	convertToCard: "Convert to card",
	convertToIframe: "Convert to iframe",
	convertToLink: "Convert to link",
	convertToSchema: "Convert to schema"
};
var LinkProtocolPolicy = class {
	constructor() {
		this.allowedProtocols = /* @__PURE__ */ new Set([
			"http:",
			"https:",
			"mailto:",
			"sms:",
			"tel:"
		]);
	}
	getAllowedProtocols() {
		return this.allowedProtocols;
	}
	setAllowedProtocols(protocols) {
		this.allowedProtocols = new Set(protocols.map(normalizeProtocol));
	}
};
var LinkRuleRegistry = class {
	constructor() {
		this.embedRules = [];
		this.schemaRules = [];
	}
	getEmbedRule(url, context) {
		return this.embedRules.find((rule) => rule.match(url, context)) || null;
	}
	getSchemaRule(url, context, parseSchemaUrl) {
		const schema = context.schema === void 0 ? parseSchemaUrl(url) : context.schema;
		return this.schemaRules.find((rule) => rule.match(url, {
			...context,
			schema
		})) || null;
	}
	getSchemaRuleById(schemaType) {
		return this.schemaRules.find((rule) => rule.id === schemaType) || null;
	}
	setEmbedRules(rules = []) {
		this.embedRules = rules;
	}
	setSchemaRules(rules = []) {
		this.schemaRules = rules;
	}
};
var LegacySchemaLinkRegistry = class {
	constructor() {
		this.protocols = /* @__PURE__ */ new Set();
	}
	hasSchemaLinkRenderer(url) {
		try {
			const { protocol } = new URL(url);
			return this.protocols.has(protocol);
		} catch {
			return false;
		}
	}
	setSchemaLinkRenderers(renderers = []) {
		this.protocols = new Set(renderers.map(({ protocol }) => normalizeProtocol(protocol)));
	}
};
var LinkToolbarController = class {
	constructor() {
		this.baseEnabled = true;
		this.labels = DEFAULT_LABELS;
		this.toolbarActions = [];
		this.toolbarSuppressions = /* @__PURE__ */ new Set();
	}
	get enabled() {
		return this.baseEnabled && this.toolbarSuppressions.size === 0;
	}
	getLabels() {
		return this.labels;
	}
	getToolbarActions(context) {
		return this.toolbarActions.filter((action) => action.visible?.(context) ?? true);
	}
	setLabels(labels) {
		this.labels = {
			...DEFAULT_LABELS,
			...labels
		};
	}
	setToolbarActions(actions = []) {
		this.toolbarActions = actions;
	}
	setEnabled(enable) {
		const previousEnabled = this.enabled;
		this.baseEnabled = enable;
		return previousEnabled !== this.enabled;
	}
	suppress(reason = "unknown") {
		const previousEnabled = this.enabled;
		const token = Symbol(reason);
		this.toolbarSuppressions.add(token);
		return {
			changed: previousEnabled !== this.enabled,
			token
		};
	}
	restore(token) {
		const previousEnabled = this.enabled;
		if (!this.toolbarSuppressions.delete(token)) return false;
		return previousEnabled !== this.enabled;
	}
};
var LinkService = class extends EventEmitter {
	constructor(..._args) {
		super(..._args);
		this.cardMetadataLoadingKeys = /* @__PURE__ */ new Set();
		this.protocolPolicy = new LinkProtocolPolicy();
		this.legacySchemaLinkRegistry = new LegacySchemaLinkRegistry();
		this.ruleRegistry = new LinkRuleRegistry();
		this.toolbarController = new LinkToolbarController();
		this.toolbarItems = /* @__PURE__ */ new Map();
	}
	get enableLinkToolbar() {
		return this.toolbarController.enabled;
	}
	getAllowedProtocols() {
		return this.protocolPolicy.getAllowedProtocols();
	}
	getEmbedRule(url, context) {
		return this.ruleRegistry.getEmbedRule(url, context);
	}
	getLabels() {
		return this.toolbarController.getLabels();
	}
	hasSchemaLinkRenderer(url) {
		return this.legacySchemaLinkRegistry.hasSchemaLinkRenderer(url);
	}
	isCardMetadataLoading(nodeKey) {
		return this.cardMetadataLoadingKeys.has(nodeKey);
	}
	setCardMetadataLoading(nodeKey, loading) {
		if (!(loading ? !this.cardMetadataLoadingKeys.has(nodeKey) : this.cardMetadataLoadingKeys.has(nodeKey))) return;
		if (loading) this.cardMetadataLoadingKeys.add(nodeKey);
		else this.cardMetadataLoadingKeys.delete(nodeKey);
		this.emit("cardMetadataChange");
	}
	getSchemaRule(url, context) {
		return this.ruleRegistry.getSchemaRule(url, context, (url) => this.parseSchemaUrl(url));
	}
	getToolbarActions(context) {
		return this.toolbarController.getToolbarActions(context);
	}
	parseSchemaUrl(url) {
		try {
			const parsedUrl = new URL(url);
			return {
				hash: parsedUrl.hash,
				host: parsedUrl.host,
				params: Object.fromEntries(parsedUrl.searchParams.entries()),
				pathname: parsedUrl.pathname,
				protocol: parsedUrl.protocol,
				raw: url,
				search: parsedUrl.search
			};
		} catch {
			return null;
		}
	}
	updateConfig(config) {
		this.setAllowedProtocols([
			"http:",
			"https:",
			"mailto:",
			"sms:",
			"tel:",
			...config?.schemaLinkRenderers?.map(({ protocol }) => protocol) || [],
			...config?.allowedProtocols || []
		]);
		this.setEmbedRules(config?.linkEmbedRules);
		this.setLabels(config?.labels);
		this.setSchemaLinkRenderers(config?.schemaLinkRenderers);
		this.setSchemaRules([...config?.schemaRules || [], ...createLegacySchemaRules(config?.schemaLinkRenderers)]);
		this.setToolbarActions(config?.toolbarActions);
	}
	setAllowedProtocols(protocols) {
		this.protocolPolicy.setAllowedProtocols(protocols);
	}
	setEmbedRules(rules = []) {
		this.ruleRegistry.setEmbedRules(rules);
	}
	setLabels(labels) {
		this.toolbarController.setLabels(labels);
	}
	setSchemaLinkRenderers(renderers = []) {
		this.legacySchemaLinkRegistry.setSchemaLinkRenderers(renderers);
	}
	setSchemaRules(rules = []) {
		this.ruleRegistry.setSchemaRules(rules);
	}
	setToolbarActions(actions = []) {
		this.toolbarController.setToolbarActions(actions);
		this.emit("change");
	}
	getToolbarItems(context) {
		return Array.from(this.toolbarItems.values()).filter((item) => item.when ? item.when(context) : true).sort((a, b) => (a.order || 0) - (b.order || 0));
	}
	registerToolbarItem(item) {
		this.toolbarItems.set(item.key, item);
		this.emit("change");
		return () => {
			this.toolbarItems.delete(item.key);
			this.emit("change");
		};
	}
	setLinkToolbar(enable) {
		if (this.toolbarController.setEnabled(enable)) this.emit("linkToolbarChange", enable);
	}
	suppressLinkToolbar(reason = "unknown") {
		const { changed, token } = this.toolbarController.suppress(reason);
		if (changed) this.emit("linkToolbarChange", this.toolbarController.enabled);
		return token;
	}
	restoreLinkToolbar(token) {
		if (this.toolbarController.restore(token)) this.emit("linkToolbarChange", this.toolbarController.enabled);
	}
	subscribe(listener) {
		this.on("change", listener);
		return () => {
			this.off("change", listener);
		};
	}
	subscribeCardMetadata(listener) {
		this.on("cardMetadataChange", listener);
		return () => {
			this.off("cardMetadataChange", listener);
		};
	}
};
function normalizeProtocol(protocol) {
	return `${protocol.split(":")[0]}:`;
}
function createLegacySchemaRules(renderers = []) {
	return renderers.map(({ protocol }) => {
		const normalizedProtocol = normalizeProtocol(protocol);
		return {
			id: normalizedProtocol.replace(":", ""),
			match: (url) => {
				try {
					return new URL(url).protocol === normalizedProtocol;
				} catch {
					return false;
				}
			}
		};
	});
}
//#endregion
//#region src/plugins/link/node/LinkNode.ts
const logger = createDebugLogger("plugin", "link");
const SUPPORTED_URL_PROTOCOLS$1 = /* @__PURE__ */ new Set([
	"http:",
	"https:",
	"mailto:",
	"sms:",
	"tel:"
]);
const HOVER_LINK_COMMAND = createCommand("HOVER_LINK_COMMAND");
const HOVER_OUT_LINK_COMMAND = createCommand("HOVER_OUT_LINK_COMMAND");
/** @noInheritDoc */
var LinkNode = class LinkNode extends ElementNode {
	static getType() {
		return "link";
	}
	static clone(node) {
		return new LinkNode(node.__url, {
			rel: node.__rel,
			target: node.__target,
			title: node.__title
		}, node.__key);
	}
	constructor(url = "", attributes = {}, key) {
		super(key);
		const { target = null, rel = null, title = null } = attributes;
		this.__url = url;
		this.__target = target;
		this.__rel = rel;
		this.__title = title;
	}
	createDOM(config, editor) {
		logger.debug("🔍 config", config);
		const element = document.createElement("a");
		this.updateLinkDOM(null, element, config);
		addClassNamesToElement(element, config.theme.link);
		element.addEventListener("mouseenter", (event) => {
			if (event.target instanceof HTMLElement) {
				event.target.classList.add("hover");
				editor.dispatchCommand(HOVER_LINK_COMMAND, {
					event,
					node: this
				});
			}
		});
		element.addEventListener("mouseleave", (event) => {
			if (event.target instanceof HTMLElement) {
				event.target.classList.remove("hover");
				editor.dispatchCommand(HOVER_OUT_LINK_COMMAND, { event });
			}
		});
		return element;
	}
	updateLinkDOM(prevNode, anchor, _config) {
		if (isHTMLAnchorElement(anchor)) {
			const linkService = getLinkServiceFromConfig(_config);
			if (!prevNode || prevNode.__url !== this.__url) anchor.href = this.sanitizeUrl(this.__url, linkService?.getAllowedProtocols());
			for (const attr of [
				"target",
				"rel",
				"title"
			]) {
				const key = `__${attr}`;
				const value = this[key];
				if (!prevNode || prevNode[key] !== value) {
					if (value) anchor[attr] = value;
					else anchor.removeAttribute(attr);
				}
			}
		}
	}
	updateDOM(prevNode, anchor, config) {
		this.updateLinkDOM(prevNode, anchor, config);
		return false;
	}
	static importDOM() {
		return { a: () => ({
			conversion: $convertAnchorElement,
			priority: 1
		}) };
	}
	static importJSON(serializedNode) {
		return $createLinkNode().updateFromJSON(serializedNode);
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setURL(serializedNode.url).setRel(serializedNode.rel || null).setTarget(serializedNode.target || null).setTitle(serializedNode.title || null);
	}
	sanitizeUrl(url, allowedProtocols = SUPPORTED_URL_PROTOCOLS$1) {
		url = formatUrl(url);
		try {
			const parsedUrl = new URL(formatUrl(url));
			if (!allowedProtocols.has(parsedUrl.protocol)) return "about:blank";
		} catch {
			return url;
		}
		return url;
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			rel: this.getRel(),
			target: this.getTarget(),
			title: this.getTitle(),
			url: this.getURL()
		};
	}
	getURL() {
		return this.getLatest().__url;
	}
	setURL(url) {
		const writable = this.getWritable();
		writable.__url = url;
		return writable;
	}
	getTarget() {
		return this.getLatest().__target;
	}
	setTarget(target) {
		const writable = this.getWritable();
		writable.__target = target;
		return writable;
	}
	getRel() {
		return this.getLatest().__rel;
	}
	setRel(rel) {
		const writable = this.getWritable();
		writable.__rel = rel;
		return writable;
	}
	getTitle() {
		return this.getLatest().__title;
	}
	setTitle(title) {
		const writable = this.getWritable();
		writable.__title = title;
		return writable;
	}
	insertNewAfter(_, restoreSelection = true) {
		const linkNode = $createLinkNode(this.__url, {
			rel: this.__rel,
			target: this.__target,
			title: this.__title
		});
		this.insertAfter(linkNode, restoreSelection);
		return linkNode;
	}
	canInsertTextBefore() {
		return false;
	}
	canInsertTextAfter() {
		return false;
	}
	canBeEmpty() {
		return false;
	}
	isInline() {
		return true;
	}
	extractWithChild(child, selection) {
		if (!$isRangeSelection(selection)) return false;
		const anchorNode = selection.anchor.getNode();
		const focusNode = selection.focus.getNode();
		return this.isParentOf(anchorNode) && this.isParentOf(focusNode) && selection.getTextContent().length > 0;
	}
	isEmailURI() {
		return this.__url.startsWith("mailto:");
	}
	isWebSiteURI() {
		return this.__url.startsWith("https://") || this.__url.startsWith("http://");
	}
	getDOMSlot(element) {
		return super.getDOMSlot(element);
	}
};
function getLinkServiceFromConfig(config) {
	return getKernelFromEditorConfig(config)?.requireService(ILinkService) || null;
}
function $convertAnchorElement(domNode) {
	let node = null;
	if (isHTMLAnchorElement(domNode)) {
		const content = domNode.textContent;
		if (content !== null && content !== "" || domNode.children.length > 0) node = $createLinkNode(domNode.getAttribute("href") || "", {
			rel: domNode.getAttribute("rel"),
			target: domNode.getAttribute("target"),
			title: domNode.getAttribute("title")
		});
	}
	return { node };
}
/**
* Takes a URL and creates a LinkNode.
* @param url - The URL the LinkNode should direct to.
* @param attributes - Optional HTML a tag attributes \\{ target, rel, title \\}
* @returns The LinkNode.
*/
function $createLinkNode(url = "", attributes) {
	return $applyNodeReplacement(new LinkNode(url, attributes));
}
/**
* Determines if node is a LinkNode.
* @param node - The node to be checked.
* @returns true if node is a LinkNode, false otherwise.
*/
function $isLinkNode(node) {
	return node instanceof LinkNode || node?.getType?.() === "link" || node?.getType?.() === "autolink";
}
var AutoLinkNode = class AutoLinkNode extends LinkNode {
	constructor(url = "", attributes = {}, key) {
		super(url, attributes, key);
		this.__isUnlinked = attributes.isUnlinked !== void 0 && attributes.isUnlinked !== null ? attributes.isUnlinked : false;
	}
	static getType() {
		return "autolink";
	}
	static clone(node) {
		return new AutoLinkNode(node.__url, {
			isUnlinked: node.__isUnlinked,
			rel: node.__rel,
			target: node.__target,
			title: node.__title
		}, node.__key);
	}
	getIsUnlinked() {
		return this.__isUnlinked;
	}
	setIsUnlinked(value) {
		const self = this.getWritable();
		self.__isUnlinked = value;
		return self;
	}
	createDOM(config, editor) {
		logger.debug("🔍 config", config);
		if (this.__isUnlinked) return document.createElement("span");
		else return super.createDOM(config, editor);
	}
	updateDOM(prevNode, anchor, config) {
		return super.updateDOM(prevNode, anchor, config) || prevNode.__isUnlinked !== this.__isUnlinked;
	}
	static importJSON(serializedNode) {
		return $createAutoLinkNode().updateFromJSON(serializedNode);
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setIsUnlinked(serializedNode.isUnlinked || false);
	}
	static importDOM() {
		return null;
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			isUnlinked: this.__isUnlinked
		};
	}
	insertNewAfter(selection, restoreSelection = true) {
		const element = this.getParentOrThrow().insertNewAfter(selection, restoreSelection);
		if ($isElementNode(element)) {
			const linkNode = $createAutoLinkNode(this.__url, {
				isUnlinked: this.__isUnlinked,
				rel: this.__rel,
				target: this.__target,
				title: this.__title
			});
			element.append(linkNode);
			return linkNode;
		}
		return null;
	}
};
/**
* Takes a URL and creates an AutoLinkNode. AutoLinkNodes are generally automatically generated
* during typing, which is especially useful when a button to generate a LinkNode is not practical.
* @param url - The URL the LinkNode should direct to.
* @param attributes - Optional HTML a tag attributes. \\{ target, rel, title \\}
* @returns The LinkNode.
*/
function $createAutoLinkNode(url = "", attributes) {
	return $applyNodeReplacement(new AutoLinkNode(url, attributes));
}
/**
* Determines if node is an AutoLinkNode.
* @param node - The node to be checked.
* @returns true if node is an AutoLinkNode, false otherwise.
*/
function $isAutoLinkNode(node) {
	return node instanceof AutoLinkNode;
}
const TOGGLE_LINK_COMMAND = createCommand("TOGGLE_LINK_COMMAND");
function $getPointNode(point, offset) {
	if (point.type === "element") {
		const node = point.getNode();
		assert($isElementNode(node), "$getPointNode: element point is not an ElementNode");
		return node.getChildren()[point.offset + offset] || null;
	}
	return null;
}
/**
* Preserve the logical start/end of a RangeSelection in situations where
* the point is an element that may be reparented in the callback.
*
* @param $fn The function to run
* @returns The result of the callback
*/
function $withSelectedNodes($fn) {
	const initialSelection = $getSelection();
	if (!$isRangeSelection(initialSelection)) return $fn();
	const normalized = $normalizeSelection__EXPERIMENTAL(initialSelection);
	const isBackwards = normalized.isBackward();
	const anchorNode = $getPointNode(normalized.anchor, isBackwards ? -1 : 0);
	const focusNode = $getPointNode(normalized.focus, isBackwards ? 0 : -1);
	const rval = $fn();
	if (anchorNode || focusNode) {
		const updatedSelection = $getSelection();
		if ($isRangeSelection(updatedSelection)) {
			const finalSelection = updatedSelection.clone();
			if (anchorNode) {
				const anchorParent = anchorNode.getParent();
				if (anchorParent) finalSelection.anchor.set(anchorParent.getKey(), anchorNode.getIndexWithinParent() + (isBackwards ? 1 : 0), "element");
			}
			if (focusNode) {
				const focusParent = focusNode.getParent();
				if (focusParent) finalSelection.focus.set(focusParent.getKey(), focusNode.getIndexWithinParent() + (isBackwards ? 0 : 1), "element");
			}
			$setSelection($normalizeSelection__EXPERIMENTAL(finalSelection));
		}
	}
	return rval;
}
/**
* Generates or updates a LinkNode. It can also delete a LinkNode if the URL is null,
* but saves any children and brings them up to the parent node.
* @param url - The URL the link directs to.
* @param attributes - Optional HTML a tag attributes. \\{ target, rel, title \\}
*/
function $toggleLink(url, attributes = {}) {
	const { target, title } = attributes;
	const rel = attributes.rel === void 0 ? "noreferrer" : attributes.rel;
	const selection = $getSelection();
	if (selection === null || !$isRangeSelection(selection) && !$isNodeSelection(selection)) return;
	if ($isNodeSelection(selection)) {
		const nodes = selection.getNodes();
		if (nodes.length === 0) return;
		nodes.forEach((node) => {
			if (url === null) {
				const linkParent = $findMatchingParent(node, (parent) => !$isAutoLinkNode(parent) && $isLinkNode(parent));
				if (linkParent) {
					linkParent.insertBefore(node);
					if (linkParent.getChildren().length === 0) linkParent.remove();
				}
			} else {
				const existingLink = $findMatchingParent(node, (parent) => !$isAutoLinkNode(parent) && $isLinkNode(parent));
				if (existingLink) {
					existingLink.setURL(url);
					if (target !== void 0) existingLink.setTarget(target);
					if (rel !== void 0) existingLink.setRel(rel);
				} else {
					const linkNode = $createLinkNode(url, {
						rel,
						target
					});
					node.insertBefore(linkNode);
					linkNode.append(node);
				}
			}
		});
		return;
	}
	const nodes = selection.extract();
	if (url === null) {
		nodes.forEach((node) => {
			const parentLink = $findMatchingParent(node, (parent) => !$isAutoLinkNode(parent) && $isLinkNode(parent));
			if (parentLink) {
				const children = parentLink.getChildren();
				for (const child of children) parentLink.insertBefore(child);
				parentLink.remove();
			}
		});
		return;
	}
	const updatedNodes = /* @__PURE__ */ new Set();
	const updateLinkNode = (linkNode) => {
		if (updatedNodes.has(linkNode.getKey())) return;
		updatedNodes.add(linkNode.getKey());
		linkNode.setURL(url);
		if (target !== void 0) linkNode.setTarget(target);
		if (rel !== void 0) linkNode.setRel(rel);
		if (title !== void 0) linkNode.setTitle(title);
	};
	if (nodes.length === 1) {
		const firstNode = nodes[0];
		const linkNode = $getAncestor(firstNode, $isLinkNode);
		if (linkNode !== null) return updateLinkNode(linkNode);
	}
	$withSelectedNodes(() => {
		let linkNode = null;
		for (const node of nodes) {
			if (!node.isAttached()) continue;
			const parentLinkNode = $getAncestor(node, $isLinkNode);
			if (parentLinkNode) {
				updateLinkNode(parentLinkNode);
				continue;
			}
			if ($isElementNode(node)) {
				if (!node.isInline()) continue;
				if ($isLinkNode(node)) {
					if (!$isAutoLinkNode(node) && (linkNode === null || !linkNode.getParentOrThrow().isParentOf(node))) {
						updateLinkNode(node);
						linkNode = node;
						continue;
					}
					for (const child of node.getChildren()) node.insertBefore(child);
					node.remove();
					continue;
				}
			}
			const prevLinkNode = node.getPreviousSibling();
			if ($isLinkNode(prevLinkNode) && prevLinkNode.is(linkNode)) {
				prevLinkNode.append(node);
				continue;
			}
			linkNode = $createLinkNode(url, {
				rel,
				target,
				title
			});
			node.insertAfter(linkNode);
			linkNode.append(node);
		}
	});
}
function $getAncestor(node, predicate) {
	let parent = node;
	while (parent !== null && parent.getParent() !== null && !predicate(parent)) parent = parent.getParentOrThrow();
	return predicate(parent) ? parent : null;
}
const PHONE_NUMBER_REGEX = /^\+?[\d\s()-]{5,}$/;
/**
* Formats a URL string by adding appropriate protocol if missing
*
* @param url - URL to format
* @returns Formatted URL with appropriate protocol
*/
function formatUrl(url) {
	if (/^[a-z][\d+.a-z-]*:/i.test(url)) return url;
	else if (/^[#./]/.test(url)) return url;
	else if (url.includes("@")) return `mailto:${url}`;
	else if (PHONE_NUMBER_REGEX.test(url)) return `tel:${url}`;
	return url;
}
//#endregion
//#region src/plugins/link/command/index.ts
const INSERT_LINK_COMMAND = createCommand("INSERT_LINK_COMMAND");
const UPDATE_LINK_TEXT_COMMAND = createCommand("UPDATE_LINK_TEXT_COMMAND");
const UNLINK_LINK_COMMAND = createCommand("UNLINK_LINK_COMMAND");
function registerLinkCommand(editor) {
	return mergeRegister(editor.registerCommand(INSERT_LINK_COMMAND, (payload) => {
		const { url, title = url } = payload;
		editor.update(() => {
			const linkNode = $createLinkNode(url, { title });
			const textNode = $createTextNode(title);
			linkNode.append(textNode);
			$insertNodes([linkNode]);
		});
		return false;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(UPDATE_LINK_TEXT_COMMAND, (payload) => {
		const { key, text } = payload;
		editor.update(() => {
			const linkNode = $getNodeByKey(key);
			if (linkNode) {
				const newLinkNode = $createLinkNode(linkNode.getURL(), { title: text });
				const textNode = $createTextNode(text);
				newLinkNode.append(textNode);
				linkNode?.replace(newLinkNode);
				newLinkNode.select(1);
			}
		});
		return false;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(UNLINK_LINK_COMMAND, ({ key }) => {
		editor.update(() => {
			const node = $getNodeByKey(key);
			if (!$isLinkNode(node)) return;
			let selection = $getSelection();
			if (!selection || !$isRangeSelection(selection)) {
				$setSelection($createRangeSelection());
				selection = $getSelection();
			}
			const first = node.getFirstDescendant();
			const last = node.getLastDescendant();
			if (selection && $isRangeSelection(selection) && $isTextNode(first) && $isTextNode(last)) {
				selection.anchor.set(first.getKey(), 0, "text");
				selection.focus.set(last.getKey(), last.getTextContentSize(), "text");
				editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
				return;
			}
			const children = node.getChildren();
			for (const child of children) node.insertBefore(child);
			node.remove();
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR));
}
createCommand();
var LinkCardNode = class LinkCardNode extends DecoratorNode {
	static getType() {
		return "link-card";
	}
	static clone(node) {
		return new LinkCardNode(node.__url, node.__title, node.__icon, node.__description, node.__openTarget, node.__key);
	}
	static importJSON(serializedNode) {
		return $createLinkCardNode({
			description: serializedNode.description,
			icon: serializedNode.icon,
			openTarget: serializedNode.openTarget,
			title: serializedNode.title,
			url: serializedNode.url
		}).updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { a: (node) => {
			if (node instanceof HTMLAnchorElement && node.dataset.linkCard === "true" && node.dataset.linkCardLayout !== "block") return {
				conversion: $convertLinkCardElement,
				priority: 2
			};
			return null;
		} };
	}
	constructor(url, title, icon, description, openTarget, key) {
		super(key);
		this.__url = url;
		this.__title = title || url;
		this.__icon = icon || "";
		this.__description = description || "";
		this.__openTarget = openTarget ?? "_blank";
	}
	createDOM(config, editor) {
		const element = document.createElement("span");
		element.dataset.linkCard = "true";
		addClassNamesToElement(element, config.theme.linkCard);
		element.addEventListener("mouseenter", (event) => {
			if (event.target instanceof HTMLElement) {
				event.target.classList.add("hover");
				editor.dispatchCommand(HOVER_LINK_COMMAND, {
					event,
					node: this
				});
			}
		});
		element.addEventListener("mouseleave", (event) => {
			if (event.target instanceof HTMLElement) {
				event.target.classList.remove("hover");
				editor.dispatchCommand(HOVER_OUT_LINK_COMMAND, { event });
			}
		});
		return element;
	}
	updateDOM() {
		return false;
	}
	isInline() {
		return true;
	}
	isKeyboardSelectable() {
		return true;
	}
	exportDOM() {
		const element = document.createElement("a");
		element.dataset.linkCard = "true";
		element.dataset.icon = this.getIcon();
		element.dataset.description = this.getDescription();
		if (this.getOpenTarget()) element.target = this.getOpenTarget();
		element.href = this.getURL();
		element.textContent = this.getTitle();
		return { element };
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			description: this.getDescription(),
			icon: this.getIcon(),
			openTarget: this.getOpenTarget(),
			title: this.getTitle(),
			url: this.getURL()
		};
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setURL(serializedNode.url).setTitle(serializedNode.title).setIcon(serializedNode.icon).setDescription(serializedNode.description).setOpenTarget(serializedNode.openTarget ?? "_blank");
	}
	getTextContent() {
		return this.getTitle();
	}
	getURL() {
		return this.getLatest().__url;
	}
	setURL(url) {
		const writable = this.getWritable();
		writable.__url = url;
		return writable;
	}
	getTitle() {
		return this.getLatest().__title || this.getURL();
	}
	setTitle(title) {
		const writable = this.getWritable();
		writable.__title = title || this.getURL();
		return writable;
	}
	getIcon() {
		return this.getLatest().__icon;
	}
	setIcon(icon) {
		const writable = this.getWritable();
		writable.__icon = icon || "";
		return writable;
	}
	getDescription() {
		return this.getLatest().__description;
	}
	setDescription(description) {
		const writable = this.getWritable();
		writable.__description = description || "";
		return writable;
	}
	getOpenTarget() {
		return this.getLatest().__openTarget;
	}
	setOpenTarget(openTarget) {
		const writable = this.getWritable();
		writable.__openTarget = openTarget ?? "_blank";
		return writable;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator(LinkCardNode.getType());
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		return decorator.render(this, editor);
	}
};
function $createLinkCardNode(payload) {
	return $applyNodeReplacement(new LinkCardNode(payload.url, payload.title, payload.icon, payload.description, payload.openTarget));
}
function $convertLinkCardElement(domNode) {
	const element = domNode;
	return { node: $createLinkCardNode({
		description: element.dataset.description,
		icon: element.dataset.icon,
		openTarget: element.getAttribute("target"),
		title: element.textContent || element.href,
		url: element.getAttribute("href") || ""
	}) };
}
function $isLinkCardNode(node) {
	return node instanceof LinkCardNode || node?.getType?.() === LinkCardNode.getType();
}
//#endregion
//#region src/plugins/link/node/LinkBlockCardNode.ts
var LinkBlockCardNode = class LinkBlockCardNode extends LinkCardNode {
	static getType() {
		return "link-block-card";
	}
	static clone(node) {
		return new LinkBlockCardNode(node.__url, node.__title, node.__icon, node.__description, node.__openTarget, node.__key);
	}
	static importJSON(serializedNode) {
		return $createLinkBlockCardNode({
			description: serializedNode.description,
			icon: serializedNode.icon,
			openTarget: serializedNode.openTarget,
			title: serializedNode.title,
			url: serializedNode.url
		}).updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { a: (node) => {
			if (node instanceof HTMLAnchorElement && node.dataset.linkCard === "true" && node.dataset.linkCardLayout === "block") return {
				conversion: $convertLinkBlockCardElement,
				priority: 3
			};
			return null;
		} };
	}
	constructor(url, title, icon, description, openTarget, key) {
		super(url, title, icon, description, openTarget, key);
	}
	createDOM(config, editor) {
		const element = super.createDOM(config, editor);
		element.dataset.linkCardLayout = "block";
		return element;
	}
	exportDOM() {
		const output = super.exportDOM();
		if (output.element instanceof HTMLElement) output.element.dataset.linkCardLayout = "block";
		return output;
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode);
	}
	isInline() {
		return false;
	}
};
function $createLinkBlockCardNode(payload) {
	return $applyNodeReplacement(new LinkBlockCardNode(payload.url, payload.title, payload.icon, payload.description, payload.openTarget));
}
function $convertLinkBlockCardElement(domNode) {
	const element = domNode;
	return { node: $createLinkBlockCardNode({
		description: element.dataset.description,
		icon: element.dataset.icon,
		openTarget: element.getAttribute("target"),
		title: element.textContent || element.href,
		url: element.getAttribute("href") || ""
	}) };
}
function $isLinkBlockCardNode(node) {
	return node instanceof LinkBlockCardNode || node?.getType?.() === LinkBlockCardNode.getType();
}
//#endregion
//#region src/plugins/link/node/LinkIframeNode.ts
var LinkIframeNode = class LinkIframeNode extends DecoratorNode {
	static getType() {
		return "link-iframe";
	}
	static clone(node) {
		return new LinkIframeNode(node.__url, node.__src, node.__title, node.__key);
	}
	static importJSON(serializedNode) {
		return $createLinkIframeNode({
			src: serializedNode.src,
			title: serializedNode.title,
			url: serializedNode.url
		}).updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { a: (node) => {
			if (node instanceof HTMLAnchorElement && node.dataset.linkIframe === "true") return {
				conversion: $convertLinkIframeElement,
				priority: 2
			};
			return null;
		} };
	}
	constructor(url, src, title, key) {
		super(key);
		this.__url = url;
		this.__src = src || url;
		this.__title = title || url;
	}
	createDOM(config, editor) {
		const element = document.createElement("div");
		element.dataset.linkIframe = "true";
		addClassNamesToElement(element, config.theme.linkIframe);
		element.addEventListener("mouseenter", (event) => {
			if (event.target instanceof HTMLElement) {
				event.target.classList.add("hover");
				editor.dispatchCommand(HOVER_LINK_COMMAND, {
					event,
					node: this
				});
			}
		});
		element.addEventListener("mouseleave", (event) => {
			if (event.target instanceof HTMLElement) {
				event.target.classList.remove("hover");
				editor.dispatchCommand(HOVER_OUT_LINK_COMMAND, { event });
			}
		});
		return element;
	}
	updateDOM() {
		return false;
	}
	isInline() {
		return false;
	}
	exportDOM() {
		const element = document.createElement("a");
		element.dataset.linkIframe = "true";
		element.dataset.src = this.getSrc();
		element.href = this.getURL();
		element.textContent = this.getTitle();
		return { element };
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			src: this.getSrc(),
			title: this.getTitle(),
			url: this.getURL()
		};
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setURL(serializedNode.url).setSrc(serializedNode.src).setTitle(serializedNode.title);
	}
	getTextContent() {
		return this.getTitle();
	}
	getURL() {
		return this.getLatest().__url;
	}
	setURL(url) {
		const writable = this.getWritable();
		writable.__url = url;
		return writable;
	}
	getSrc() {
		return this.getLatest().__src || this.getURL();
	}
	setSrc(src) {
		const writable = this.getWritable();
		writable.__src = src || this.getURL();
		return writable;
	}
	getTitle() {
		return this.getLatest().__title || this.getURL();
	}
	setTitle(title) {
		const writable = this.getWritable();
		writable.__title = title || this.getURL();
		return writable;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator(LinkIframeNode.getType());
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		return decorator.render(this, editor);
	}
};
function $createLinkIframeNode(payload) {
	return $applyNodeReplacement(new LinkIframeNode(payload.url, payload.src, payload.title));
}
function $convertLinkIframeElement(domNode) {
	const element = domNode;
	return { node: $createLinkIframeNode({
		src: element.dataset.src,
		title: element.textContent || element.href,
		url: element.getAttribute("href") || ""
	}) };
}
function $isLinkIframeNode(node) {
	return node instanceof LinkIframeNode || node?.getType?.() === LinkIframeNode.getType();
}
//#endregion
//#region src/plugins/link/node/SchemaNode.ts
var SchemaNode = class SchemaNode extends DecoratorNode {
	static getType() {
		return "schema-link";
	}
	static clone(node) {
		return new SchemaNode(node.__url, node.__schemaType, node.__payload, node.__title, node.__key);
	}
	static importJSON(serializedNode) {
		return $createSchemaNode({
			payload: serializedNode.payload,
			schemaType: serializedNode.schemaType,
			title: serializedNode.title,
			url: serializedNode.url
		}).updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { a: (node) => {
			if (node instanceof HTMLAnchorElement && node.dataset.schemaLink === "true") return {
				conversion: $convertSchemaElement,
				priority: 2
			};
			return null;
		} };
	}
	constructor(url, schemaType, payload, title, key) {
		super(key);
		this.__url = url;
		this.__schemaType = schemaType || "";
		this.__payload = payload;
		this.__title = title || url;
	}
	createDOM(config, editor) {
		const element = document.createElement("div");
		element.dataset.schemaLink = "true";
		addClassNamesToElement(element, config.theme.schemaLink);
		element.addEventListener("mouseenter", (event) => {
			if (event.target instanceof HTMLElement) {
				event.target.classList.add("hover");
				editor.dispatchCommand(HOVER_LINK_COMMAND, {
					event,
					node: this
				});
			}
		});
		element.addEventListener("mouseleave", (event) => {
			if (event.target instanceof HTMLElement) {
				event.target.classList.remove("hover");
				editor.dispatchCommand(HOVER_OUT_LINK_COMMAND, { event });
			}
		});
		return element;
	}
	updateDOM() {
		return false;
	}
	exportDOM() {
		const element = document.createElement("a");
		element.dataset.schemaLink = "true";
		element.dataset.schemaType = this.getSchemaType();
		element.dataset.payload = JSON.stringify(this.getPayload() ?? null);
		element.href = this.getURL();
		element.textContent = this.getTitle();
		return { element };
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			payload: this.getPayload(),
			schemaType: this.getSchemaType(),
			title: this.getTitle(),
			url: this.getURL()
		};
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setURL(serializedNode.url).setSchemaType(serializedNode.schemaType).setPayload(serializedNode.payload).setTitle(serializedNode.title);
	}
	getTextContent() {
		return this.getTitle();
	}
	getURL() {
		return this.getLatest().__url;
	}
	setURL(url) {
		const writable = this.getWritable();
		writable.__url = url;
		return writable;
	}
	getSchemaType() {
		return this.getLatest().__schemaType;
	}
	setSchemaType(schemaType) {
		const writable = this.getWritable();
		writable.__schemaType = schemaType || "";
		return writable;
	}
	getPayload() {
		return this.getLatest().__payload;
	}
	setPayload(payload) {
		const writable = this.getWritable();
		writable.__payload = payload;
		return writable;
	}
	getTitle() {
		return this.getLatest().__title || this.getURL();
	}
	setTitle(title) {
		const writable = this.getWritable();
		writable.__title = title || this.getURL();
		return writable;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator(SchemaNode.getType());
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		return decorator.render(this, editor);
	}
};
function $createSchemaNode(payload) {
	return $applyNodeReplacement(new SchemaNode(payload.url, payload.schemaType, payload.payload, payload.title));
}
function $convertSchemaElement(domNode) {
	const element = domNode;
	return { node: $createSchemaNode({
		payload: parsePayload(element.dataset.payload),
		schemaType: element.dataset.schemaType,
		title: element.textContent || element.href,
		url: element.getAttribute("href") || ""
	}) };
}
function parsePayload(value) {
	if (!value) return void 0;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}
function $isSchemaNode(node) {
	return node instanceof SchemaNode || node?.getType?.() === SchemaNode.getType();
}
//#endregion
//#region src/plugins/link/normalization/index.ts
function normalizeSchemaLinkNode(node, editor, linkService) {
	const url = node.getURL();
	const title = node.getTitle() || node.getTextContent() || url;
	const schema = linkService.parseSchemaUrl(url);
	const rule = linkService.getSchemaRule(url, {
		editor,
		schema,
		text: node.getTextContent(),
		title
	});
	if (!rule) return false;
	const parsed = rule.parse?.(url, schema);
	const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? normalizeSchemaPayload(parsed) : { payload: parsed };
	if (linkService.hasSchemaLinkRenderer(url)) payload.payload = {
		...payload.payload && typeof payload.payload === "object" ? payload.payload : {},
		__legacyLink: {
			rel: node.getRel(),
			target: node.getTarget(),
			text: node.getTextContent(),
			title: node.getTitle()
		}
	};
	node.replace($createSchemaNode({
		payload: payload.payload,
		schemaType: payload.schemaType || rule.id,
		title: payload.title || title,
		url: payload.url || url
	}));
	return true;
}
function normalizeSchemaPayload(payload) {
	if ("payload" in payload || "schemaType" in payload || "title" in payload || "url" in payload) return payload;
	return { payload };
}
//#endregion
//#region src/plugins/link/utils/index.ts
const SUPPORTED_URL_PROTOCOLS = /* @__PURE__ */ new Set([
	"http:",
	"https:",
	"mailto:",
	"sms:",
	"tel:"
]);
function sanitizeUrl(url) {
	try {
		const parsedUrl = new URL(url);
		if (!SUPPORTED_URL_PROTOCOLS.has(parsedUrl.protocol)) return "about:blank";
	} catch {
		return url;
	}
	return url;
}
const urlRegExp = /* @__PURE__ */ new RegExp(/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\w$&+,:;=-]+@)?[\d.A-Za-z-]+|(?:www.|[\w$&+,:;=-]+@)[\d.A-Za-z-]+)((?:\/[%+./~\w-_]*)?\??[\w%&+.;=@-]*#?\w*)?)/);
function extractUrlFromText(text) {
	const match = urlRegExp.exec(text);
	if (!match) return null;
	const raw = match[0];
	const start = match.index ?? text.indexOf(raw);
	const trimmed = raw.replace(/[)\],.;:]+$/u, "");
	return {
		index: start,
		length: trimmed.length,
		url: trimmed
	};
}
function getSelectedNode(selection) {
	const anchor = selection.anchor;
	const focus = selection.focus;
	const anchorNode = selection.anchor.getNode();
	const focusNode = selection.focus.getNode();
	if (anchorNode === focusNode) return anchorNode;
	if (selection.isBackward()) return $isAtNodeEnd(focus) ? anchorNode : focusNode;
	else return $isAtNodeEnd(anchor) ? anchorNode : focusNode;
}
//#endregion
//#region src/plugins/link/plugin/registry.ts
function registerLinkCommands(editor, kernel, options) {
	const { validateUrl, attributes, enableHotkey = true } = options || {};
	const state = { isLink: false };
	const registrations = [editor.registerUpdateListener(() => {
		const selection = editor.getEditorState().read(() => $getSelection());
		if (!selection) return;
		if ($isRangeSelection(selection)) editor.getEditorState().read(() => {
			const node = getSelectedNode(selection);
			const isLink = $isLinkNode(node.getParent()) || $isLinkNode(node);
			state.isLink = isLink;
		});
		else state.isLink = false;
	}), editor.registerCommand(TOGGLE_LINK_COMMAND, (payload) => {
		if (payload === null) {
			$toggleLink(payload);
			return true;
		} else if (typeof payload === "string") {
			if (validateUrl === void 0 || validateUrl(payload)) {
				$toggleLink(payload, attributes);
				return true;
			}
			return false;
		} else {
			const { url, target, rel, title } = payload;
			$toggleLink(url, {
				...attributes,
				rel,
				target,
				title
			});
			return true;
		}
	}, COMMAND_PRIORITY_LOW)];
	registrations.push(kernel.registerHotkey(HotkeyEnum.Link, () => {
		if (state.isLink) {
			editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
			return;
		}
		let nextUrl = sanitizeUrl("https://");
		let expandTo = null;
		editor.getEditorState().read(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) {
				if (!selection.isCollapsed()) {
					const maybeUrl = formatUrl(selection.getTextContent().trim());
					if (validateUrl?.(maybeUrl)) nextUrl = maybeUrl;
				} else {
					const found = extractUrlFromText(selection.anchor.getNode().getTextContent());
					if (found && validateUrl?.(formatUrl(found.url))) {
						nextUrl = formatUrl(found.url);
						expandTo = {
							index: found.index,
							length: found.length
						};
					}
				}
			}
		});
		editor.update(() => {
			if (expandTo) {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) {
					const anchorNode = selection.anchor.getNode();
					selection.anchor.set(anchorNode.getKey(), expandTo.index, "text");
					selection.focus.set(anchorNode.getKey(), expandTo.index + expandTo.length, "text");
				}
			}
			editor.dispatchCommand(TOGGLE_LINK_COMMAND, nextUrl);
		});
	}, {
		enabled: enableHotkey,
		preventDefault: true,
		stopPropagation: true
	}));
	return mergeRegister(...registrations);
}
//#endregion
//#region src/plugins/link/plugin/index.ts
const LinkPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "LinkPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		this.linkRegex = /^[a-z][\d+.a-z-]*:\/\/\S+$/i;
		this.service = new LinkService();
		kernel.registerNodes([
			LinkNode,
			AutoLinkNode,
			LinkCardNode,
			LinkBlockCardNode,
			LinkIframeNode,
			SchemaNode
		]);
		this.service.updateConfig(config);
		kernel.registerService(ILinkService, this.service);
		this.registerDecorator(kernel, LinkCardNode.getType(), (node, editor) => config?.decoratorCard ? config.decoratorCard(node, editor) : null);
		this.registerDecorator(kernel, LinkBlockCardNode.getType(), (node, editor) => config?.decoratorCard ? config.decoratorCard(node, editor) : null);
		this.registerDecorator(kernel, LinkIframeNode.getType(), (node, editor) => config?.decoratorIframe ? config.decoratorIframe(node, editor) : null);
		this.registerDecorator(kernel, SchemaNode.getType(), (node, editor) => config?.decoratorSchema ? config.decoratorSchema(node, editor) : null);
		if (config?.theme) kernel.registerThemes(config.theme);
		if (config?.linkRegex) this.linkRegex = config.linkRegex;
	}
	onInit(editor) {
		this.register(registerLinkCommand(editor));
		this.register(registerLinkCommands(editor, this.kernel, {
			attributes: this.config?.attributes,
			enableHotkey: this.config?.enableHotkey,
			validateUrl: this.config?.validateUrl
		}));
		this.register(editor.registerCommand(PASTE_COMMAND, (payload) => {
			const { clipboardData } = payload;
			if (clipboardData && clipboardData.types && clipboardData.types.length === 1 && clipboardData.types[0] === "text/plain") {
				const data = clipboardData.getData("text/plain").trim();
				if (this.linkRegex.test(data)) {
					payload.stopImmediatePropagation();
					payload.preventDefault();
					editor.dispatchCommand(INSERT_LINK_COMMAND, { url: data });
					return true;
				}
			}
			return false;
		}, COMMAND_PRIORITY_NORMAL));
		if (this.config?.normalizeSchemaLinks !== false) this.register(editor.registerNodeTransform(LinkNode, (node) => {
			normalizeSchemaLinkNode(node, editor, this.service);
		}));
		this.registerMarkdown();
		this.registerLiteXml();
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(LinkNode.getType(), (node, ctx) => {
			if ($isLinkNode(node)) {
				const attributes = { href: node.getURL() };
				return ctx.createXmlNode("a", attributes);
			}
			return false;
		});
		litexmlService.registerXMLReader("a", (xmlNode, children) => {
			return [INodeHelper.createElementNode("link", {
				children,
				direction: "ltr",
				format: "",
				indent: 0,
				type: "link",
				url: xmlNode.getAttribute("href") || "",
				version: 1
			})];
		});
		litexmlService.registerXMLWriter(LinkCardNode.getType(), (node, ctx) => {
			if (!$isLinkCardNode(node)) return false;
			return ctx.createXmlNode("link-card", {
				description: node.getDescription(),
				href: node.getURL(),
				icon: node.getIcon(),
				openTarget: node.getOpenTarget() || "_blank",
				title: node.getTitle()
			});
		});
		litexmlService.registerXMLWriter(LinkBlockCardNode.getType(), (node, ctx) => {
			if (!$isLinkBlockCardNode(node)) return false;
			return ctx.createXmlNode("link-card", {
				description: node.getDescription(),
				href: node.getURL(),
				icon: node.getIcon(),
				layout: "block",
				openTarget: node.getOpenTarget() || "_blank",
				title: node.getTitle()
			});
		});
		litexmlService.registerXMLReader("link-card", (xmlNode) => {
			return [INodeHelper.createTypeNode(xmlNode.getAttribute("layout") === "block" ? LinkBlockCardNode.getType() : LinkCardNode.getType(), {
				description: xmlNode.getAttribute("description") || "",
				icon: xmlNode.getAttribute("icon") || "",
				openTarget: xmlNode.getAttribute("openTarget") || "_blank",
				title: xmlNode.getAttribute("title") || xmlNode.getAttribute("href") || "",
				type: xmlNode.getAttribute("layout") === "block" ? LinkBlockCardNode.getType() : LinkCardNode.getType(),
				url: xmlNode.getAttribute("href") || "",
				version: 1
			})];
		});
		litexmlService.registerXMLWriter(LinkIframeNode.getType(), (node, ctx) => {
			if (!$isLinkIframeNode(node)) return false;
			return ctx.createXmlNode("link-iframe", {
				href: node.getURL(),
				src: node.getSrc(),
				title: node.getTitle()
			});
		});
		litexmlService.registerXMLReader("link-iframe", (xmlNode) => {
			return [INodeHelper.createTypeNode(LinkIframeNode.getType(), {
				src: xmlNode.getAttribute("src") || xmlNode.getAttribute("href") || "",
				title: xmlNode.getAttribute("title") || xmlNode.getAttribute("href") || "",
				type: LinkIframeNode.getType(),
				url: xmlNode.getAttribute("href") || "",
				version: 1
			})];
		});
		litexmlService.registerXMLWriter(SchemaNode.getType(), (node, ctx) => {
			if (!$isSchemaNode(node)) return false;
			return ctx.createXmlNode("schema-link", {
				href: node.getURL(),
				payload: JSON.stringify(node.getPayload() ?? null),
				schemaType: node.getSchemaType(),
				title: node.getTitle()
			});
		});
		litexmlService.registerXMLReader("schema-link", (xmlNode) => {
			return [INodeHelper.createTypeNode(SchemaNode.getType(), {
				payload: parseJsonAttribute(xmlNode.getAttribute("payload")),
				schemaType: xmlNode.getAttribute("schemaType") || "",
				title: xmlNode.getAttribute("title") || xmlNode.getAttribute("href") || "",
				type: SchemaNode.getType(),
				url: xmlNode.getAttribute("href") || "",
				version: 1
			})];
		});
	}
	registerMarkdown() {
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownShortCut({
			regExp: /\[([^[]+)]\(([^\s()]+)(?:\s"((?:[^"]*\\")*[^"]*)"\s*)?\)\s?$/,
			replace: (textNode, match) => {
				const [, linkText, linkUrl, linkTitle] = match;
				const linkNode = $createLinkNode(linkUrl, { title: linkTitle });
				const linkTextNode = $createTextNode(linkText);
				linkTextNode.setFormat(textNode.getFormat());
				linkNode.append(linkTextNode);
				textNode.replace(linkNode);
				return linkTextNode;
			},
			trigger: ")",
			type: "text-match"
		});
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownWriter(LinkNode.getType(), (ctx, node) => {
			if ($isLinkNode(node)) ctx.wrap("[", `](${node.getURL()})`);
		});
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownWriter(LinkCardNode.getType(), (ctx, node) => {
			if ($isLinkCardNode(node)) {
				ctx.appendLine(`[${node.getTitle()}](${node.getURL()})\n`);
				return true;
			}
		});
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownWriter(LinkBlockCardNode.getType(), (ctx, node) => {
			if ($isLinkBlockCardNode(node)) {
				ctx.appendLine(`[${node.getTitle()}](${node.getURL()})\n`);
				return true;
			}
		});
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownWriter(LinkIframeNode.getType(), (ctx, node) => {
			if ($isLinkIframeNode(node)) {
				ctx.appendLine(`[${node.getTitle()}](${node.getURL()})\n`);
				return true;
			}
		});
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownWriter(SchemaNode.getType(), (ctx, node) => {
			if ($isSchemaNode(node)) {
				ctx.appendLine(`[${node.getTitle()}](${node.getURL()})\n`);
				return true;
			}
		});
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownReader("link", (node, children) => {
			return [INodeHelper.createElementNode("link", {
				children,
				direction: "ltr",
				format: "",
				indent: 0,
				title: node.title || void 0,
				type: "link",
				url: node.url || "",
				version: 1
			})];
		});
	}
};
function parseJsonAttribute(value) {
	if (!value) return void 0;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}
//#endregion
//#region src/utils/cx.ts
const cx = (...classNames) => classNames.filter(Boolean).join(" ");
//#endregion
//#region src/plugins/list/utils/index.ts
const LIST_INDENT_SIZE = 4;
function getIndent(whitespaces) {
	const tabs = whitespaces.match(/\t/g);
	const spaces = whitespaces.match(/ /g);
	let indent = 0;
	if (tabs) indent += tabs.length;
	if (spaces) indent += Math.floor(spaces.length / LIST_INDENT_SIZE);
	return indent;
}
const listReplace = (listType) => {
	return (parentNode, children, match, isImport) => {
		const previousNode = parentNode.getPreviousSibling();
		const nextNode = parentNode.getNextSibling();
		const listItem = $createListItemNode(listType === "check" ? match[3] === "x" : void 0);
		if ($isListNode(nextNode) && nextNode.getListType() === listType) {
			const firstChild = nextNode.getFirstChild();
			if (firstChild !== null) firstChild.insertBefore(listItem);
			else nextNode.append(listItem);
			parentNode.remove();
		} else if ($isListNode(previousNode) && previousNode.getListType() === listType) {
			previousNode.append(listItem);
			parentNode.remove();
		} else {
			const list = $createListNode(listType, listType === "number" ? Number(match[2]) : void 0);
			list.append(listItem);
			parentNode.replace(list);
		}
		listItem.append(...children);
		if (!isImport) listItem.select(0, 0);
		const indent = getIndent(match[1]);
		if (indent) listItem.setIndent(indent);
	};
};
function $indentOverTab(selection) {
	const nodes = selection.getNodes();
	if ($filter(nodes, (node) => {
		if ($isBlockElementNode(node) && node.canIndent()) return node;
		return null;
	}).length > 0) return true;
	const anchor = selection.anchor;
	const focus = selection.focus;
	const first = focus.isBefore(anchor) ? focus : anchor;
	const firstNode = first.getNode();
	const firstBlock = $getNearestBlockElementAncestorOrThrow(firstNode);
	if (firstBlock.canIndent()) {
		const firstBlockKey = firstBlock.getKey();
		let selectionAtStart = $createRangeSelection();
		selectionAtStart.anchor.set(firstBlockKey, 0, "element");
		selectionAtStart.focus.set(firstBlockKey, 0, "element");
		selectionAtStart = $normalizeSelection__EXPERIMENTAL(selectionAtStart);
		if (selectionAtStart.anchor.is(first)) return true;
	}
	return false;
}
//#endregion
//#region src/plugins/list/plugin/checkList.ts
const INSERT_CHECK_LIST_COMMAND = createCommand("INSERT_CHECK_LIST_COMMAND");
function isHeadlessEditor$1(editor) {
	return editor._headless === true;
}
function handleCheckItemEvent(event, callback) {
	const target = event.target;
	if (!isHTMLElement$1(target)) return;
	const firstChild = target.firstChild;
	if (isHTMLElement$1(firstChild) && (firstChild.tagName === "UL" || firstChild.tagName === "OL")) return;
	const parentNode = target.parentNode;
	if (!parentNode || parentNode.__lexicalListType !== "check") return;
	const rect = target.getBoundingClientRect();
	const zoom = calculateZoomLevel(target);
	const clientX = event.clientX / zoom;
	const beforeStyles = window.getComputedStyle ? window.getComputedStyle(target, "::before") : { width: "0px" };
	const beforeWidthInPixels = parseFloat(beforeStyles.width);
	const beforeMargin = parseFloat(beforeStyles.marginLeft);
	const clickAreaPadding = event.pointerType === "touch" ? 32 : 0;
	if (target.dir === "rtl" ? clientX < rect.right + clickAreaPadding && clientX > rect.right - beforeWidthInPixels - clickAreaPadding : clientX > rect.left + beforeMargin - clickAreaPadding && clientX < rect.left + beforeMargin + beforeWidthInPixels + clickAreaPadding) callback();
}
function handleClick(event) {
	handleCheckItemEvent(event, () => {
		if (isHTMLElement$1(event.target)) {
			const domNode = event.target;
			const editor = getNearestEditorFromDOMNode(domNode);
			if (editor && editor.isEditable()) editor.update(() => {
				const node = $getNearestNodeFromDOMNode(domNode);
				if ($isListItemNode(node)) {
					domNode.focus();
					node.toggleChecked();
				}
			});
		}
	});
}
function handlePointerDown(event) {
	handleCheckItemEvent(event, () => {
		event.preventDefault();
	});
}
function getActiveCheckListItem() {
	const activeElement = document.activeElement;
	return isHTMLElement$1(activeElement) && activeElement.tagName === "LI" && activeElement.parentNode && activeElement.parentNode.__lexicalListType === "check" ? activeElement : null;
}
function findCheckListItemSibling(node, backward) {
	let sibling = backward ? node.getPreviousSibling() : node.getNextSibling();
	let parent = node;
	while (!sibling && $isListItemNode(parent)) {
		parent = parent.getParentOrThrow().getParent();
		if (parent) sibling = backward ? parent.getPreviousSibling() : parent.getNextSibling();
	}
	while ($isListItemNode(sibling)) {
		const firstChild = backward ? sibling.getLastChild() : sibling.getFirstChild();
		if (!$isListNode(firstChild)) return sibling;
		sibling = backward ? firstChild.getLastChild() : firstChild.getFirstChild();
	}
	return null;
}
function handleArrowUpOrDown(event, editor, backward) {
	const activeItem = getActiveCheckListItem();
	if (activeItem) editor.update(() => {
		const listItem = $getNearestNodeFromDOMNode(activeItem);
		if (!$isListItemNode(listItem)) return;
		const nextListItem = findCheckListItemSibling(listItem, backward);
		if (nextListItem) {
			nextListItem.selectStart();
			const dom = editor.getElementByKey(nextListItem.__key);
			if (dom) {
				event.preventDefault();
				setTimeout(() => {
					dom.focus();
				}, 0);
			}
		}
	});
	return false;
}
function registerCheckList(editor) {
	const registrations = [
		editor.registerCommand(INSERT_CHECK_LIST_COMMAND, () => {
			$insertList("check");
			return true;
		}, COMMAND_PRIORITY_LOW),
		editor.registerCommand(KEY_ARROW_DOWN_COMMAND, (event) => {
			return handleArrowUpOrDown(event, editor, false);
		}, COMMAND_PRIORITY_LOW),
		editor.registerCommand(KEY_ARROW_UP_COMMAND, (event) => {
			return handleArrowUpOrDown(event, editor, true);
		}, COMMAND_PRIORITY_LOW),
		editor.registerCommand(KEY_ARROW_LEFT_COMMAND, (event) => {
			return editor.getEditorState().read(() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection) && selection.isCollapsed()) {
					const { anchor } = selection;
					const isElement = anchor.type === "element";
					if (isElement || anchor.offset === 0) {
						const anchorNode = anchor.getNode();
						const elementNode = $findMatchingParent(anchorNode, (node) => $isElementNode(node) && !node.isInline());
						if ($isListItemNode(elementNode)) {
							const parent = elementNode.getParent();
							if ($isListNode(parent) && parent.getListType() === "check" && (isElement || elementNode.getFirstDescendant() === anchorNode)) {
								const domNode = editor.getElementByKey(elementNode.__key);
								if (domNode && document.activeElement !== domNode) {
									domNode.focus();
									event.preventDefault();
									return true;
								}
							}
						}
					}
				}
				return false;
			});
		}, COMMAND_PRIORITY_LOW)
	];
	if (!isHeadlessEditor$1(editor)) registrations.push(editor.registerRootListener((rootElement, prevElement) => {
		if (rootElement !== null) {
			rootElement.addEventListener("click", handleClick);
			rootElement.addEventListener("pointerdown", handlePointerDown);
		}
		if (prevElement !== null) {
			prevElement.removeEventListener("click", handleClick);
			prevElement.removeEventListener("pointerdown", handlePointerDown);
		}
	}));
	return mergeRegister(...registrations);
}
//#endregion
//#region src/plugins/list/plugin/registry.ts
function registerListCommands(editor, kernel, options) {
	const { enableHotkey = true } = options || {};
	return mergeRegister(kernel.registerHotkey(HotkeyEnum.BulletList, () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, void 0), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}), kernel.registerHotkey(HotkeyEnum.NumberList, () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, void 0), {
		enabled: enableHotkey,
		preventDefault: true,
		stopImmediatePropagation: true
	}), editor.registerCommand(KEY_TAB_COMMAND, (event) => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return false;
		event.preventDefault();
		const command = $indentOverTab(selection) ? event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND : INSERT_TAB_COMMAND;
		return editor.dispatchCommand(command, void 0);
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(KEY_BACKSPACE_COMMAND, (event) => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
		const anchor = selection.anchor;
		if (anchor.offset !== 0) return false;
		const anchorNode = anchor.getNode();
		let listItemNode;
		if ($isListItemNode(anchorNode)) listItemNode = anchorNode;
		else if ($isTextNode(anchorNode)) {
			if (anchorNode.getPreviousSibling()) return false;
			const parent = anchorNode.getParentOrThrow();
			if (!$isListItemNode(parent)) return false;
			listItemNode = parent;
		}
		if (!listItemNode || !$isRootNode(listItemNode.getParent()?.getParent())) return false;
		const listNode = listItemNode.getParentOrThrow();
		queueMicrotask(() => {
			editor.update(() => {
				if (!listItemNode) return;
				let newlistNode;
				if (listItemNode.getPreviousSibling() === null) {
					listItemNode.replace($createParagraphNode(), true).select(0, 0);
					return;
				}
				let next = listItemNode.getNextSibling();
				if (next) newlistNode = $createListNode(listNode.getListType(), listItemNode.getValue());
				while (next && newlistNode) {
					next.remove();
					newlistNode.append(next);
					next = next.getNextSibling();
				}
				const p = listItemNode.replace($createParagraphNode(), true);
				p.remove();
				listNode.insertAfter(p);
				if (newlistNode) p.insertAfter(newlistNode);
				p.select(0, 0);
			});
		});
		event.stopImmediatePropagation();
		event.preventDefault();
		return true;
	}, COMMAND_PRIORITY_LOW));
}
//#endregion
//#region src/plugins/list/plugin/index.ts
const ORDERED_LIST_REGEX = /^(\s*)(\d+)\.\s/;
const UNORDERED_LIST_REGEX = /^(\s*)[*+-]\s/;
const CHECK_LIST_REGEX = /^(\s*)(?:-\s)?\s?(\[(\s|x)?])\s/i;
const ListPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "ListPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		kernel.registerNodes([ListNode, ListItemNode]);
		kernel.registerThemes({ list: {
			checklist: "editor_listItemCheck",
			listitem: "editor_listItem",
			listitemChecked: "editor_listItemChecked",
			listitemUnchecked: "editor_listItemUnchecked",
			nested: { listitem: "editor_listItemNested" },
			ol: cx("editor_listOrdered", config?.theme),
			olDepth: [
				"editor_listOrdered dp1",
				"editor_listOrdered dp2",
				"editor_listOrdered dp3",
				"editor_listOrdered dp4",
				"editor_listOrdered dp5"
			],
			ul: cx("editor_listUnordered", config?.theme)
		} });
	}
	onInit(editor) {
		this.register(registerList(editor));
		this.register(registerCheckList(editor));
		this.register(registerListStrictIndentTransform(editor));
		this.register(registerListCommands(editor, this.kernel, { enableHotkey: this.config?.enableHotkey }));
		this.registerMarkdown();
		this.registerLiteXml();
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(ListNode.getType(), (node, ctx) => {
			if ($isListNode(node)) {
				const tagName = node.getListType() === "number" ? "ol" : "ul";
				const attributes = {};
				if (node.getListType() === "number" && node.getStart() !== 1) attributes.start = node.getStart().toString();
				return ctx.createXmlNode(tagName, attributes);
			}
			return false;
		});
		litexmlService.registerXMLWriter(ListItemNode.getType(), (node, ctx) => {
			if ($isListItemNode(node)) {
				const child = node.getFirstChild();
				if (child?.getType() === "diff" && "diffType" in child && child.diffType === "listItemRemove") return { lines: [] };
				return ctx.createXmlNode("li");
			}
			return false;
		});
		litexmlService.registerXMLReader("ol", (xmlNode, children) => {
			return INodeHelper.createElementNode("list", {
				children,
				direction: "ltr",
				format: "",
				indent: 0,
				listType: "number",
				start: xmlNode.getAttribute("start") ? parseInt(xmlNode.getAttribute("start"), 10) : 1,
				tag: "ol",
				version: 1
			});
		});
		litexmlService.registerXMLReader("ul", (xmlNode, children) => {
			return INodeHelper.createElementNode("list", {
				children,
				direction: "ltr",
				format: "",
				indent: 0,
				listType: "bullet",
				start: 1,
				tag: "ul",
				version: 1
			});
		});
		litexmlService.registerXMLReader("li", (xmlNode, children) => {
			return INodeHelper.createElementNode("listitem", {
				children,
				direction: "ltr",
				format: "",
				indent: 0,
				type: "listitem",
				version: 1
			});
		});
	}
	registerMarkdown() {
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		if (!markdownService) return;
		markdownService.registerMarkdownShortCut({
			regExp: UNORDERED_LIST_REGEX,
			replace: listReplace("bullet"),
			type: "element"
		});
		markdownService.registerMarkdownShortCut({
			regExp: ORDERED_LIST_REGEX,
			replace: listReplace("number"),
			type: "element"
		});
		markdownService.registerMarkdownShortCut({
			regExp: CHECK_LIST_REGEX,
			replace: listReplace("check"),
			type: "element"
		});
		markdownService.registerMarkdownWriter(ListNode.getType(), (ctx, node) => {
			if ($isListNode(node)) {
				const parent = node.getParent();
				const needsLeadingNewline = $isListItemNode(parent) && node.getPreviousSibling() !== null;
				ctx.wrap(needsLeadingNewline ? "\n" : "", "\n");
			}
		});
		const getLevel = (node) => {
			if (!node) return 0;
			if ($isRootNode(node.getParent())) return 0;
			const parent = node.getParent();
			if (!parent) return 0;
			const parentList = $getNearestNodeOfType(parent, ListNode);
			return parentList ? getLevel(parentList) + 1 : 0;
		};
		markdownService.registerMarkdownWriter(ListItemNode.getType(), (ctx, node) => {
			const parent = node.getParent();
			if ($isListItemNode(node) && $isListNode(parent)) {
				const child = node.getFirstChild();
				if (child?.getType() === "diff" && "diffType" in child && child.diffType === "listItemRemove") return true;
				if ($isListNode(node.getFirstChild())) return;
				const level = getLevel(parent);
				const prefix = "    ".repeat(level);
				switch (parent.getListType()) {
					case "bullet":
						ctx.wrap(prefix + "- ", "\n");
						break;
					case "number":
						ctx.wrap(`${prefix}${node.getValue()}. `, "\n");
						break;
					case "check": ctx.wrap(`${prefix}- [${node.getChecked() ? "x" : " "}] `, "\n");
				}
			}
		});
		markdownService.registerMarkdownReader("list", (node, children) => {
			const isCheck = node.children?.[0]?.type === "listItem" && typeof node.children?.[0]?.checked === "boolean";
			let start = node.start || 1;
			return INodeHelper.createElementNode("list", {
				children: children.map((v) => {
					if (v.type === "listitem") {
						v.value = start;
						if (v.children?.[0]?.type !== "list") start++;
					}
					return v;
				}),
				direction: "ltr",
				format: "",
				indent: 0,
				listType: isCheck ? "check" : node.ordered ? "number" : "bullet",
				start: node.start || 1,
				tag: node.ordered ? "ol" : "ul",
				version: 1
			});
		});
		markdownService.registerMarkdownReader("listItem", (node, children, index) => {
			return children.map((v) => {
				if (v.type === "paragraph") return INodeHelper.createElementNode("listitem", {
					checked: typeof node.checked === "boolean" ? node.checked : void 0,
					children: v.children,
					direction: "ltr",
					format: "",
					indent: 0,
					type: "listitem",
					value: index + 1,
					version: 1
				});
				else if (v.type === "list") return INodeHelper.createElementNode("listitem", {
					children: [v],
					direction: "ltr",
					format: "",
					indent: 0,
					type: "listitem",
					value: index + 1,
					version: 1
				});
				return v;
			});
		});
	}
};
//#endregion
//#region src/plugins/math/node/index.ts
var MathInlineNode = class MathInlineNode extends DecoratorNode {
	static getType() {
		return "math";
	}
	static clone(node) {
		return new MathInlineNode(node.__code, node.__key);
	}
	static importJSON(serializedNode) {
		return $createMathInlineNode().updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { span: (node) => {
			if (node.classList.contains("math-inline")) return {
				conversion: $convertMathInlineElement,
				priority: 0
			};
			return null;
		} };
	}
	constructor(code = "", key) {
		super(key);
		this.__code = code;
	}
	get code() {
		return this.__code;
	}
	updateCode(newCode) {
		const writer = this.getWritable();
		writer.__code = newCode;
	}
	exportDOM() {
		const span = document.createElement("span");
		span.className = "math-inline";
		return { element: span };
	}
	createDOM(config) {
		const element = document.createElement("span");
		addClassNamesToElement(element, config.theme.mathInline);
		return element;
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			code: this.__code
		};
	}
	updateFromJSON(serializedNode) {
		const node = super.updateFromJSON(serializedNode);
		this.__code = serializedNode.code || "";
		return node;
	}
	getTextContent() {
		return `$${this.code}$`;
	}
	isInline() {
		return true;
	}
	updateDOM() {
		return false;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator(MathInlineNode.getType());
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		return {
			queryDOM: decorator.queryDOM,
			render: decorator.render(this, editor)
		};
	}
};
var MathBlockNode = class MathBlockNode extends DecoratorNode {
	static getType() {
		return "mathBlock";
	}
	static clone(node) {
		return new MathBlockNode(node.__code, node.__key);
	}
	static importJSON(serializedNode) {
		return $createMathBlockNode().updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { div: (node) => {
			if (node.classList.contains("math-block")) return {
				conversion: $convertMathBlockElement,
				priority: 0
			};
			return null;
		} };
	}
	constructor(code = "", key) {
		super(key);
		this.__code = code;
	}
	get code() {
		return this.__code;
	}
	updateCode(newCode) {
		const writer = this.getWritable();
		writer.__code = newCode;
	}
	exportDOM() {
		const div = document.createElement("div");
		div.className = "math-block";
		return { element: div };
	}
	createDOM(config) {
		const element = document.createElement("div");
		addClassNamesToElement(element, config.theme.mathBlock);
		return element;
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			code: this.__code
		};
	}
	updateFromJSON(serializedNode) {
		const node = super.updateFromJSON(serializedNode);
		this.__code = serializedNode.code || "";
		return node;
	}
	getTextContent() {
		return `$$\n${this.code}\n$$\n`;
	}
	isInline() {
		return false;
	}
	updateDOM() {
		return false;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator(MathBlockNode.getType());
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		return {
			queryDOM: decorator.queryDOM,
			render: decorator.render(this, editor)
		};
	}
};
function $createMathInlineNode(code = "") {
	return $applyNodeReplacement(new MathInlineNode(code));
}
function $createMathBlockNode(code = "") {
	return $applyNodeReplacement(new MathBlockNode(code));
}
function $convertMathInlineElement() {
	return { node: $createMathInlineNode() };
}
function $convertMathBlockElement() {
	return { node: $createMathBlockNode() };
}
//#endregion
//#region src/plugins/math/command/index.ts
const INSERT_MATH_COMMAND = createCommand("INSERT_MATH_COMMAND");
const UPDATE_MATH_COMMAND = createCommand("UPDATE_MATH_COMMAND");
const SELECT_MATH_SIDE_COMMAND = createCommand("SELECT_MATH_SIDE_COMMAND");
function registerMathCommand(editor) {
	return mergeRegister(editor.registerCommand(INSERT_MATH_COMMAND, (payload) => {
		const { code } = payload;
		editor.update(() => {
			const mathNode = $createMathInlineNode(code);
			$insertNodes([mathNode]);
			if ($isRootOrShadowRoot(mathNode.getParentOrThrow())) $wrapNodeInElement(mathNode, $createParagraphNode).selectEnd();
		});
		return true;
	}, COMMAND_PRIORITY_HIGH), editor.registerCommand(UPDATE_MATH_COMMAND, (payload) => {
		const { code, key } = payload;
		editor.update(() => {
			const mathCode = $getNodeByKey(key);
			if (mathCode) {
				mathCode.updateCode(code);
				mathCode.selectNext();
			}
		});
		return true;
	}, COMMAND_PRIORITY_HIGH), editor.registerCommand(SELECT_MATH_SIDE_COMMAND, (payload) => {
		const { key, prev } = payload;
		editor.update(() => {
			const mathNode = $getNodeByKey(key);
			if (mathNode) {
				if (prev) mathNode.selectPrevious();
				else mathNode.selectNext();
			}
		});
		return true;
	}, COMMAND_PRIORITY_HIGH));
}
//#endregion
//#region src/plugins/math/utils/index.ts
/**
* Heuristic: does the content between `$...$` look like a math formula?
*
* Positive signals (any one → math):
*  - LaTeX commands        \alpha  \frac  …
*  - Structural chars      ^ _ { } ( )
*  - Operators / relations  + - * / = < > | ! ,
*  - Digits                0-9
*  - Single ASCII letter   x  y  n  (common math variable)
*
* Everything else (multi-char words, CJK, spaced plain text) → not math.
*/
function isLikelyMathContent(content) {
	const trimmed = content.trim();
	if (!trimmed) return false;
	if (/\\[A-Za-z]/.test(trimmed)) return true;
	if (/[\d!()*+,/<=>^_{|}-]/.test(trimmed)) return true;
	if (/^[A-Za-z]$/.test(trimmed)) return true;
	return false;
}
//#endregion
//#region src/plugins/math/plugin/index.ts
const MathPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "MathPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		this.logger = createDebugLogger("plugin", "math");
		kernel.registerNodes([MathInlineNode, MathBlockNode]);
		if (config?.theme) kernel.registerThemes(config?.theme);
		this.registerDecorator(kernel, MathInlineNode.getType(), (node, editor) => {
			return config?.decorator ? config.decorator(node, editor) : null;
		});
		this.registerDecorator(kernel, MathBlockNode.getType(), (node, editor) => {
			return config?.decorator ? config.decorator(node, editor) : null;
		});
	}
	onInit(editor) {
		this.register(registerMathCommand(editor));
		this.registerMarkdown();
		this.registerLiteXml();
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(MathInlineNode.getType(), (node, ctx) => {
			if (node instanceof MathInlineNode) {
				const attributes = { code: node.code };
				return ctx.createXmlNode("math", attributes);
			}
			return false;
		});
		litexmlService.registerXMLWriter(MathBlockNode.getType(), (node, ctx) => {
			if (node instanceof MathBlockNode) {
				const attributes = { code: node.code };
				return ctx.createXmlNode("mathBlock", attributes);
			}
			return false;
		});
		litexmlService.registerXMLReader("math", (xmlNode) => {
			return INodeHelper.createElementNode(MathInlineNode.getType(), {
				code: xmlNode.getAttribute("code") || "",
				version: 1
			});
		});
		litexmlService.registerXMLReader("mathBlock", (xmlNode) => {
			return INodeHelper.createElementNode(MathBlockNode.getType(), {
				code: xmlNode.getAttribute("code") || "",
				version: 1
			});
		});
	}
	registerMarkdown() {
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		if (this.config?.enableInlineMath !== false) markdownService?.registerMarkdownShortCut({
			regExp: /\$([^\s$](?:[^$]*[^\s$])?)\$\s?$/,
			replace: (textNode, match) => {
				const [, code] = match;
				if (!isLikelyMathContent(code)) return;
				const mathNode = $createMathInlineNode(code);
				this.logger.debug("Math node inserted:", mathNode);
				textNode.insertBefore(mathNode);
				textNode.setTextContent("");
				textNode.select();
			},
			trigger: "$",
			type: "text-match"
		});
		markdownService?.registerMarkdownShortCut({
			regExp: /^(\$\$)$/,
			replace: (parentNode, _1, _2, isImport) => {
				const node = $createMathBlockNode();
				if (isImport || parentNode.getNextSibling()) parentNode.replace(node);
				else parentNode.insertBefore(node);
				const sel = $createNodeSelection();
				sel.add(node.getKey());
				$setSelection(sel);
			},
			trigger: "enter",
			type: "element"
		});
		markdownService?.registerMarkdownWriter(MathInlineNode.getType(), (ctx, node) => {
			ctx.appendLine(node.getTextContent());
			return true;
		});
		markdownService?.registerMarkdownWriter(MathBlockNode.getType(), (ctx, node) => {
			ctx.appendLine(node.getTextContent());
			return true;
		});
		if (this.config?.enableInlineMath !== false) markdownService?.registerMarkdownReader("inlineMath", (node) => {
			return INodeHelper.createElementNode("math", {
				code: node.value,
				version: 1
			});
		});
		markdownService?.registerMarkdownReader("math", (node) => {
			return INodeHelper.createElementNode("mathBlock", {
				code: node.value,
				version: 1
			});
		});
	}
};
//#endregion
//#region src/plugins/mention/node/MentionNode.ts
var MentionNode = class MentionNode extends DecoratorNode {
	static getType() {
		return "mention";
	}
	static clone(node) {
		return new MentionNode(node.__label, node.__metadata, node.__key);
	}
	static importJSON(serializedNode) {
		return $createMentionNode().updateFromJSON(serializedNode);
	}
	static importDOM() {
		return { span: (node) => {
			if (node.classList.contains("mention")) return {
				conversion: $convertMentionElement,
				priority: 0
			};
			return null;
		} };
	}
	constructor(label = "", metadata = {}, key) {
		super(key);
		this.__label = label;
		this.__metadata = metadata;
	}
	get label() {
		return this.__label;
	}
	get metadata() {
		return this.__metadata;
	}
	exportDOM() {
		return { element: document.createElement("span") };
	}
	createDOM(config) {
		const element = document.createElement("span");
		addClassNamesToElement(element, config.theme.mention);
		return element;
	}
	getTextContent() {
		return this.label;
	}
	isInline() {
		return true;
	}
	updateDOM() {
		return false;
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			label: this.label,
			metadata: this.metadata
		};
	}
	updateFromJSON(serializedNode) {
		const node = super.updateFromJSON(serializedNode);
		this.__label = serializedNode.label || "";
		this.__metadata = serializedNode.metadata || {};
		return node;
	}
	decorate(editor) {
		const decorator = getKernelFromEditor(editor)?.getDecorator(MentionNode.getType());
		if (!decorator) return null;
		if (typeof decorator === "function") return decorator(this, editor);
		return {
			queryDOM: decorator.queryDOM,
			render: decorator.render(this, editor)
		};
	}
};
function $createMentionNode(label, metadata) {
	return $applyNodeReplacement(new MentionNode(label, metadata));
}
function $convertMentionElement() {
	return { node: $createMentionNode() };
}
function $isMentionNode(node) {
	return node.getType() === MentionNode.getType();
}
//#endregion
//#region src/plugins/mention/command/index.ts
const INSERT_MENTION_COMMAND = createCommand("INSERT_MENTION_COMMAND");
function registerMentionCommand(editor) {
	return editor.registerCommand(INSERT_MENTION_COMMAND, (payload) => {
		const { metadata, label } = payload;
		const hasCursorNode = editor.hasNodes([CursorNode]);
		editor.update(() => {
			const mentionNode = $createMentionNode(label, metadata);
			$insertNodes([mentionNode]);
			if ($isRootOrShadowRoot(mentionNode.getParentOrThrow())) {
				const paragraph = $wrapNodeInElement(mentionNode, $createParagraphNode);
				if (!hasCursorNode) paragraph.selectEnd();
			}
			if (hasCursorNode) {
				const cursorNode = $createCursorNode();
				mentionNode.insertAfter(cursorNode);
				cursorNode.selectEnd();
			}
		});
		return true;
	}, COMMAND_PRIORITY_HIGH);
}
//#endregion
//#region src/plugins/mention/plugin/register.ts
function registerMentionNodeSelectionObserver(editor) {
	const selectMentionKeys = [];
	return editor.registerUpdateListener(({ editorState }) => {
		const selection = editorState.read(() => $getSelection());
		const newSelectMentionKeys = [];
		if ($isNodeSelection(selection)) editorState.read(() => selection.getNodes()).forEach((node) => {
			if (node.getType() === "mention") newSelectMentionKeys.push(node.getKey());
		});
		else if ($isRangeSelection(selection) && !selection.isCollapsed()) editorState.read(() => {
			selection.getNodes().forEach((node) => {
				if ($isMentionNode(node)) newSelectMentionKeys.push(node.getKey());
			});
		});
		const removeKeys = selectMentionKeys.filter((key) => !newSelectMentionKeys.includes(key));
		const addKeys = newSelectMentionKeys.filter((key) => !selectMentionKeys.includes(key));
		selectMentionKeys.length = 0;
		selectMentionKeys.push(...newSelectMentionKeys);
		removeKeys.forEach((key) => {
			editor.getElementByKey(key)?.classList.remove("selected");
		});
		addKeys.forEach((key) => {
			editor.getElementByKey(key)?.classList.add("selected");
		});
	});
}
//#endregion
//#region src/plugins/mention/plugin/index.ts
const MentionPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "MentionPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		kernel.registerNodes([MentionNode]);
		if (config?.theme) kernel.registerThemes(config?.theme);
		this.registerDecorator(kernel, MentionNode.getType(), (node, editor) => {
			return config?.decorator ? config.decorator(node, editor) : null;
		});
	}
	onInit(editor) {
		this.register(registerMentionCommand(editor));
		if (this.config?.decorator) this.register(registerMentionNodeSelectionObserver(editor));
		this.registerMarkdown();
		this.registerLiteXml();
	}
	registerLiteXml() {
		this.kernel.requireService(ILitexmlService)?.registerXMLWriter(MentionNode.getType(), (node, ctx) => {
			if ($isMentionNode(node)) {
				const attributes = { label: node.label };
				if (node.metadata && Object.keys(node.metadata).length > 0) attributes.metadata = JSON.stringify(node.metadata);
				return ctx.createXmlNode("mention", attributes);
			}
			return false;
		});
		this.kernel.requireService(ILitexmlService)?.registerXMLReader("mention", (xmlNode) => {
			return INodeHelper.createElementNode(MentionNode.getType(), {
				label: xmlNode.getAttribute("label") || "",
				metadata: xmlNode.getAttribute("metadata") ? JSON.parse(xmlNode.getAttribute("metadata")) : {}
			});
		});
	}
	registerMarkdown() {
		this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownWriter(MentionNode.getType(), (ctx, node) => {
			if ($isMentionNode(node)) {
				if (this.config?.markdownWriter) {
					ctx.appendLine(this.config.markdownWriter(node));
					return;
				}
				ctx.appendLine(`${node.label}`);
			}
		});
		if (this.config?.markdownReader) this.kernel.requireService(IMarkdownShortCutService)?.registerMarkdownReader("html", (node, children) => {
			return this.config?.markdownReader ? this.config.markdownReader(node, children) || false : false;
		}, 1);
	}
};
//#endregion
//#region src/plugins/block/service/i-block-menu-service.ts
const IBlockMenuService = genServiceId("BlockMenuService");
function createDefaultTableColWidths(columnCount, tableWidth = 750) {
	const safeColumnCount = Math.max(1, columnCount);
	const columnWidth = Math.floor(tableWidth / safeColumnCount);
	const colWidths = Array.from({ length: safeColumnCount }, () => columnWidth);
	colWidths[safeColumnCount - 1] = tableWidth - columnWidth * (safeColumnCount - 1);
	return colWidths;
}
function syncTableWidthDOM(editor, tableKey, colWidths) {
	const tableElement = editor.getElementByKey(tableKey);
	const table = tableElement instanceof HTMLTableElement ? tableElement : tableElement?.querySelector("table.editor_table, table");
	if (!(table instanceof HTMLTableElement)) return;
	table.style.width = `${colWidths.reduce((total, width) => total + width, 0)}px`;
}
//#endregion
//#region src/plugins/table/utils/autoFitColumnWidth.ts
const AUTO_FIT_MIN_COLUMN_WIDTH = 75;
const MEASURE_CONTAINER_CLASS = "lobe-editor-table-auto-fit-measure";
const getTableElement$1 = (editor, tableKey) => {
	const tableElement = editor.getElementByKey(tableKey);
	return tableElement instanceof HTMLTableElement ? tableElement : tableElement?.querySelector("table.editor_table, table");
};
const applyNoWrapMeasureStyle = (element) => {
	element.style.whiteSpace = "nowrap";
	element.style.wordBreak = "normal";
	element.style.overflowWrap = "normal";
	element.style.setProperty("text-wrap", "nowrap");
};
const createMeasureContainer = (tableElement) => {
	const container = document.createElement("div");
	container.className = MEASURE_CONTAINER_CLASS;
	container.style.insetBlockStart = "0";
	container.style.insetInlineStart = "-100000px";
	container.style.pointerEvents = "none";
	container.style.position = "absolute";
	container.style.visibility = "hidden";
	container.style.zIndex = "-1";
	(tableElement.parentElement ?? document.body).append(container);
	return container;
};
const measureCellNoWrapWidth = (cellElement, measureContainer) => {
	const table = document.createElement("table");
	const tbody = document.createElement("tbody");
	const row = document.createElement("tr");
	const clone = cellElement.cloneNode(true);
	table.className = "editor_table";
	table.style.borderCollapse = "collapse";
	table.style.borderSpacing = "0";
	table.style.tableLayout = "auto";
	table.style.width = "max-content";
	delete clone.dataset.lexicalKey;
	clone.style.blockSize = "auto";
	clone.style.display = "table-cell";
	clone.style.inlineSize = "max-content";
	clone.style.maxInlineSize = "none";
	clone.style.minInlineSize = "0";
	clone.style.overflow = "visible";
	clone.style.position = "static";
	clone.style.width = "max-content";
	applyNoWrapMeasureStyle(table);
	applyNoWrapMeasureStyle(clone);
	clone.querySelectorAll("*").forEach(applyNoWrapMeasureStyle);
	row.append(clone);
	tbody.append(row);
	table.append(tbody);
	measureContainer.append(table);
	const width = Math.ceil(Math.max(table.getBoundingClientRect().width, clone.getBoundingClientRect().width));
	table.remove();
	return width;
};
const getAutoFitTableColumnWidths = (editor, tableNode, columnIndexes) => {
	const tableElement = getTableElement$1(editor, tableNode.getKey());
	if (!tableElement || columnIndexes.length === 0) return null;
	const columnCount = tableNode.getColumnCount();
	const targetColumnIndexes = [...new Set(columnIndexes)].filter((index) => index >= 0 && index < columnCount);
	if (targetColumnIndexes.length === 0) return null;
	const measureContainer = createMeasureContainer(tableElement);
	try {
		const [tableMap] = $computeTableMapSkipCellCheck(tableNode, null, null);
		const nextColWidths = [...tableNode.getColWidths() || createDefaultTableColWidths(columnCount)];
		for (const columnIndex of targetColumnIndexes) {
			const measuredCellKeys = /* @__PURE__ */ new Set();
			let columnWidth = AUTO_FIT_MIN_COLUMN_WIDTH;
			for (const row of tableMap) {
				const cell = row[columnIndex]?.cell;
				if (!cell || cell.getColSpan() > 1 || measuredCellKeys.has(cell.getKey())) continue;
				const cellElement = editor.getElementByKey(cell.getKey());
				if (!(cellElement instanceof HTMLElement)) continue;
				measuredCellKeys.add(cell.getKey());
				columnWidth = Math.max(columnWidth, measureCellNoWrapWidth(cellElement, measureContainer));
			}
			nextColWidths[columnIndex] = columnWidth;
		}
		return nextColWidths;
	} finally {
		measureContainer.remove();
	}
};
//#endregion
//#region src/plugins/table/utils/distributeColumnWidth.ts
const DISTRIBUTE_MIN_COLUMN_WIDTH = 75;
const getTableElement = (editor, tableKey) => {
	const tableElement = editor.getElementByKey(tableKey);
	return tableElement instanceof HTMLTableElement ? tableElement : tableElement?.querySelector("table.editor_table, table");
};
const getScrollContainerWidth = (tableElement) => {
	const container = tableElement.closest(".lobe-editor-table-scroll-wrapper") ?? tableElement.parentElement;
	if (!container) return 0;
	return container.clientWidth || container.getBoundingClientRect().width;
};
const getHorizontalBorderWidth = (tableElement) => {
	const firstRow = tableElement.rows[0];
	if (!firstRow) return 0;
	const cells = Array.from(firstRow.cells);
	if (cells.length === 0) return 0;
	return cells.reduce((total, cell, index) => {
		const style = getComputedStyle(cell);
		const borderInlineStartWidth = index === 0 ? Number.parseFloat(style.borderInlineStartWidth) || 0 : 0;
		const borderInlineEndWidth = Number.parseFloat(style.borderInlineEndWidth) || 0;
		return total + borderInlineStartWidth + borderInlineEndWidth;
	}, 0);
};
const getDistributedTableColumnWidths = (editor, tableNode) => {
	const columnCount = tableNode.getColumnCount();
	if (columnCount === 0) return null;
	const tableElement = getTableElement(editor, tableNode.getKey());
	if (!tableElement) return null;
	const minTableWidth = DISTRIBUTE_MIN_COLUMN_WIDTH * columnCount;
	const targetTableWidth = Math.max(getScrollContainerWidth(tableElement) - getHorizontalBorderWidth(tableElement), minTableWidth);
	const columnWidth = Math.floor(targetTableWidth / columnCount);
	const colWidths = Array.from({ length: columnCount }, () => columnWidth);
	colWidths[columnCount - 1] = targetTableWidth - columnWidth * (columnCount - 1);
	return colWidths;
};
//#endregion
//#region src/plugins/table/command/index.ts
const INSERT_TABLE_COMMAND = createCommand();
const SELECT_TABLE_COMMAND = createCommand();
const INSERT_TABLE_COLUMN_COMMAND = createCommand();
const INSERT_TABLE_ROW_COMMAND = createCommand();
const SYNC_TABLE_COLUMN_WIDTH_COMMAND = createCommand();
const AUTO_FIT_TABLE_COLUMN_WIDTH_COMMAND = createCommand();
const DISTRIBUTE_TABLE_COLUMN_WIDTH_COMMAND = createCommand();
const MOVE_TABLE_COLUMN_COMMAND = createCommand();
const MOVE_TABLE_ROW_COMMAND = createCommand();
const resetTableScrollLeft = (editor, tableKey) => {
	const tableElement = editor.getElementByKey(tableKey);
	const scrollWrapper = (tableElement instanceof HTMLTableElement ? tableElement : tableElement?.querySelector("table.editor_table, table"))?.closest(".lobe-editor-table-scroll-wrapper");
	if (scrollWrapper) scrollWrapper.scrollLeft = 0;
};
const $selectFirstDescendant = (node) => {
	const firstDescendant = node.getFirstDescendant();
	if ($isTextNode(firstDescendant)) firstDescendant.select();
	else node.selectStart();
};
const getMoveRange = (selectedIndexes, targetIndex, insertAfter = false) => {
	if (selectedIndexes.length === 0) return null;
	const sortedIndexes = [...selectedIndexes].sort((a, b) => a - b);
	const from = sortedIndexes[0];
	const to = sortedIndexes.at(-1) ?? from;
	const count = to - from + 1;
	const insertionIndex = insertAfter ? targetIndex + 1 : targetIndex;
	if (insertionIndex >= from && insertionIndex <= to + 1) return null;
	return {
		count,
		from,
		target: insertionIndex > to ? insertionIndex - count : insertionIndex,
		to
	};
};
const $selectTableRows = (tableNode, from, to) => {
	const [tableMap] = $computeTableMapSkipCellCheck(tableNode, null, null);
	const firstRow = tableMap[from];
	const lastRow = tableMap[to];
	const firstCell = firstRow?.[0]?.cell;
	const lastCell = lastRow?.at(-1)?.cell;
	if (!firstCell || !lastCell) return false;
	const tableSelection = $createTableSelection();
	tableSelection.set(tableNode.getKey(), firstCell.getKey(), lastCell.getKey());
	$setSelection(tableSelection);
	return true;
};
const $selectTableColumns = (tableNode, from, to) => {
	const [tableMap] = $computeTableMapSkipCellCheck(tableNode, null, null);
	const firstCell = tableMap.find((row) => row[from])?.[from]?.cell;
	const lastCell = [...tableMap].reverse().find((row) => row[to])?.[to]?.cell;
	if (!firstCell || !lastCell) return false;
	const tableSelection = $createTableSelection();
	tableSelection.set(tableNode.getKey(), firstCell.getKey(), lastCell.getKey());
	$setSelection(tableSelection);
	return true;
};
const getRangeFromSelection = (selection, table, targetIndex, direction, crossAxisLength, anchorIndex) => {
	if (anchorIndex !== void 0) return {
		from: Math.min(anchorIndex, targetIndex),
		to: Math.max(anchorIndex, targetIndex)
	};
	if (!$isTableSelection(selection) || selection.tableKey !== table) return {
		from: 0,
		to: targetIndex
	};
	const shape = selection.getShape();
	if (!(direction === "row" ? shape.fromX === 0 && shape.toX === crossAxisLength - 1 : shape.fromY === 0 && shape.toY === crossAxisLength - 1)) return {
		from: 0,
		to: targetIndex
	};
	const from = direction === "row" ? shape.fromY : shape.fromX;
	const to = direction === "row" ? shape.toY : shape.toX;
	return {
		from: Math.min(from, targetIndex),
		to: Math.max(to, targetIndex)
	};
};
function registerTableCommand(editor) {
	return mergeRegister(editor.registerCommand(INSERT_TABLE_COMMAND, ({ rows, columns, includeHeaders }) => {
		const selection = $getSelection() || $getPreviousSelection();
		if (!selection || !$isRangeSelection(selection)) return false;
		const anchorNode = $getNodeByKey(selection.anchor.key);
		if (!anchorNode) return false;
		if ($findTableNode(anchorNode)) return false;
		const rowCount = Number(rows);
		const columnCount = Number(columns);
		const tableNode = $createTableNodeWithDimensions(rowCount, columnCount, includeHeaders);
		tableNode.setColWidths(createDefaultTableColWidths(columnCount));
		if ($isElementNode(anchorNode) && anchorNode.isEmpty()) anchorNode.replace(tableNode);
		else $insertNodeToNearestRoot(tableNode);
		const firstDescendant = tableNode.getFirstDescendant();
		if ($isTextNode(firstDescendant)) firstDescendant.select();
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(INSERT_TABLE_COLUMN_COMMAND, ({ table, columnIndex, insertAfter = true }) => {
		const tableNode = $getNodeByKey(table);
		if (!tableNode || !$isTableNode(tableNode)) return false;
		const [tableMap] = $computeTableMapSkipCellCheck(tableNode, null, null);
		const firstCell = tableMap.find((row) => row[columnIndex])?.[columnIndex]?.cell;
		const lastCell = [...tableMap].reverse().find((row) => row[columnIndex])?.[columnIndex]?.cell;
		if (!firstCell || !lastCell) return false;
		const tableSelection = $createTableSelection();
		tableSelection.set(table, firstCell.getKey(), lastCell.getKey());
		$setSelection(tableSelection);
		$insertTableColumnAtSelection(insertAfter);
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(INSERT_TABLE_ROW_COMMAND, ({ table, rowIndex, insertAfter = true }) => {
		const tableNode = $getNodeByKey(table);
		if (!tableNode || !$isTableNode(tableNode)) return false;
		const [tableMap] = $computeTableMapSkipCellCheck(tableNode, null, null);
		const row = tableMap[rowIndex];
		const firstCell = row?.[0]?.cell;
		const lastCell = row?.at(-1)?.cell;
		if (!firstCell || !lastCell) return false;
		const tableSelection = $createTableSelection();
		tableSelection.set(table, firstCell.getKey(), lastCell.getKey());
		$setSelection(tableSelection);
		const insertedRow = $insertTableRowAtSelection(insertAfter);
		if (insertedRow) $selectFirstDescendant(insertedRow);
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(SYNC_TABLE_COLUMN_WIDTH_COMMAND, ({ table, columnIndex }) => {
		const tableNode = $getNodeByKey(table);
		if (!tableNode || !$isTableNode(tableNode)) return false;
		const columnCount = tableNode.getColumnCount();
		const selectedWidth = (tableNode.getColWidths() || createDefaultTableColWidths(columnCount))[columnIndex];
		if (selectedWidth === void 0) return false;
		const nextColWidths = Array.from({ length: columnCount }, () => selectedWidth);
		tableNode.setColWidths(nextColWidths);
		requestAnimationFrame(() => {
			syncTableWidthDOM(editor, table, nextColWidths);
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(AUTO_FIT_TABLE_COLUMN_WIDTH_COMMAND, ({ table, columnIndexes }) => {
		const tableNode = $getNodeByKey(table);
		if (!tableNode || !$isTableNode(tableNode)) return false;
		const nextColWidths = getAutoFitTableColumnWidths(editor, tableNode, columnIndexes);
		if (!nextColWidths) return false;
		tableNode.setColWidths(nextColWidths);
		requestAnimationFrame(() => {
			syncTableWidthDOM(editor, table, nextColWidths);
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(DISTRIBUTE_TABLE_COLUMN_WIDTH_COMMAND, ({ table }) => {
		const tableNode = $getNodeByKey(table);
		if (!tableNode || !$isTableNode(tableNode)) return false;
		const nextColWidths = getDistributedTableColumnWidths(editor, tableNode);
		if (!nextColWidths) return false;
		tableNode.setColWidths(nextColWidths);
		requestAnimationFrame(() => {
			syncTableWidthDOM(editor, table, nextColWidths);
			resetTableScrollLeft(editor, table);
		});
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(MOVE_TABLE_COLUMN_COMMAND, ({ table, selectedColumns, columnIndex, insertAfter = false }) => {
		const tableNode = $getNodeByKey(table);
		if (!tableNode || !$isTableNode(tableNode) || !$isSimpleTable(tableNode)) return false;
		const moveRange = getMoveRange(selectedColumns, columnIndex, insertAfter);
		if (!moveRange) return false;
		const { count, from, target, to } = moveRange;
		tableNode.getChildren().filter($isTableRowNode).forEach((row) => {
			const cells = row.getChildren();
			const movedCells = cells.slice(from, to + 1);
			const nextCells = [...cells.slice(0, from), ...cells.slice(to + 1)];
			nextCells.splice(target, 0, ...movedCells);
			row.splice(0, cells.length, nextCells);
		});
		const colWidths = tableNode.getColWidths();
		if (colWidths && colWidths.length === tableNode.getColumnCount()) {
			const movedWidths = colWidths.slice(from, to + 1);
			const nextWidths = [...colWidths.slice(0, from), ...colWidths.slice(to + 1)];
			nextWidths.splice(target, 0, ...movedWidths);
			tableNode.setColWidths(nextWidths);
		}
		$selectTableColumns(tableNode, target, target + count - 1);
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(MOVE_TABLE_ROW_COMMAND, ({ table, selectedRows, rowIndex, insertAfter = false }) => {
		const tableNode = $getNodeByKey(table);
		if (!tableNode || !$isTableNode(tableNode) || !$isSimpleTable(tableNode)) return false;
		const moveRange = getMoveRange(selectedRows, rowIndex, insertAfter);
		if (!moveRange) return false;
		const { count, from, target, to } = moveRange;
		const rows = tableNode.getChildren();
		const movedRows = rows.slice(from, to + 1);
		const nextRows = [...rows.slice(0, from), ...rows.slice(to + 1)];
		nextRows.splice(target, 0, ...movedRows);
		tableNode.splice(0, rows.length, nextRows);
		$selectTableRows(tableNode, target, target + count - 1);
		return true;
	}, COMMAND_PRIORITY_EDITOR), editor.registerCommand(SELECT_TABLE_COMMAND, ({ table, anchorIndex, columnIndex, extend, rowIndex }) => {
		const prevSelection = $getSelection();
		const tableNode = $getNodeByKey(table);
		if (!tableNode || !$isTableNode(tableNode)) return false;
		const tableSelection = $isTableSelection(prevSelection) ? prevSelection : $createTableSelection();
		const [tableMap] = $computeTableMapSkipCellCheck(tableNode, null, null);
		if (rowIndex !== void 0) {
			const { from, to } = extend ? getRangeFromSelection(prevSelection, table, rowIndex, "row", tableNode.getColumnCount(), anchorIndex) : {
				from: rowIndex,
				to: rowIndex
			};
			const firstRow = tableMap[from];
			const lastRow = tableMap[to];
			const firstCell = firstRow?.[0]?.cell;
			const lastCell = lastRow?.at(-1)?.cell;
			if (!firstCell || !lastCell) return false;
			tableSelection.set(table, firstCell.getKey(), lastCell.getKey());
			$setSelection(tableSelection);
			return true;
		}
		if (columnIndex !== void 0) {
			const { from, to } = extend ? getRangeFromSelection(prevSelection, table, columnIndex, "column", tableMap.length, anchorIndex) : {
				from: columnIndex,
				to: columnIndex
			};
			const firstCell = tableMap.find((row) => row[from])?.[from]?.cell;
			const lastCell = [...tableMap].reverse().find((row) => row[to])?.[to]?.cell;
			if (!firstCell || !lastCell) return false;
			tableSelection.set(table, firstCell.getKey(), lastCell.getKey());
			$setSelection(tableSelection);
			return true;
		}
		const firstRow = tableMap[0];
		const lastRow = tableMap.at(-1);
		const firstCell = firstRow?.[0]?.cell;
		const lastCell = lastRow?.at(-1)?.cell;
		if (!firstCell || !lastCell) return false;
		tableSelection.set(table, firstCell.getKey(), lastCell.getKey());
		$setSelection(tableSelection);
		return true;
	}, COMMAND_PRIORITY_EDITOR));
}
//#endregion
//#region src/plugins/table/node/index.ts
const OriginalCreateDOM = TableNode.prototype.createDOM;
const OriginalUpdateDOM = TableNode.prototype.updateDOM;
const SCROLL_INDICATOR_WIDTH = 24;
function markTableControllerHost(element, withDecorator = false) {
	setDOMUnmanaged(element);
	if (withDecorator) element.dataset.lexicalDecorator = "true";
}
function updateTableScrollIndicators(scrollWrapper) {
	const maxScrollLeft = scrollWrapper.scrollWidth - scrollWrapper.clientWidth;
	const scrollLeft = scrollWrapper.scrollLeft;
	const hasOverflow = maxScrollLeft > 1;
	const showStart = hasOverflow && scrollLeft > 1;
	const showEnd = hasOverflow && scrollLeft < maxScrollLeft - 1;
	const startIndicator = scrollWrapper.querySelector(":scope > .lobe-editor-table-scroll-indicator-start");
	const endIndicator = scrollWrapper.querySelector(":scope > .lobe-editor-table-scroll-indicator-end");
	startIndicator?.classList.toggle("lobe-editor-table-scroll-indicator-visible", showStart);
	endIndicator?.classList.toggle("lobe-editor-table-scroll-indicator-visible", showEnd);
	if (startIndicator) startIndicator.style.transform = `translateX(${scrollLeft}px)`;
	if (endIndicator) endIndicator.style.transform = `translateX(${Math.max(scrollLeft + scrollWrapper.clientWidth - SCROLL_INDICATOR_WIDTH, 0)}px)`;
}
function ensureTableScrollIndicators(scrollWrapper) {
	const ensureIndicator = (className) => {
		const existingIndicator = scrollWrapper.querySelector(`:scope > .${className}`);
		if (existingIndicator instanceof HTMLElement) {
			setDOMUnmanaged(existingIndicator);
			return;
		}
		const indicator = document.createElement("span");
		indicator.className = `lobe-editor-table-scroll-indicator ${className}`;
		setDOMUnmanaged(indicator);
		scrollWrapper.append(indicator);
	};
	ensureIndicator("lobe-editor-table-scroll-indicator-start");
	ensureIndicator("lobe-editor-table-scroll-indicator-end");
	if (scrollWrapper.dataset.scrollIndicatorsReady === "true") {
		updateTableScrollIndicators(scrollWrapper);
		return;
	}
	scrollWrapper.dataset.scrollIndicatorsReady = "true";
	scrollWrapper.addEventListener("scroll", () => updateTableScrollIndicators(scrollWrapper), { passive: true });
	const resizeObserver = new ResizeObserver(() => updateTableScrollIndicators(scrollWrapper));
	resizeObserver.observe(scrollWrapper);
	resizeObserver.observe(scrollWrapper.querySelector("table") ?? scrollWrapper);
	requestAnimationFrame(() => updateTableScrollIndicators(scrollWrapper));
}
function ensureTableControllerDOM(element) {
	const table = element instanceof HTMLTableElement ? element : element.querySelector("table");
	if (!table) return;
	let scrollWrapper = table.closest(".lobe-editor-table-scroll-wrapper");
	if (!table.closest(".lobe-editor-table-scroll-wrapper")) {
		scrollWrapper = document.createElement("div");
		scrollWrapper.className = "lobe-editor-table-scroll-wrapper";
		table.parentElement?.insertBefore(scrollWrapper, table);
		scrollWrapper.append(table);
	}
	if (!scrollWrapper) return;
	const legacyToolbar = element.querySelector(":scope > .toolbar");
	if (legacyToolbar instanceof HTMLElement) {
		legacyToolbar.className = "toolbar-col";
		markTableControllerHost(legacyToolbar, true);
		scrollWrapper.append(legacyToolbar);
	}
	const ensureToolbar = (parent, className, withDecorator = false) => {
		const existingToolbar = parent.querySelector(`:scope > .${className}`);
		if (existingToolbar instanceof HTMLElement) {
			markTableControllerHost(existingToolbar, withDecorator);
			return;
		}
		if (!existingToolbar) {
			const toolbar = document.createElement("div");
			toolbar.className = className;
			markTableControllerHost(toolbar, withDecorator);
			parent.append(toolbar);
		}
	};
	const legacyDecoratedToolbar = scrollWrapper.querySelector(":scope > .toolbar[data-lexical-decorator]");
	if (legacyDecoratedToolbar instanceof HTMLElement) {
		legacyDecoratedToolbar.className = "toolbar-col";
		markTableControllerHost(legacyDecoratedToolbar, true);
	}
	const legacyPlainToolbar = scrollWrapper.querySelector(":scope > .toolbar:not([data-lexical-decorator])");
	if (legacyPlainToolbar instanceof HTMLElement) {
		legacyPlainToolbar.className = "toolbar-row";
		markTableControllerHost(legacyPlainToolbar, true);
		scrollWrapper.append(legacyPlainToolbar);
	}
	const legacyOuterRowToolbar = element.querySelector(":scope > .toolbar-row");
	if (legacyOuterRowToolbar instanceof HTMLElement) scrollWrapper.append(legacyOuterRowToolbar);
	ensureToolbar(scrollWrapper, "toolbar-col", true);
	ensureToolbar(scrollWrapper, "toolbar-row", true);
	ensureTableScrollIndicators(scrollWrapper);
}
function reconcileTableDecorator(editor, node, decorator) {
	if (!decorator) return;
	if (typeof decorator === "function") {
		reconcileDecorator(editor, node.getKey(), decorator(node, editor));
		return;
	}
	if ("multi" in decorator) {
		const decorators = decorator.multi.map((item) => ({
			queryDOM: item.queryDOM,
			render: item.render(node, editor)
		}));
		reconcileDecorator(editor, node.getKey(), { multi: decorators });
		return;
	}
	reconcileDecorator(editor, node.getKey(), {
		queryDOM: decorator.queryDOM,
		render: decorator.render(node, editor)
	});
}
function patchTableNode() {
	if (TableNode.prototype.createDOM !== OriginalCreateDOM) return;
	Object.defineProperty(TableNode.prototype, "createDOM", {
		configurable: true,
		enumerable: false,
		value: function(config, editor) {
			const table = OriginalCreateDOM.call(this, config, editor);
			ensureTableControllerDOM(table);
			const decorator = getKernelFromEditor(editor)?.getDecorator(TableNode.getType()) || null;
			reconcileTableDecorator(editor, this, decorator);
			return table;
		},
		writable: true
	});
	Object.defineProperty(TableNode.prototype, "updateDOM", {
		configurable: true,
		enumerable: false,
		value: function(_prevNode, _dom, _config) {
			const table = OriginalUpdateDOM.call(this, _prevNode, _dom, _config);
			ensureTableControllerDOM(_dom);
			const kernel = getKernelFromEditorConfig(_config);
			const editor = kernel?.getLexicalEditor();
			if (editor) {
				const decorator = kernel?.getDecorator(TableNode.getType()) || null;
				reconcileTableDecorator(editor, this, decorator);
			}
			return table;
		},
		writable: true
	});
}
//#endregion
//#region src/plugins/table/service/i-table-controller-menu-service.ts
const ITableControllerMenuService = genServiceId("TableControllerMenuService");
var TableControllerMenuService = class {
	constructor() {
		this.items = /* @__PURE__ */ new Map();
		this.listeners = /* @__PURE__ */ new Set();
	}
	getItems(context) {
		return Array.from(this.items.values()).filter((item) => item.when ? item.when(context) : true).sort((a, b) => (a.order || 0) - (b.order || 0));
	}
	registerItem(item) {
		this.items.set(item.key, item);
		this.notify();
		return () => {
			this.items.delete(item.key);
			this.notify();
		};
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	notify() {
		for (const listener of this.listeners) listener();
	}
};
//#endregion
//#region src/plugins/table/plugin/single-cell-paste.ts
const LEXICAL_CLIPBOARD_TYPE = "application/x-lexical-editor";
const countNodesByType = (node, type) => {
	return (node.type === type ? 1 : 0) + (Array.isArray(node.children) ? node.children.reduce((count, child) => count + countNodesByType(child, type), 0) : 0);
};
const parseLexicalTableClipboard = (serializedClipboard) => {
	if (!serializedClipboard) return void 0;
	try {
		const clipboard = JSON.parse(serializedClipboard);
		if (!Array.isArray(clipboard.nodes) || clipboard.nodes.length !== 1) return { isSingleCell: false };
		const [rootNode] = clipboard.nodes;
		if (rootNode?.type !== "table") return { isSingleCell: false };
		const cells = [];
		const collectCells = (node) => {
			if (node.type === "tablecell") cells.push(node);
			node.children?.forEach(collectCells);
		};
		collectCells(rootNode);
		const isSingleCell = countNodesByType(rootNode, "table") === 1 && cells.length === 1;
		return {
			cell: isSingleCell ? cells[0] : void 0,
			isSingleCell
		};
	} catch {
		return;
	}
};
const getSerializedNodeText = (node) => {
	if (node.type === "text") return node.text || "";
	if (node.type === "linebreak") return "\n";
	if (node.type === "tab") return "	";
	return node.children?.map(getSerializedNodeText).join("") || "";
};
const getSerializedCellText = (cell) => {
	return cell.children?.map(getSerializedNodeText).join("\n") || "";
};
const getSingleCellHTMLText = (html) => {
	if (!isSingleCellHTMLTable(html) || typeof DOMParser === "undefined") return void 0;
	const cell = new DOMParser().parseFromString(html, "text/html").body.querySelector("td, th");
	if (!cell) return void 0;
	cell.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
	return Array.from(cell.children).map((node) => node.textContent || "").join("\n") || cell.textContent || "";
};
const isSingleCellHTMLTable = (html) => {
	if (!html || typeof DOMParser === "undefined") return false;
	const document = new DOMParser().parseFromString(html, "text/html");
	const tables = document.body.querySelectorAll("table");
	if (tables.length !== 1 || tables[0].querySelectorAll("td, th").length !== 1) return false;
	const remainder = document.body.cloneNode(true);
	remainder.querySelector("table")?.remove();
	remainder.querySelectorAll("link, meta, script, style").forEach((node) => node.remove());
	return !remainder.querySelector("audio, canvas, iframe, img, object, svg, video") && remainder.textContent?.trim() === "";
};
const isSingleCellTableClipboard = (clipboardData) => {
	const lexicalResult = parseLexicalTableClipboard(clipboardData.getData(LEXICAL_CLIPBOARD_TYPE));
	if (lexicalResult !== void 0) return lexicalResult.isSingleCell;
	return isSingleCellHTMLTable(clipboardData.getData("text/html"));
};
const getSingleCellPlainText = (clipboardData) => {
	const lexicalResult = parseLexicalTableClipboard(clipboardData.getData(LEXICAL_CLIPBOARD_TYPE));
	if (lexicalResult?.cell) return getSerializedCellText(lexicalResult.cell);
	const htmlText = getSingleCellHTMLText(clipboardData.getData("text/html"));
	if (htmlText !== void 0) return htmlText;
	return clipboardData.getData("text/plain").replace(/(?:\r\n|\n)$/, "");
};
const handleSingleCellTablePaste = (editor, event) => {
	if (!("clipboardData" in event)) return false;
	const clipboardData = event.clipboardData;
	if (!clipboardData || !isSingleCellTableClipboard(clipboardData)) return false;
	event.preventDefault();
	editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, getSingleCellPlainText(clipboardData));
	return true;
};
const registerSingleCellTablePaste = (editor) => {
	return editor.registerCommand(PASTE_COMMAND, (event) => handleSingleCellTablePaste(editor, event), COMMAND_PRIORITY_HIGH);
};
//#endregion
//#region src/plugins/table/plugin/index.ts
const tableCellProcessor = (before, content, after) => {
	return before + content.replace(/\n+$/, "").replaceAll(/\n+/g, "<br />") + after;
};
const isRemovedTableRowDiff = (node) => node.getType() === "table-row-diff" && "getDiffType" in node && typeof node.getDiffType === "function" && node.getDiffType() === "remove";
function isHeadlessEditor(editor) {
	return editor._headless === true;
}
const getSelectedRange = (selectedIndexes) => {
	const sortedIndexes = [...selectedIndexes].sort((a, b) => a - b);
	return {
		end: sortedIndexes.at(-1) ?? 0,
		start: sortedIndexes[0] ?? 0
	};
};
const TablePlugin = class extends KernelPlugin {
	static {
		this.pluginName = "TablePlugin";
	}
	constructor(kernel, options) {
		super();
		this.kernel = kernel;
		patchTableNode();
		kernel.registerServiceHotReload(ITableControllerMenuService, new TableControllerMenuService());
		kernel.registerNodes([
			TableNode$1,
			TableRowNode,
			TableCellNode
		]);
		if (options?.decoratorCol || options?.decoratorRow) {
			kernel.registerDecorator(TableNode$1.getType(), { multi: [...options.decoratorCol ? [{
				queryDOM: (el) => el.querySelector(".toolbar-col"),
				render: (node, editor) => {
					return options.decoratorCol?.(node, editor) || null;
				}
			}] : [], ...options.decoratorRow ? [{
				queryDOM: (el) => el.querySelector(".toolbar-row"),
				render: (node, editor) => {
					return options.decoratorRow?.(node, editor) || null;
				}
			}] : []] });
			this.registeredDecorators.add(TableNode$1.getType());
		}
		kernel.registerThemes({
			table: "editor_table",
			tableCell: "editor_table_cell",
			tableCellHeader: "editor_table_cell_header",
			tableCellSelected: "editor_table_cell_selected",
			tableScrollableWrapper: cx("editor_table_scrollable_wrapper", options?.theme)
		});
	}
	onInit(editor) {
		this.register(registerTableCellUnmergeTransform(editor));
		this.register(registerSingleCellTablePaste(editor));
		if (!isHeadlessEditor(editor)) {
			setScrollableTablesActive(editor, true);
			this.register(registerTablePlugin(editor));
			this.register(registerTableSelectionObserver(editor));
			this.register(registerTableCommand(editor));
		}
		this.registerMarkdown();
		this.registerLiteXml();
		this.registerControllerMenu();
		this.registerBlockSelect();
	}
	registerBlockSelect() {
		const blockMenuService = this.kernel.requireService(IBlockMenuService);
		if (!blockMenuService) return;
		this.register(blockMenuService.registerSelectHandler({
			key: "__table_block_select_handler",
			onSelect: (node) => {
				if (!$isTableNode(node)) return false;
				const [tableMap] = $computeTableMapSkipCellCheck(node, null, null);
				const firstCell = tableMap[0]?.[0]?.cell;
				const lastCell = [...tableMap].reverse().find((row) => row.length > 0)?.at(-1)?.cell;
				if (!firstCell || !lastCell) return false;
				const tableSelection = $createTableSelection();
				tableSelection.set(node.getKey(), firstCell.getKey(), lastCell.getKey());
				$setSelection(tableSelection);
				return true;
			},
			order: 100
		}));
	}
	registerControllerMenu() {
		const tableControllerMenuService = this.kernel.requireService(ITableControllerMenuService);
		if (!tableControllerMenuService) return;
		[
			tableControllerMenuService.registerItem({
				key: "__table_column_insert_before",
				label: "Insert before",
				onClick: ({ editor, node, selectedIndexes }) => {
					const { start } = getSelectedRange(selectedIndexes);
					editor.dispatchCommand(INSERT_TABLE_COLUMN_COMMAND, {
						columnIndex: start,
						insertAfter: false,
						table: node.getKey()
					});
				},
				order: 10,
				preview: "insert-before",
				when: ({ axis }) => axis === "column"
			}),
			tableControllerMenuService.registerItem({
				key: "__table_column_insert_after",
				label: "Insert after",
				onClick: ({ editor, node, selectedIndexes }) => {
					const { end } = getSelectedRange(selectedIndexes);
					editor.dispatchCommand(INSERT_TABLE_COLUMN_COMMAND, {
						columnIndex: end,
						insertAfter: true,
						table: node.getKey()
					});
				},
				order: 20,
				preview: "insert-after",
				when: ({ axis }) => axis === "column"
			}),
			tableControllerMenuService.registerItem({
				key: "__table_column_separator_delete",
				order: 40,
				type: "separator",
				when: ({ axis }) => axis === "column"
			}),
			tableControllerMenuService.registerItem({
				key: "__table_column_sync_width",
				label: "Sync width to all columns",
				onClick: ({ editor, node, selectedIndexes }) => {
					const columnIndex = selectedIndexes[0];
					if (columnIndex === void 0) return;
					editor.dispatchCommand(SYNC_TABLE_COLUMN_WIDTH_COMMAND, {
						columnIndex,
						table: node.getKey()
					});
				},
				order: 30,
				when: ({ axis, selectedIndexes }) => axis === "column" && selectedIndexes.length > 0
			}),
			tableControllerMenuService.registerItem({
				key: "__table_column_auto_fit_width",
				label: "Auto fit width",
				onClick: ({ editor, node, selectedIndexes }) => {
					editor.dispatchCommand(AUTO_FIT_TABLE_COLUMN_WIDTH_COMMAND, {
						columnIndexes: selectedIndexes,
						table: node.getKey()
					});
				},
				order: 35,
				when: ({ axis, selectedIndexes }) => axis === "column" && selectedIndexes.length > 0
			}),
			tableControllerMenuService.registerItem({
				key: "__table_column_distribute_width",
				label: "Distribute width",
				onClick: ({ editor, node }) => {
					editor.dispatchCommand(DISTRIBUTE_TABLE_COLUMN_WIDTH_COMMAND, { table: node.getKey() });
				},
				order: 36,
				when: ({ axis }) => axis === "column"
			}),
			tableControllerMenuService.registerItem({
				danger: true,
				key: "__table_column_delete",
				label: "Delete",
				onClick: ({ editor }) => {
					editor.update(() => {
						$deleteTableColumnAtSelection();
					});
				},
				order: 40,
				preview: "delete",
				when: ({ axis }) => axis === "column"
			}),
			tableControllerMenuService.registerItem({
				key: "__table_row_insert_above",
				label: "Insert above",
				onClick: ({ editor, node, selectedIndexes }) => {
					const { start } = getSelectedRange(selectedIndexes);
					editor.dispatchCommand(INSERT_TABLE_ROW_COMMAND, {
						insertAfter: false,
						rowIndex: start,
						table: node.getKey()
					});
				},
				order: 10,
				preview: "insert-before",
				when: ({ axis }) => axis === "row"
			}),
			tableControllerMenuService.registerItem({
				key: "__table_row_insert_below",
				label: "Insert below",
				onClick: ({ editor, node, selectedIndexes }) => {
					const { end } = getSelectedRange(selectedIndexes);
					editor.dispatchCommand(INSERT_TABLE_ROW_COMMAND, {
						insertAfter: true,
						rowIndex: end,
						table: node.getKey()
					});
				},
				order: 20,
				preview: "insert-after",
				when: ({ axis }) => axis === "row"
			}),
			tableControllerMenuService.registerItem({
				key: "__table_row_separator_delete",
				order: 30,
				type: "separator",
				when: ({ axis }) => axis === "row"
			}),
			tableControllerMenuService.registerItem({
				danger: true,
				key: "__table_row_delete",
				label: "Delete",
				onClick: ({ editor }) => {
					editor.update(() => {
						$deleteTableRowAtSelection();
					});
				},
				order: 40,
				preview: "delete",
				when: ({ axis }) => axis === "row"
			})
		].forEach((unregister) => {
			this.register(unregister);
		});
	}
	registerLiteXml() {
		const litexmlService = this.kernel.requireService(ILitexmlService);
		if (!litexmlService) return;
		litexmlService.registerXMLWriter(TableNode$1.getType(), (node, ctx) => {
			if ($isTableNode(node)) {
				const attributes = {};
				const colWidths = node.getColWidths();
				if (colWidths && colWidths.length > 0) attributes.colWidths = colWidths.join(",");
				return ctx.createXmlNode("table", attributes);
			}
			return false;
		});
		litexmlService.registerXMLWriter(TableRowNode.getType(), (node, ctx) => {
			if (node instanceof TableRowNode) return ctx.createXmlNode("tr", {});
			return false;
		});
		litexmlService.registerXMLWriter(TableCellNode.getType(), (node, ctx) => {
			if (node instanceof TableCellNode) {
				const attributes = {};
				if (node.getColSpan() > 1) attributes.colSpan = node.getColSpan().toString();
				if (node.getRowSpan() > 1) attributes.rowSpan = node.getRowSpan().toString();
				if (node.getBackgroundColor()) attributes.backgroundColor = node.getBackgroundColor();
				return ctx.createXmlNode("td", attributes);
			}
			return false;
		});
		litexmlService.registerXMLReader("table", (xmlNode, children) => {
			const colWidthsAttr = xmlNode.getAttribute("colWidths");
			const colWidths = colWidthsAttr ? colWidthsAttr.split(",").map((width) => parseInt(width, 10)) : [];
			let maxTdlen = 1;
			for (const child of children) if ((child.children?.length || -1) > maxTdlen) maxTdlen = child.children.length;
			return INodeHelper.createElementNode(TableNode$1.getType(), {
				children,
				colWidths: colWidths.length > 0 ? colWidths : createDefaultTableColWidths(maxTdlen),
				direction: null,
				format: "",
				indent: 0,
				version: 1
			});
		});
		litexmlService.registerXMLReader("tr", (_xmlNode, children) => {
			return INodeHelper.createElementNode(TableRowNode.getType(), {
				children,
				direction: "ltr",
				format: "",
				height: 33,
				indent: 0,
				version: 1
			});
		});
		const tdReader = (xmlNode, children) => {
			return INodeHelper.createElementNode(TableCellNode.getType(), {
				backgroundColor: xmlNode.getAttribute("backgroundColor") || null,
				children,
				colSpan: xmlNode.getAttribute("colSpan") ? parseInt(xmlNode.getAttribute("colSpan"), 10) : 1,
				direction: "ltr",
				format: "",
				headerState: 0,
				indent: 0,
				rowSpan: xmlNode.getAttribute("rowSpan") ? parseInt(xmlNode.getAttribute("rowSpan"), 10) : 1,
				version: 1
			});
		};
		litexmlService.registerXMLReader("th", tdReader);
		litexmlService.registerXMLReader("td", tdReader);
	}
	registerMarkdown() {
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		if (!markdownService) return;
		markdownService.registerMarkdownWriter(TableNode$1.getType(), (ctx) => {
			ctx.wrap("", "\n");
		});
		markdownService.registerMarkdownWriter(TableRowNode.getType(), (ctx, node) => {
			const parent = node.getParent();
			if (!$isTableNode(parent)) return;
			if (!node.getPreviousSiblings().some((sibling) => !isRemovedTableRowDiff(sibling))) ctx.wrap("", `\n${parent.getColWidths()?.map(() => {
				return "|:--";
			}).join("")}|\n`);
			else ctx.wrap("", "\n");
		});
		markdownService.registerMarkdownWriter(TableCellNode.getType(), (ctx, node) => {
			ctx.addProcessor(tableCellProcessor);
			if (!node.getNextSibling()) ctx.wrap("|", "|");
			else ctx.wrap("|", "");
		});
		markdownService.registerMarkdownReader("table", (node, children) => {
			const colLen = node.children[0]?.children.length || 1;
			return INodeHelper.createElementNode("table", {
				children,
				colWidths: createDefaultTableColWidths(colLen),
				direction: null,
				format: "",
				indent: 0,
				version: 1
			});
		});
		markdownService.registerMarkdownReader("tableRow", (_node, children) => {
			return INodeHelper.createElementNode("tablerow", {
				children,
				direction: "ltr",
				format: "",
				height: 33,
				indent: 0,
				version: 1
			});
		});
		markdownService.registerMarkdownReader("tableCell", (_node, children) => {
			return INodeHelper.createElementNode("tablecell", {
				backgroundColor: null,
				children,
				colSpan: 1,
				direction: "ltr",
				format: "",
				headerState: 0,
				indent: 0,
				rowSpan: 1,
				version: 1
			});
		});
	}
};
//#endregion
//#region src/plugins/collapsible/node/CollapsibleNode.ts
const CONTENT_SELECTOR = "[data-collapsible-content=\"true\"]";
const TOGGLE_SELECTOR = "[data-collapsible-toggle=\"true\"]";
var CollapsibleNode = class CollapsibleNode extends ElementNode {
	static getType() {
		return "collapsible";
	}
	static clone(node) {
		return new CollapsibleNode(node.__title, node.__collapsed, node.__key);
	}
	static importDOM() {
		return { details: () => ({
			conversion: $convertDetailsElement,
			priority: 1
		}) };
	}
	static importJSON(serializedNode) {
		const node = $createCollapsibleNode(serializedNode.title || "Details").updateFromJSON(serializedNode);
		if (shouldPrependTitle(serializedNode)) {
			const titleParagraph = $createTitleParagraph(serializedNode.title || "Details");
			const firstChild = node.getFirstChild();
			if (firstChild) firstChild.insertBefore(titleParagraph);
			else node.append(titleParagraph);
		}
		return node;
	}
	constructor(title = "Details", collapsed = false, key) {
		super(key);
		this.__title = title;
		this.__collapsed = collapsed;
	}
	createDOM(config, editor) {
		const element = document.createElement("section");
		addClassNamesToElement(element, config.theme.collapsible);
		element.dataset.collapsible = "true";
		element.dataset.collapsibleCollapsed = String(this.__collapsed);
		const toggle = document.createElement("button");
		toggle.type = "button";
		toggle.contentEditable = "false";
		toggle.dataset.collapsibleToggle = "true";
		toggle.setAttribute("aria-expanded", String(!this.__collapsed));
		toggle.setAttribute("aria-label", this.__collapsed ? "Expand collapsible block" : "Collapse collapsible block");
		toggle.addEventListener("click", () => {
			editor.update(() => {
				const latest = this.getLatest();
				if ($isCollapsibleNode(latest)) latest.setCollapsed(!latest.isCollapsed());
			});
		});
		const content = document.createElement("div");
		content.dataset.collapsibleContent = "true";
		element.append(toggle, content);
		return element;
	}
	updateDOM(prevNode, dom) {
		const toggle = dom.querySelector(TOGGLE_SELECTOR);
		dom.dataset.collapsibleCollapsed = String(this.__collapsed);
		if (toggle && prevNode.__collapsed !== this.__collapsed) {
			toggle.setAttribute("aria-expanded", String(!this.__collapsed));
			toggle.setAttribute("aria-label", this.__collapsed ? "Expand collapsible block" : "Collapse collapsible block");
		}
		return false;
	}
	exportDOM() {
		const element = document.createElement("details");
		if (!this.__collapsed) element.setAttribute("open", "");
		const summary = document.createElement("summary");
		summary.textContent = this.getTitle();
		element.append(summary);
		return { element };
	}
	exportJSON() {
		return {
			...super.exportJSON(),
			collapsed: this.isCollapsed(),
			title: this.getTitle()
		};
	}
	getDOMSlot(element) {
		const content = element.querySelector(CONTENT_SELECTOR);
		if (content instanceof HTMLElement) return super.getDOMSlot(element).withElement(content);
		return super.getDOMSlot(element);
	}
	getTitle() {
		const latest = this.getLatest();
		const firstChild = latest.getFirstChild();
		return firstChild ? firstChild.getTextContent().trim() : latest.__title;
	}
	isCollapsed() {
		return this.getLatest().__collapsed;
	}
	isShadowRoot() {
		return true;
	}
	setCollapsed(collapsed) {
		const writable = this.getWritable();
		writable.__collapsed = collapsed;
		return writable;
	}
	setTitle(title) {
		const writable = this.getWritable();
		writable.__title = title;
		return writable;
	}
	updateFromJSON(serializedNode) {
		return super.updateFromJSON(serializedNode).setTitle(serializedNode.title || "Details").setCollapsed(Boolean(serializedNode.collapsed));
	}
};
function $createCollapsibleNode(title = "Details", collapsed = false) {
	return $applyNodeReplacement(new CollapsibleNode(title, collapsed));
}
function $isCollapsibleNode(node) {
	return node instanceof CollapsibleNode;
}
function $convertDetailsElement(domNode) {
	if (!(domNode instanceof HTMLDetailsElement)) return { node: null };
	return { node: $createCollapsibleNode(domNode.querySelector("summary")?.textContent?.trim() || "Details", !domNode.open) };
}
function $createTitleParagraph(title) {
	const paragraph = $createParagraphNode();
	paragraph.append($createTextNode(title));
	return paragraph;
}
function getSerializedText(node) {
	if (!node || typeof node !== "object") return "";
	if ("text" in node && typeof node.text === "string") return node.text;
	if ("children" in node && Array.isArray(node.children)) return node.children.map((child) => getSerializedText(child)).join("");
	return "";
}
function shouldPrependTitle(serializedNode) {
	const title = serializedNode.title?.trim();
	if (!title) return false;
	const firstChild = (Array.isArray(serializedNode.children) ? serializedNode.children : [])[0];
	return getSerializedText(firstChild).trim() !== title;
}
//#endregion
//#region src/headless/collapsible-plugin.ts
const HeadlessCollapsiblePlugin = class extends KernelPlugin {
	static {
		this.pluginName = "HeadlessCollapsiblePlugin";
	}
	constructor(kernel) {
		super();
		this.kernel = kernel;
		kernel.registerNodes([CollapsibleNode]);
	}
	onInit(_editor) {
		const markdownService = this.kernel.requireService(IMarkdownShortCutService);
		markdownService?.registerMarkdownWriter(CollapsibleNode.getType(), (ctx, node) => {
			if (!$isCollapsibleNode(node)) return false;
			ctx.appendLine(`<details${node.isCollapsed() ? "" : " open"}>\n`);
			ctx.appendLine(`<summary>${escapeHtml(node.getTitle())}</summary>\n\n`);
			node.getChildren().slice(1).forEach((child) => ctx.processChild(ctx, child));
			ctx.appendLine("\n</details>\n");
			return true;
		});
		markdownService?.registerMarkdownReader("html", (node, children) => {
			const tag = getHtmlTagName(node.value);
			if (tag === "summary") return INodeHelper.createTypeNode("__collapsible_summary", { text: getNodeText(children) });
			if (tag !== "details") return false;
			const summaryNode = children.find((child) => child.type === "__collapsible_summary");
			const contentChildren = children.filter((child) => child.type !== "__collapsible_summary");
			const title = summaryNode && "text" in summaryNode && typeof summaryNode.text === "string" ? summaryNode.text : extractSummaryTitle(node.value) || "Details";
			return INodeHelper.createElementNode(CollapsibleNode.getType(), {
				children: ensureTitleChildren(contentChildren, title),
				collapsed: !/\sopen(?:\s|>|$)/i.test(node.value),
				title
			});
		});
		const litexmlService = this.kernel.requireService(ILitexmlService);
		litexmlService?.registerXMLWriter(CollapsibleNode.getType(), (node, ctx) => {
			if (!$isCollapsibleNode(node)) return false;
			return ctx.createXmlNode("collapsible", {
				collapsed: String(node.isCollapsed()),
				title: node.getTitle()
			});
		});
		litexmlService?.registerXMLReader("collapsible", (xmlNode, children) => {
			const title = xmlNode.getAttribute("title") || "Details";
			return INodeHelper.createElementNode(CollapsibleNode.getType(), {
				children: ensureTitleChildren(children, title),
				collapsed: xmlNode.getAttribute("collapsed") === "true",
				title
			});
		});
	}
};
const getHtmlTagName = (value) => value.match(/^<\/?\s*([\da-z-]+)/i)?.[1]?.toLowerCase() || "";
const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
const extractSummaryTitle = (value) => value.match(/<summary\b[^>]*>([\S\s]*?)<\/summary>/i)?.[1]?.trim() || "";
const getNodeText = (children) => children.map((child) => {
	if (!child || typeof child !== "object") return "";
	if ("text" in child && typeof child.text === "string") return child.text;
	if ("children" in child && Array.isArray(child.children)) return getNodeText(child.children);
	return "";
}).join("");
const ensureTitleChildren = (children, title) => {
	const trimmedTitle = title.trim();
	if (!trimmedTitle || getNodeText(children.slice(0, 1)).trim() === trimmedTitle) return children;
	return [INodeHelper.createParagraph({ children: [INodeHelper.createTextNode(title)] }), ...children];
};
//#endregion
//#region src/headless/extract-media-from-editor-state.ts
const IMAGE_TYPES = /* @__PURE__ */ new Set(["image", "block-image"]);
const FILE_TYPE = "file";
const generateId = () => {
	if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
	return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};
const inferFileType = (name) => {
	const dotIndex = name.lastIndexOf(".");
	if (dotIndex < 0 || dotIndex === name.length - 1) return "unknown";
	return name.slice(dotIndex + 1).toLowerCase() || "unknown";
};
const extractMediaFromEditorState = (state) => {
	const imageList = [];
	const fileList = [];
	const visit = (node) => {
		const type = node.type;
		if (IMAGE_TYPES.has(type)) {
			if (node.status === "uploaded" && typeof node.src === "string" && node.src) imageList.push({
				alt: typeof node.altText === "string" ? node.altText : "",
				id: generateId(),
				url: node.src
			});
			return;
		}
		if (type === FILE_TYPE) {
			if (node.status === "uploaded" && typeof node.fileUrl === "string" && node.fileUrl) {
				const name = typeof node.name === "string" ? node.name : "unknown";
				fileList.push({
					fileType: inferFileType(name),
					id: generateId(),
					name,
					size: typeof node.size === "number" ? node.size : 0,
					url: node.fileUrl
				});
			}
			return;
		}
		if (Array.isArray(node.children)) for (const child of node.children) visit(child);
	};
	const root = state?.root;
	if (root && Array.isArray(root.children)) for (const child of root.children) visit(child);
	return {
		fileList,
		imageList
	};
};
//#endregion
//#region src/headless/index.ts
const createCodeChildrenFromLegacyCode = (code) => code.split("\n").flatMap((text, index, array) => {
	const textNode = {
		detail: 0,
		format: 0,
		mode: "normal",
		style: "",
		text,
		type: "code-highlight",
		version: 1
	};
	if (index === array.length - 1) return textNode;
	return [textNode, {
		type: "linebreak",
		version: 1
	}];
});
const normalizeLegacyEditorDataNode = (node) => {
	if (!node || typeof node !== "object") return node;
	const record = node;
	const children = Array.isArray(record.children) ? record.children.map((child) => normalizeLegacyEditorDataNode(child)) : record.children;
	if (record.type === "code" && typeof record.code === "string" && !Array.isArray(children)) return {
		...record,
		children: createCodeChildrenFromLegacyCode(record.code),
		direction: record.direction ?? "ltr",
		format: record.format ?? "",
		indent: record.indent ?? 0,
		language: record.language ?? "plaintext",
		theme: record.theme ?? record.codeTheme
	};
	if (Array.isArray(children)) return {
		...record,
		children
	};
	return record;
};
const normalizeLegacyEditorData = (editorData) => {
	const data = typeof editorData === "string" ? JSON.parse(editorData) : editorData;
	return {
		...data,
		root: normalizeLegacyEditorDataNode(data.root)
	};
};
const extractSerializedCodeText = (children) => children.map((child) => {
	if (!child || typeof child !== "object") return "";
	const record = child;
	if (record.type === "linebreak") return "\n";
	if (record.type === "tab") return "	";
	if (typeof record.text === "string") return record.text;
	if (Array.isArray(record.children)) return extractSerializedCodeText(record.children);
	return "";
}).join("");
const preserveSerializedCodeText = (node) => {
	if (!node || typeof node !== "object") return node;
	const record = node;
	const children = Array.isArray(record.children) ? record.children.map((child) => preserveSerializedCodeText(child)) : record.children;
	if (record.type === "code" && Array.isArray(children)) return {
		...record,
		children,
		code: extractSerializedCodeText(children)
	};
	if (Array.isArray(children)) return {
		...record,
		children
	};
	return record;
};
const preserveSerializedCodeTextInEditorData = (editorData) => ({
	...editorData,
	root: preserveSerializedCodeText(editorData.root)
});
const DEFAULT_HEADLESS_EDITOR_PLUGINS = [
	[CommonPlugin, { enableHotkey: false }],
	INodePlugin,
	MarkdownPlugin,
	[LinkPlugin, { enableHotkey: false }],
	CodePlugin,
	CodemirrorPlugin,
	ImagePlugin,
	FilePlugin,
	MathPlugin,
	MentionPlugin,
	HRPlugin,
	ListPlugin,
	TablePlugin,
	HeadlessCollapsiblePlugin,
	LitexmlPlugin
];
var HeadlessEditor = class {
	constructor(options = {}) {
		this.kernel = Editor.createEditor();
		const plugins = [...options.plugins ?? DEFAULT_HEADLESS_EDITOR_PLUGINS, ...options.additionalPlugins ?? []];
		this.kernel.registerPlugins(plugins);
		this.kernel.initHeadlessEditor();
		if (options.initialValue) this.hydrate(options.initialValue);
	}
	hydrate(input) {
		this.kernel.setDocument(input.type, input.content, input.options);
		return this;
	}
	hydrateEditorData(editorData, options) {
		this.kernel.setDocument("json", normalizeLegacyEditorData(editorData), options);
		return this;
	}
	hydrateLiteXML(litexml, options) {
		this.kernel.setDocument("litexml", litexml, options);
		return this;
	}
	hydrateMarkdown(markdown, options) {
		this.kernel.setDocument("markdown", markdown, options);
		return this;
	}
	async applyLiteXML(operation) {
		const operations = Array.isArray(operation) ? operation : [operation];
		for (const item of operations) this.applyLiteXMLOperation(item);
		await moment();
		return this;
	}
	async applyLiteXMLBatch(operations) {
		this.kernel.dispatchCommand(LITEXML_MODIFY_COMMAND, operations);
		await moment();
		return this;
	}
	async applyLiteXMLBatchWithResults(operations) {
		let results;
		if (!this.kernel.dispatchCommand(LITEXML_MODIFY_WITH_RESULTS_COMMAND, {
			onResults: (operationResults) => {
				results = operationResults;
			},
			operations
		}) || !results) throw new Error("LiteXML batch result command is not registered.");
		await moment();
		return results;
	}
	export(options = {}) {
		const snapshot = {
			editorData: preserveSerializedCodeTextInEditorData(this.kernel.getDocument("json")),
			markdown: this.kernel.getDocument("markdown")
		};
		if (options.litexml) snapshot.litexml = this.kernel.getDocument("litexml");
		return snapshot;
	}
	exportState(options) {
		return this.export(options);
	}
	destroy() {
		this.kernel.destroy();
	}
	applyLiteXMLOperation(operation) {
		switch (operation.action) {
			case "apply":
			case "replace":
				this.kernel.dispatchCommand(LITEXML_APPLY_COMMAND, {
					delay: operation.delay,
					litexml: operation.litexml
				});
				return;
			case "batch":
				this.kernel.dispatchCommand(LITEXML_MODIFY_COMMAND, operation.operations);
				return;
			case "insert":
				this.kernel.dispatchCommand(LITEXML_INSERT_COMMAND, operation);
				return;
			case "remove":
				this.kernel.dispatchCommand(LITEXML_REMOVE_COMMAND, {
					delay: operation.delay,
					id: operation.id
				});
				return;
		}
	}
};
function createHeadlessEditor(options) {
	return new HeadlessEditor(options);
}
//#endregion
export { $getNodeById, $getNodeId, DEFAULT_HEADLESS_EDITOR_PLUGINS, HeadlessEditor, INodeIdentityService, createHeadlessEditor, extractMediaFromEditorState };

// Owned browser opt-in exports. Kernel.setRootElement uses lexical.createEditor,
// never a HeadlessEditor instance. No default browser business caller is changed.
export { Kernel as NativeBrowserKernel, CommonPlugin, MarkdownPlugin, ListPlugin, LitexmlPlugin, TablePlugin, FilePlugin, ImagePlugin, CodemirrorPlugin, MathPlugin, LinkPlugin, MentionPlugin, TOGGLE_LINK_COMMAND, SELECT_TABLE_COMMAND, INSERT_TABLE_COLUMN_COMMAND, INSERT_TABLE_ROW_COMMAND, MOVE_TABLE_ROW_COMMAND, MOVE_TABLE_COLUMN_COMMAND, SYNC_TABLE_COLUMN_WIDTH_COMMAND, AUTO_FIT_TABLE_COLUMN_WIDTH_COMMAND, DISTRIBUTE_TABLE_COLUMN_WIDTH_COMMAND };

// Exact current kernel-registered service/command objects for the code island.
export { ICodemirrorEditLockService, SELECT_BEFORE_CODEMIRROR_COMMAND, SELECT_AFTER_CODEMIRROR_COMMAND };

// Upload closure restored from installed SDK 4.29.2; IUploadService is the existing kernel identity.
import { DROP_COMMAND, getDOMSelectionFromTarget } from "lexical";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
var UploadService = class {
	constructor() {
		this.uploadHandlers = [
			[],
			[],
			[]
		];
	}
	registerUpload(handler, priority = 2) {
		this.uploadHandlers[priority].push(handler);
	}
	async uploadFile(file, from, range) {
		for (const uploadHandlers of this.uploadHandlers) {
			if (uploadHandlers.length === 0) continue;
			for (const handler of uploadHandlers) {
				const result = await handler(file, from, range);
				if (result) return result;
			}
		}
		throw new Error("No upload handler registered for this file type: " + file.type);
	}
};
function getDragSelection(event) {
	if (typeof document === "undefined") return null;
	let range;
	const domSelection = getDOMSelectionFromTarget(event.target);
	if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(event.clientX, event.clientY);
	else if (event.rangeParent && domSelection !== null) {
		domSelection.collapse(event.rangeParent, event.rangeOffset || 0);
		range = domSelection.getRangeAt(0);
	} else throw new Error(`Cannot get the selection when dragging`);
	return range;
}
const UploadPlugin = class extends KernelPlugin {
	static {
		this.pluginName = "UploadPlugin";
	}
	constructor(kernel, config) {
		super();
		this.kernel = kernel;
		this.config = config;
		this.logger = createDebugLogger("plugin", "upload");
		kernel.registerService(IUploadService, new UploadService());
	}
	onInit(editor) {
		this.register(editor.registerCommand(DROP_COMMAND, (event) => {
		if (!editor.isEditable()) return false;
			const dataTransfer = event.dataTransfer;
			if (dataTransfer && dataTransfer.files.length > 0) {
				event.preventDefault();
				event.stopImmediatePropagation();
				const file = dataTransfer.files[0];
				const uploadService = this.kernel.requireService(IUploadService);
				if (uploadService) uploadService.uploadFile(file, "drop", getDragSelection(event)).catch((error) => {
					this.logger.error("Upload failed:", error);
				});
			}
			return true;
		}, COMMAND_PRIORITY_HIGH));
		this.register(editor.registerCommand(DRAG_DROP_PASTE, (files) => {
		if (!editor.isEditable()) return false;
			for (const file of files) {
				const uploadService = this.kernel.requireService(IUploadService);
				if (uploadService) uploadService.uploadFile(file, "drag-drop-paste", null).catch((error) => {
					this.logger.error("Upload failed:", error);
				});
			}
			return true;
		}, COMMAND_PRIORITY_HIGH));
	}
};

export { UploadPlugin };

// Same objects consumed by native upload plugins; never recreate a command.
export { INSERT_FILE_COMMAND, INSERT_IMAGE_COMMAND };

// Actual pure-node identities for the owned math decorator.
export { MathInlineNode as NativeMathInlineNode, MathBlockNode as NativeMathBlockNode };

// Existing listener-owned command identities; never recreate command objects.
export { INSERT_MENTION_COMMAND, UPDATE_LINK_TEXT_COMMAND, UNLINK_LINK_COMMAND };

// Virtual block behavior from SDK 4.29.2, bound to this local closure's commands.
//#region src/plugins/virtual-block/plugin/register.ts
const nativeVirtualBlockLogger = createDebugLogger("plugin", "virtual-block");
function nativeVirtualRootElement(node) {
	let currentNode = node;
	let parent = currentNode.getParent();
	while (parent !== null && !$isRootOrShadowRoot(parent)) {
		currentNode = parent;
		parent = currentNode.getParent();
	}
	return currentNode;
}
function $isNativeVirtualEmptyNode(node) {
	if (node.getChildrenSize() === 0) return true;
	for (const child of node.getChildren()) if ($isTextNode(child)) {
		if (child.getTextContent().trim().length > 0) return false;
	} else if ($isElementNode(child)) {
		if (!$isNativeVirtualEmptyNode(child)) return false;
	} else return false;
	return true;
}
function $getNativeVirtualListItem(selection) {
	const focusNode = selection.focus.getNode();
	const listNode = nativeVirtualRootElement(focusNode);
	if (!$isListNode(listNode)) return null;
	let current = focusNode;
	while (current.getParent() !== listNode) {
		const parent = current.getParent();
		if (!parent || $isRootOrShadowRoot(parent)) return null;
		current = parent;
	}
	if (!$isListItemNode(current)) return null;
	return {
		listItem: current,
		listNode
	};
}
function $isNativeVirtualListBoundary(selection, isBackward) {
	if (!selection.isCollapsed()) return false;
	const focusNode = selection.focus.getNode();
	if ($isListNode(focusNode)) return isBackward ? selection.focus.offset === 0 : selection.focus.offset === focusNode.getChildrenSize();
	const listContext = $getNativeVirtualListItem(selection);
	if (!listContext) return false;
	const { listItem } = listContext;
	return isBackward ? !listItem.getPreviousSibling() : !listItem.getNextSibling();
}
function registerNativeVirtualBlockKeys(editor, kernel) {
	let needRemoveOnFocusNode = null;
	return mergeRegister(editor.registerUpdateListener((payload) => {
		const { mutatedNodes } = payload;
		if (needRemoveOnFocusNode) {
			if (mutatedNodes?.get(ParagraphNode)?.get(needRemoveOnFocusNode.getKey()) === "destroyed") {
				console.info("Virtual block node was removed externally", needRemoveOnFocusNode);
				needRemoveOnFocusNode = null;
				return;
			}
			editor.update(() => {
				try {
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						const focusNode = selection.focus.getNode();
						if (needRemoveOnFocusNode && !$closest(focusNode, (node) => node === needRemoveOnFocusNode)) {
							if ($isNativeVirtualEmptyNode(needRemoveOnFocusNode)) {
								nativeVirtualBlockLogger.info("Removing virtual block node after focus moved away", needRemoveOnFocusNode);
								needRemoveOnFocusNode?.remove();
								needRemoveOnFocusNode = null;
							} else needRemoveOnFocusNode = null;
							return;
						}
					} else if ($isNodeSelection(selection) && needRemoveOnFocusNode) {
						if ($isNativeVirtualEmptyNode(needRemoveOnFocusNode)) {
							needRemoveOnFocusNode?.remove();
							needRemoveOnFocusNode = null;
						} else needRemoveOnFocusNode = null;
						return;
					}
				} catch (error) {
					console.error("Error during virtual block cleanup", error);
				}
			});
		}
	}), kernel.registerHighCommand(KEY_ARROW_UP_COMMAND, (event) => {
		const selection = $getSelection();
		if (event.shiftKey) return false;
		if ($isNodeSelection(selection)) {
			const nodes = selection.getNodes();
			if (nodes.length > 0) {
				const elementNode = nativeVirtualRootElement(nodes[0]);
				event.preventDefault();
				const p = $createParagraphNode();
				needRemoveOnFocusNode = p;
				elementNode.insertBefore(p);
				p.selectEnd();
				return true;
			}
		} else if ($isRangeSelection(selection)) {
			const possibleNode = nativeVirtualRootElement(selection.focus.getNode());
			if (possibleNode === needRemoveOnFocusNode || $isNativeVirtualEmptyNode(possibleNode)) return false;
			if ($isListNode(possibleNode) && !$isNativeVirtualListBoundary(selection, true)) return false;
			if ($getRoot().getFirstChild() === possibleNode || $isDecoratorNode(possibleNode.getPreviousSibling())) {
				event.preventDefault();
				const p = $createParagraphNode();
				possibleNode.insertBefore(p);
				needRemoveOnFocusNode = p;
				p.selectStart();
				return true;
			}
		}
		return false;
	}, COMMAND_PRIORITY_NORMAL), kernel.registerHighCommand(KEY_ARROW_DOWN_COMMAND, (event) => {
		const selection = $getSelection();
		if ($isNodeSelection(selection)) {
			const nodes = selection.getNodes();
			if (nodes.length > 0) {
				const node = nodes[0];
				const blockNode = nativeVirtualRootElement(node);
				event.preventDefault();
				const p = $createParagraphNode();
				needRemoveOnFocusNode = p;
				blockNode.insertAfter(p);
				p.selectStart();
				return true;
			}
		} else if ($isRangeSelection(selection)) {
			if (!selection.isCollapsed()) return false;
			const possibleNode = nativeVirtualRootElement(selection.focus.getNode());
			if (possibleNode === needRemoveOnFocusNode || $isNativeVirtualEmptyNode(possibleNode)) return false;
			if ($isListNode(possibleNode) && !$isNativeVirtualListBoundary(selection, false)) return false;
			if ($getRoot().getLastChild() === possibleNode) {
				event.preventDefault();
				const p = $createParagraphNode();
				possibleNode.insertAfter(p);
				needRemoveOnFocusNode = p;
				p.selectStart();
				return true;
			}
		}
		return false;
	}, COMMAND_PRIORITY_NORMAL), editor.registerCommand(SELECT_BEFORE_CODEMIRROR_COMMAND, (payload) => {
		editor.update(() => {
			const node = $getNodeByKey(payload.key);
			if (!node) return;
			const p = $createParagraphNode();
			needRemoveOnFocusNode = p;
			node.insertBefore(p);
			p.selectEnd();
			editor.focus();
			return true;
		});
		return true;
	}, COMMAND_PRIORITY_NORMAL), editor.registerCommand(SELECT_AFTER_CODEMIRROR_COMMAND, (payload) => {
		editor.update(() => {
			const node = $getNodeByKey(payload.key);
			if (!node) return;
			const p = $createParagraphNode();
			needRemoveOnFocusNode = p;
			node.insertAfter(p);
			p.selectEnd();
			editor.focus();
			return true;
		});
		return true;
	}, COMMAND_PRIORITY_NORMAL));
}
//#endregion

class NativeVirtualBlockPlugin extends KernelPlugin {
  static pluginName = "NativeVirtualBlockPlugin";
  constructor(kernel, config) { super(); this.kernel = kernel; kernel.registerThemes({ virtualBlock: config?.theme || "" }); }
  onInit(editor) { this.register(registerNativeVirtualBlockKeys(editor, this.kernel)); }
}
export { NativeVirtualBlockPlugin, ILitexmlService, IMarkdownShortCutService };
