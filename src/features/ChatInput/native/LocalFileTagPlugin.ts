import { $wrapNodeInElement } from '@lexical/utils';
import {
  ILitexmlService,
  IMarkdownShortCutService,
  type NativeIEditorKernel,
} from '@orvilo/editor-runtime/native-browser';
import { escapeXmlAttr } from '@orvilo/prompts';
import {
  $createParagraphNode,
  $createTextNode,
  $insertNodes,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_HIGH,
  type LexicalEditor,
} from 'lexical';

import { registerLocalFileTagDecorator } from '@/features/ChatInput/InputEditor/LocalFileTag/LocalFileTagNode';
import {
  $createLocalFileTagNode,
  $isLocalFileTagNode,
  LocalFileTagNode,
  type SerializedLocalFileTagNode,
} from '@/features/ChatInput/InputEditor/LocalFileTag/LocalFileTagNode';

import { INSERT_LOCAL_FILE_TAG_COMMAND } from '../InputEditor/LocalFileTag/command';

export {
  INSERT_LOCAL_FILE_TAG_COMMAND,
  type InsertLocalFileTagPayload,
} from '../InputEditor/LocalFileTag/command';

type IEditorKernel = NativeIEditorKernel;

export interface LocalFileTagPluginOptions {
  decorator: (node: LocalFileTagNode, editor: LexicalEditor) => any;
  theme?: { localFileTag?: string };
}

/**
 * Owns the `local-file-tag` node: its decorator, its `<localFile … />`
 * markdown writer, and its insert command. Because this plugin is registered
 * unconditionally (via `CHAT_INPUT_EMBED_PLUGINS`), the markdown serialization
 * is always available — unlike the generic mention writer, which is only wired
 * up when `mentionOption` has items. This is what keeps workspace-file drops
 * serializing to the tag the gateway/device run needs, even on the web client
 * with no other mention categories.
 */
export class LocalFileTagPlugin {
  static pluginName = 'LocalFileTagPlugin';

  config?: LocalFileTagPluginOptions;
  private kernel: IEditorKernel;
  private unregisterNativeDecorator?: () => void;

  constructor(kernel: IEditorKernel, config?: LocalFileTagPluginOptions) {
    this.kernel = kernel;
    this.config = config;

    kernel.registerNodes([LocalFileTagNode]);

    if (config?.theme) {
      kernel.registerThemes(config.theme);
    }

    kernel.registerDecorator(LocalFileTagNode.getType(), (node, editor) => {
      return config?.decorator ? config.decorator(node as LocalFileTagNode, editor) : null;
    });
  }

  onInit(editor: LexicalEditor): void {
    this.unregisterNativeDecorator?.();
    this.unregisterNativeDecorator = registerLocalFileTagDecorator(
      editor,
      (node, lexicalEditor) => this.config?.decorator?.(node, lexicalEditor) ?? null,
    );
    this.registerMarkdown();
    this.registerLiteXml();
    this.registerCommand(editor);
  }

  private registerMarkdown(): void {
    const mdService = this.kernel.requireService(IMarkdownShortCutService);

    mdService?.registerMarkdownWriter(LocalFileTagNode.getType(), (ctx: any, node: any) => {
      if ($isLocalFileTagNode(node)) {
        const name = escapeXmlAttr(node.name);
        const path = escapeXmlAttr(node.path);
        const isDirectory = node.isDirectory ? ' isDirectory' : '';
        ctx.appendLine(`<localFile name="${name}" path="${path}"${isDirectory} />`);
      }
    });
  }

  private registerCommand(editor: LexicalEditor): void {
    editor.registerCommand(
      INSERT_LOCAL_FILE_TAG_COMMAND,
      (payload) => {
        if (!editor.isEditable()) return true;
        editor.update(() => {
          if (!editor.isEditable()) return;
          const node = $createLocalFileTagNode(payload.name, payload.path, !!payload.isDirectory);
          // Trailing space so the user can keep typing without adding one manually.
          $insertNodes([node, $createTextNode(' ')]);
          if ($isRootOrShadowRoot(node.getParentOrThrow())) {
            $wrapNodeInElement(node, $createParagraphNode).selectEnd();
          }
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }

  private registerLiteXml(): void {
    const xmlService = this.kernel.requireService(ILitexmlService);

    xmlService?.registerXMLWriter(LocalFileTagNode.getType(), (node: any, ctx: any) => {
      if ($isLocalFileTagNode(node)) {
        return ctx.createXmlNode('localFile', {
          ...(node.isDirectory ? { isDirectory: 'true' } : {}),
          name: node.name,
          path: node.path,
        });
      }
      return false;
    });

    const readLocalFile = (xmlElement: any) => {
      return {
        isDirectory:
          xmlElement.hasAttribute?.('isDirectory') ||
          xmlElement.getAttribute('isDirectory') === 'true',
        name: xmlElement.getAttribute('name') || '',
        path: xmlElement.getAttribute('path') || '',
        type: LocalFileTagNode.getType(),
        version: 1,
      } satisfies SerializedLocalFileTagNode;
    };

    xmlService?.registerXMLReader('localFile', readLocalFile);
    xmlService?.registerXMLReader('localFileTag', readLocalFile);
  }

  destroy(): void {
    this.unregisterNativeDecorator?.();
    this.unregisterNativeDecorator = undefined;
    this.kernel.unregisterDecorator?.(LocalFileTagNode.getType());
  }
}
