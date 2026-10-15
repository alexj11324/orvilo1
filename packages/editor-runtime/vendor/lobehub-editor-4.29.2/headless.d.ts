import { a as IPlugin, i as IEditor, n as NodeIdentitySnapshot, r as IDocumentOptions, t as INodeIdentityService } from "./i-node-identity-service-BBC_bg97.js";
import { o as LITEXML_MODIFY_COMMAND, u as LiteXmlOperationResult } from "./symbols-Dyr9yyS0.js";
import { $getNodeById, $getNodeId } from "./plugins/common/node/node-id.js";
import { CommandPayloadType, ElementNode, LexicalEditor, LexicalNode, SerializedEditorState, SerializedLexicalNode } from "lexical";
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