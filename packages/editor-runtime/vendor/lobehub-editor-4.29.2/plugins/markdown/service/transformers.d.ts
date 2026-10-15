import { ElementNode, LexicalNode, RangeSelection, TextFormatType, TextNode } from "lexical";
//#region src/plugins/markdown/service/transformers.d.ts
type TextFormatTransformer = Readonly<{
  format?: ReadonlyArray<TextFormatType>;
  intraword?: boolean;
  process?: (selection: RangeSelection) => boolean | void;
  tag: string;
  type: 'text-format';
}>;
type TextMatchTransformer = Readonly<{
  /**
   * For import operations, this function can be used to determine the end index of the match, after `importRegExp` has matched.
   * Without this function, the end index will be determined by the length of the match from `importRegExp`. Manually determining the end index can be useful if
   * the match from `importRegExp` is not the entire text content of the node. That way, `importRegExp` can be used to match only the start of the node, and `getEndIndex`
   * can be used to match the end of the node.
   *
   * @returns The end index of the match, or false if the match was unsuccessful and a different transformer should be tried.
   */
  getEndIndex?: (node: TextNode, match: RegExpMatchArray) => number | false;
  /**
   * This regex determines what text is matched during markdown imports
   */
  importRegExp?: RegExp;
  /**
   * This regex determines what text is matched for markdown shortcuts while typing in the editor
   */
  regExp: RegExp;
  /**
   * Determines how the matched markdown text should be transformed into a node during the markdown import process
   *
   * @returns nothing, or a TextNode that may be a child of the new node that is created.
   * If a TextNode is returned, text format matching will be applied to it (e.g. bold, italic, etc.)
   */
  replace?: (node: TextNode, match: RegExpMatchArray) => void | TextNode;
  /**
   * Single character that allows the transformer to trigger when typed in the editor. This does not affect markdown imports outside of the markdown shortcut plugin.
   * If the trigger is matched, the `regExp` will be used to match the text in the second step.
   */
  trigger?: string;
  type: 'text-match';
}>;
type ElementTransformer = {
  regExp: RegExp;
  /**
   * `replace` is called when markdown is imported or typed in the editor
   *
   * @return return false to cancel the transform, even though the regex matched. Lexical will then search for the next transformer.
   */
  replace: (parentNode: ElementNode, children: Array<LexicalNode>, match: Array<string>,
  /**
   * Whether the match is from an import operation (e.g. through `$convertFromMarkdownString`) or not (e.g. through typing in the editor).
   */
  isImport: boolean) => boolean | void;
  trigger?: 'enter';
  type: 'element';
};
type Transformer = ElementTransformer | TextFormatTransformer | TextMatchTransformer;
//#endregion
export { ElementTransformer, TextFormatTransformer, TextMatchTransformer, Transformer };