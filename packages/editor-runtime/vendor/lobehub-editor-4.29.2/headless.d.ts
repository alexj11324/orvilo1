import { a as IPlugin, i as IEditor, n as NodeIdentitySnapshot, r as IDocumentOptions, t as INodeIdentityService } from "./i-node-identity-service-BBC_bg97.js";
import { o as LITEXML_MODIFY_COMMAND, u as LiteXmlOperationResult } from "./symbols-Dyr9yyS0.js";
import { $getNodeById, $getNodeId } from "./plugins/common/node/node-id.js";
import { DecoratorNode, CommandPayloadType, ElementNode, LexicalEditor, LexicalNode, SerializedEditorState, SerializedLexicalNode } from "lexical";
//#region src/headless/extract-media-from-editor-state.d.ts
interface ImageListItem {
  alt: string;
  id: string;
  url: string;
}
interface FileListItem {
  fileType: string;
  id: string;
  name: string;
  size: number;
  url: string;
}
interface MediaLists {
  fileList: FileListItem[];
  imageList: ImageListItem[];
}
declare const extractMediaFromEditorState: (state: SerializedEditorState | null | undefined) => MediaLists;
//#endregion
//#region src/headless/index.d.ts
type HeadlessDocumentType = 'json' | 'litexml' | 'markdown' | (string & object);
interface HeadlessEditorHydrationInput {
  content: unknown;
  options?: IDocumentOptions;
  type: HeadlessDocumentType;
}
interface HeadlessEditorExportOptions {
  litexml?: boolean;
}
interface HeadlessEditorExport {
  editorData: SerializedEditorState<SerializedLexicalNode>;
  litexml?: string;
  markdown: string;
}
interface HeadlessEditorOptions {
  additionalPlugins?: ReadonlyArray<IPlugin>;
  initialValue?: HeadlessEditorHydrationInput;
  plugins?: ReadonlyArray<IPlugin>;
}
interface HeadlessLiteXMLReplaceOperation {
  action: 'apply' | 'replace';
  delay?: boolean;
  litexml: string | string[];
}
type HeadlessLiteXMLInsertOperation = {
  action: 'insert';
  afterId: string;
  delay?: boolean;
  litexml: string;
} | {
  action: 'insert';
  beforeId: string;
  delay?: boolean;
  litexml: string;
};
interface HeadlessLiteXMLRemoveOperation {
  action: 'remove';
  delay?: boolean;
  id: string;
}
interface HeadlessLiteXMLBatchOperation {
  action: 'batch';
  operations: CommandPayloadType<typeof LITEXML_MODIFY_COMMAND>;
}
type HeadlessLiteXMLOperation = HeadlessLiteXMLBatchOperation | HeadlessLiteXMLInsertOperation | HeadlessLiteXMLRemoveOperation | HeadlessLiteXMLReplaceOperation;
declare const DEFAULT_HEADLESS_EDITOR_PLUGINS: ReadonlyArray<IPlugin>;
declare class HeadlessEditor {
  readonly kernel: IEditor;
  constructor(options?: HeadlessEditorOptions);
  hydrate(input: HeadlessEditorHydrationInput): this;
  hydrateEditorData(editorData: SerializedEditorState<SerializedLexicalNode> | string, options?: IDocumentOptions): this;
  hydrateLiteXML(litexml: string, options?: IDocumentOptions): this;
  hydrateMarkdown(markdown: string, options?: IDocumentOptions): this;
  applyLiteXML(operation: HeadlessLiteXMLOperation | ReadonlyArray<HeadlessLiteXMLOperation>): Promise<this>;
  applyLiteXMLBatch(operations: CommandPayloadType<typeof LITEXML_MODIFY_COMMAND>): Promise<this>;
  applyLiteXMLBatchWithResults(operations: CommandPayloadType<typeof LITEXML_MODIFY_COMMAND>): Promise<LiteXmlOperationResult[]>;
  export(options?: HeadlessEditorExportOptions): HeadlessEditorExport;
  exportState(options?: HeadlessEditorExportOptions): HeadlessEditorExport;
  destroy(): void;
  private applyLiteXMLOperation;
}
declare function createHeadlessEditor(options?: HeadlessEditorOptions): HeadlessEditor;
//#endregion
export { $getNodeById, $getNodeId, DEFAULT_HEADLESS_EDITOR_PLUGINS, type FileListItem, HeadlessDocumentType, HeadlessEditor, HeadlessEditorExport, HeadlessEditorExportOptions, HeadlessEditorHydrationInput, HeadlessEditorOptions, HeadlessLiteXMLBatchOperation, HeadlessLiteXMLInsertOperation, HeadlessLiteXMLOperation, HeadlessLiteXMLRemoveOperation, HeadlessLiteXMLReplaceOperation, INodeIdentityService, type ImageListItem, type LiteXmlOperationResult, type MediaLists, type NodeIdentitySnapshot, createHeadlessEditor, extractMediaFromEditorState };

