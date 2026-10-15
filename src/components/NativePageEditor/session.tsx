'use client';
import {
  CodemirrorPlugin,
  CommonPlugin,
  DEFAULT_HEADLESS_EDITOR_PLUGINS,
  FilePlugin,
  ImagePlugin,
  LinkPlugin,
  LitexmlPlugin,
  MarkdownPlugin,
  MathPlugin,
  MentionPlugin,
  NativeBrowserKernel,
  type NativeIEditorKernel,
  type NativeIPlugin,
  TablePlugin,
  UploadPlugin,
} from '@orvilo/editor-runtime/native-browser';
import type { LexicalEditor, LexicalNode } from 'lexical';
import { createContext, type ReactNode, use } from 'react';

import { writeTopicCommentMentionMarkdown } from '@/features/Portal/TopicComments/mentionData';

import type { NativeFileOwner } from './file';
import type { NativeImageOwner } from './image';
import { NativeTableController } from './table';
import { NativeDiffActions } from './toolbar';

export interface NativeWidgetProps {
  editor: LexicalEditor;
  kernel: NativeIEditorKernel;
  node: LexicalNode;
}
/** Every complex owner must be supplied. This opt-in cannot silently replace
 * code with seven grammars, drop image controls, or fall back to SDK widgets. */
export interface NativeEditorWidgets {
  code: (props: NativeWidgetProps) => ReactNode;
  linkCard: (props: NativeWidgetProps) => ReactNode;
  linkIframe: (props: NativeWidgetProps) => ReactNode;
  linkSchema: (props: NativeWidgetProps) => ReactNode;
  math: (props: NativeWidgetProps) => ReactNode;
  mention: (props: NativeWidgetProps) => ReactNode;
}
export const NativeSessionContext = createContext<NativeIEditorKernel | null>(null);
const imageOwners = new WeakMap<NativeIEditorKernel, () => NativeImageOwner>();
function NativeImageBridge({ node }: { node: LexicalNode }) {
  const kernel = use(NativeSessionContext);
  if (!kernel) throw new Error('Image must render in its own native editor context');
  const editor = kernel.getLexicalEditor();
  const owner = imageOwners.get(kernel);
  if (!editor || !owner) throw new Error('Native image editor owner is unavailable');
  return owner().render(node, kernel);
}

export function createNativeBrowserEditor(
  widgets: () => NativeEditorWidgets,
  fileOwner: () => NativeFileOwner,
  imageOwner: () => NativeImageOwner,
  extraPlugins: NativeIPlugin[] = [],
): NativeIEditorKernel {
  const kernel = new NativeBrowserKernel();
  imageOwners.set(kernel, imageOwner);
  const widget = (kind: keyof NativeEditorWidgets) => (node: LexicalNode, editor: LexicalEditor) =>
    widgets()[kind]({ node, editor, kernel });
  const configs = new Map<NativeIPlugin, Record<string, unknown>>([
    [
      CommonPlugin,
      {
        theme: {
          quote: 'native-editor-quote',
          textBold: 'native-editor-bold',
          textItalic: 'native-editor-italic',
          textCode: 'native-editor-code',
          textStrikethrough: 'native-editor-strike',
          textUnderline: 'native-editor-underline',
          textUnderlineStrikethrough: 'native-editor-underline-strike',
        },
      },
    ],
    [MarkdownPlugin, {}],
    [
      LitexmlPlugin,
      {
        decorator: (node: LexicalNode) => (
          <NativeDiffActions editor={kernel} nodeKey={node.getKey()} />
        ),
      },
    ],
    [
      TablePlugin,
      {
        decoratorCol: (node: LexicalNode, editor: LexicalEditor) => (
          <NativeTableController axis="column" kernel={kernel} lexical={editor} node={node} />
        ),
        decoratorRow: (node: LexicalNode, editor: LexicalEditor) => (
          <NativeTableController axis="row" kernel={kernel} lexical={editor} node={node} />
        ),
      },
    ],
    [CodemirrorPlugin, { decorator: widget('code') }],
    [MathPlugin, { decorator: widget('math') }],
    [
      ImagePlugin,
      {
        defaultBlockImage: true,
        getImageWidth: (file: File) => imageOwner().getImageWidth(file),
        handleUpload: (file: File) => imageOwner().handleUpload(file),
        handleRehost: (url: string) => imageOwner().handleRehost(url),
        needRehost: (url: string) =>
          !!kernel.getLexicalEditor()?.isEditable() && imageOwner().needRehost(url),
        renderImage: (node: LexicalNode) => <NativeImageBridge node={node} />,
        theme: { image: 'native-editor-inline-image', blockImage: 'native-editor-block-image' },
      },
    ],
    [
      FilePlugin,
      {
        decorator: (node: LexicalNode) => fileOwner().decorator(node),
        handleUpload: (file: File) => fileOwner().handleUpload(file),
        theme: fileOwner().theme,
      },
    ],
    [
      MentionPlugin,
      { decorator: widget('mention'), markdownWriter: writeTopicCommentMentionMarkdown },
    ],
    [
      LinkPlugin,
      {
        enableHotkey: true,
        decoratorCard: widget('linkCard'),
        decoratorIframe: widget('linkIframe'),
        decoratorSchema: widget('linkSchema'),
      },
    ],
  ]);
  kernel.registerPlugins(
    [UploadPlugin, ...DEFAULT_HEADLESS_EDITOR_PLUGINS]
      .map((entry): NativeIPlugin => {
        const plugin = Array.isArray(entry) ? entry[0] : entry;
        const config = configs.get(plugin);
        return config ? [plugin, config] : entry;
      })
      .concat(extraPlugins),
  );
  return kernel;
}
