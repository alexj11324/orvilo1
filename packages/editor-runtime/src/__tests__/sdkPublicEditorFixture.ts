import {
  CommonPlugin,
  type IEditor,
  Kernel,
  ListPlugin,
  LitexmlPlugin,
  MarkdownPlugin,
} from '@lobehub/editor';

/** Real SDK fixture from one public declaration owner. The bundled headless
 * entry has a distinct protected DataSource declaration and cannot be assigned
 * to the public IEditor, despite sharing runtime behavior. No type cast/mock. */
export function createSDKPublicEditorFixture(options?: {
  initialValue?: { type: 'markdown'; content: string };
}) {
  const kernel: IEditor = new Kernel();
  kernel.registerPlugins([CommonPlugin, MarkdownPlugin, ListPlugin, LitexmlPlugin]);
  kernel.initNodeEditor();
  const requireText = (value: unknown, format: string): string => {
    if (typeof value !== 'string') throw new TypeError(`Expected actual ${format} document`);
    return value;
  };
  const hydrateMarkdown = (content: string) => kernel.setDocument('markdown', content);
  if (options?.initialValue) hydrateMarkdown(options.initialValue.content);
  return {
    kernel,
    hydrateMarkdown,
    export(options?: { litexml?: boolean }) {
      // Reading the actual datasource commits pending Lexical writes before
      // serializing the real editor state. Never manufacture JSON from a mock.
      const markdown = requireText(kernel.getDocument('markdown'), 'Markdown');
      const litexml = options?.litexml
        ? requireText(kernel.getDocument('litexml'), 'LiteXML')
        : undefined;
      // Persist through the real JSON datasource, which includes the stable IDs
      // used by the document save path in addition to Lexical's raw state.
      const editorData: unknown = kernel.getDocument('json');
      if (typeof editorData !== 'object' || editorData === null || !('root' in editorData)) {
        throw new TypeError('Expected actual serialized JSON editor document');
      }
      return { markdown, litexml, editorData };
    },
    destroy: () => kernel.destroy(),
  };
}