// Additional owned declarations paired with explicit browser runtime exports.
import type { IEditorKernel, IEditorPluginConstructor } from './i-node-identity-service-BBC_bg97.js';
export declare const NativeBrowserKernel: new () => IEditorKernel;
export declare const CommonPlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const MarkdownPlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const ListPlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const LitexmlPlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const TablePlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const FilePlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const ImagePlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const CodemirrorPlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const MathPlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const LinkPlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const MentionPlugin: IEditorPluginConstructor<Record<string, unknown>>;
export declare const SELECT_TABLE_COMMAND: import("lexical").LexicalCommand<{
  anchorIndex?: number;
  columnIndex?: number;
  extend?: boolean;
  rowIndex?: number;
  table: string;
}>;
export declare const INSERT_TABLE_COLUMN_COMMAND: import("lexical").LexicalCommand<{
  columnIndex: number;
  insertAfter?: boolean;
  table: string;
}>;
export declare const INSERT_TABLE_ROW_COMMAND: import("lexical").LexicalCommand<{
  insertAfter?: boolean;
  rowIndex: number;
  table: string;
}>;
export declare const TOGGLE_LINK_COMMAND: import("lexical").LexicalCommand<string | null | { url: string; target?: string; rel?: string; title?: string }>;
export declare const MOVE_TABLE_ROW_COMMAND: import("lexical").LexicalCommand<{ table: string; selectedRows: number[]; rowIndex: number; insertAfter?: boolean }>;
export declare const MOVE_TABLE_COLUMN_COMMAND: import("lexical").LexicalCommand<{ table: string; selectedColumns: number[]; columnIndex: number; insertAfter?: boolean }>;
export declare const SYNC_TABLE_COLUMN_WIDTH_COMMAND: import("lexical").LexicalCommand<{ table: string; columnIndex: number }>;
export declare const AUTO_FIT_TABLE_COLUMN_WIDTH_COMMAND: import("lexical").LexicalCommand<{ table: string; columnIndexes: number[] }>;
export declare const DISTRIBUTE_TABLE_COLUMN_WIDTH_COMMAND: import("lexical").LexicalCommand<{ table: string }>;

import type { IServiceID } from './i-node-identity-service-BBC_bg97.js';
interface CodemirrorEditLock {
  key: string;
  label?: string;
  updatedAt: number;
}
interface CodemirrorEditLockOwner {
  id: number | string;
  lock: CodemirrorEditLock;
  name?: string;
}
interface CodemirrorEditLockProvider {
  acquireLock: (key: string, label: string) => boolean;
  getRemoteLockOwner: (key: string) => CodemirrorEditLockOwner | null;
  releaseLock: (key: string) => void;
  subscribe: (listener: () => void) => () => void;
}
interface ICodemirrorEditLockService {
  acquireLock: (key: string, label: string) => boolean;
  getRemoteLockOwner: (key: string) => CodemirrorEditLockOwner | null;
  registerProvider: (provider: CodemirrorEditLockProvider) => () => void;
  releaseLock: (key: string) => void;
  subscribe: (listener: () => void) => () => void;
}
declare const ICodemirrorEditLockService: IServiceID<ICodemirrorEditLockService>;

export { type CodemirrorEditLock, type CodemirrorEditLockOwner, type CodemirrorEditLockProvider, ICodemirrorEditLockService };
export declare const SELECT_BEFORE_CODEMIRROR_COMMAND: import("lexical").LexicalCommand<{
  key: string;
}>;
export declare const SELECT_AFTER_CODEMIRROR_COMMAND: import("lexical").LexicalCommand<{
  key: string;
}>;

export declare const UploadPlugin: typeof FilePlugin;
export declare const INSERT_FILE_COMMAND: import("lexical").LexicalCommand<{ file: File }>;
export declare const INSERT_IMAGE_COMMAND: import("lexical").LexicalCommand<{ file: File; block?: boolean; maxWidth?: number; range?: Range | null }>;

/** Actual local MathPlugin node identities; not SDK React node copies. */
export declare class NativeMathInlineNode extends DecoratorNode<unknown> {
  constructor(code?: string, key?: import("lexical").NodeKey);
  readonly code: string;
  updateCode(code: string): void;
}
export declare class NativeMathBlockNode extends DecoratorNode<unknown> {
  constructor(code?: string, key?: import("lexical").NodeKey);
  readonly code: string;
  updateCode(code: string): void;
}

export declare const INSERT_MENTION_COMMAND: import("lexical").LexicalCommand<{ label: string; metadata?: Record<string, unknown> }>;
export declare const UPDATE_LINK_TEXT_COMMAND: import("lexical").LexicalCommand<{ key: string; text: string }>;
export declare const UNLINK_LINK_COMMAND: import("lexical").LexicalCommand<{ key: string }>;
