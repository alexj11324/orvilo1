import type { BaseSelection, LexicalEditor, LexicalNode, SerializedElementNode, SerializedLexicalNode, SerializedRootNode, SerializedTextNode } from 'lexical';
import type { Element as XMLElement } from '@xmldom/xmldom';
import type { remark } from 'remark';
import type { Transformer } from './plugins/markdown/service/transformers.js';

export interface NativeXMLNode {
  attributes: Record<string, string>;
  children?: NativeXMLNode[];
  tagName: string;
  textContent?: string;
}
export interface NativeXMLWriterContext {
  createXmlNode(tagName: string, attributes?: Record<string, string>, textContent?: string): NativeXMLNode;
}
export type NativeXMLReader = (element: XMLElement, children: SerializedLexicalNode[]) => SerializedLexicalNode | SerializedLexicalNode[] | false | void;
export type NativeXMLWriter = (node: LexicalNode, context: NativeXMLWriterContext, indent: number,
  nodeToXML: (node: LexicalNode, lines: string[], indent?: number) => void) => NativeXMLNode | { lines: string[] } | false;
export interface NativeLiteXMLService {
  getXMLReaders(): Record<string, NativeXMLReader | NativeXMLReader[]>;
  getXMLWriters(): Record<string, NativeXMLWriter | NativeXMLWriter[]>;
  hasXMLReader(tagName: string): boolean;
  hasXMLWriter(nodeType: string): boolean;
  registerXMLReader(tagName: string, reader: NativeXMLReader): void;
  registerXMLWriter(nodeType: string, writer: NativeXMLWriter): void;
}
export interface NativeMarkdownWriterContext {
  addProcessor(processor: (before: string, content: string, after: string) => string): void;
  appendLine(line: string): void;
  /** Already-owned raw markup path; remains distinct from escaped prose. */
  appendRawLine(line: string): void;
  newChild(): NativeMarkdownWriterContext;
  processChild(parentContext: NativeMarkdownWriterContext, child: LexicalNode): void;
  wrap(before: string, after: string): void;
}
type ParsedMarkdownRoot = ReturnType<typeof remark.parse>;
type MarkdownBlock = ParsedMarkdownRoot['children'][number];
type MarkdownInline = Extract<MarkdownBlock, { type: 'paragraph' }>['children'][number];
type MarkdownNode = ParsedMarkdownRoot | MarkdownBlock | MarkdownInline;
type MarkdownReadNode = SerializedLexicalNode | SerializedElementNode | SerializedTextNode;
type MarkdownNodeFor<K extends string> = [Extract<MarkdownNode, { type: K }>] extends [never]
  ? { type: K; [key: string]: unknown } : Extract<MarkdownNode, { type: K }>;
export interface NativeMarkdownShortCutService {
  insertIRootNode(editor: LexicalEditor, root: SerializedRootNode, selection: BaseSelection): void;
  parseMarkdownToLexical(markdown: string): SerializedRootNode;
  registerMarkdownReader<K extends string, Node extends { type: K } = MarkdownNodeFor<K>>(
    type: K, reader: (node: Node, children: MarkdownReadNode[], index: number) => MarkdownReadNode | MarkdownReadNode[] | false,
    level?: 0 | 1 | 2,
  ): void;
  registerMarkdownShortCut(transformer: Transformer): void;
  registerMarkdownShortCuts(transformers: Transformer[]): void;
  registerMarkdownWriter(type: string, writer: (context: NativeMarkdownWriterContext, node: LexicalNode) => void | boolean): void;
}
