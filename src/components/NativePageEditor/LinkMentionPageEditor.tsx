'use client';

import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { NativePageEditor, type NativePageEditorProps } from './index';
import { NativeLinkEditor } from './linkEditor';
import {
  NativeDefaultIframe,
  NativeDefaultSchema,
  type NativeIframeRendererProps,
  NativeLinkCardWidget,
  NativeLinkIframeWidget,
  NativeLinkSchemaWidget,
  NativeMentionWidget,
} from './linkMention';
import { NativeMentionMenu, type NativeMentionOptions } from './mentions';
import type { NativeEditorWidgets } from './session';

export interface LinkMentionPageEditorProps extends Omit<NativePageEditorProps, 'widgets'> {
  getPopupContainer?: (root: HTMLElement) => HTMLElement;
  mentionOptions?: NativeMentionOptions;
  renderIframe?: (props: NativeIframeRendererProps) => ReactNode;
  renderSchema?: (props: NativeIframeRendererProps) => ReactNode;
  widgets: Omit<NativeEditorWidgets, 'mention' | 'linkCard' | 'linkIframe' | 'linkSchema'>;
}
/** Complete mention/card ownership with explicit complex embed owners. Existing
 * page routes stay unchanged until the assembled surface is verified. */
export function LinkMentionPageEditor({
  widgets,
  mentionOptions,
  renderIframe,
  renderSchema,
  getPopupContainer,
  onReady,
  children,
  ...props
}: LinkMentionPageEditorProps) {
  const [kernel, setKernel] = useState<NativeIEditorKernel>();
  return (
    <NativePageEditor
      {...props}
      widgets={{
        ...widgets,
        mention: (widget) => <NativeMentionWidget {...widget} />,
        linkCard: (widget) => <NativeLinkCardWidget {...widget} />,
        linkIframe: (widget) => (
          <NativeLinkIframeWidget
            {...widget}
            render={renderIframe ?? ((item) => <NativeDefaultIframe {...item} />)}
          />
        ),
        linkSchema: (widget) => (
          <NativeLinkSchemaWidget
            {...widget}
            render={renderSchema ?? ((item) => <NativeDefaultSchema {...item} />)}
          />
        ),
      }}
      onReady={(editor, commands) => {
        setKernel(editor);
        onReady(editor, commands);
      }}
    >
      {kernel ? (
        <>
          <NativeMentionMenu
            getPopupContainer={getPopupContainer}
            kernel={kernel}
            options={mentionOptions}
          />
          <NativeLinkEditor kernel={kernel} />
        </>
      ) : null}
      {children}
    </NativePageEditor>
  );
}
