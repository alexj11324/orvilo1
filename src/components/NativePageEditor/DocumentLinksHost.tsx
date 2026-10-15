'use client';

import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { type ReactNode, useState } from 'react';

import {
  NativePageDocumentHost,
  type NativePageDocumentHostProps,
} from '@/features/PageEditor/native/NativePageDocumentHost';

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
import { useNativeWorkspaceMentions } from './useWorkspaceMentions';

export interface NativeDocumentLinksHostProps extends Omit<NativePageDocumentHostProps, 'widgets'> {
  getPopupContainer?: (root: HTMLElement) => HTMLElement;
  mentionOptions?: NativeMentionOptions;
  renderIframe?: (props: NativeIframeRendererProps) => ReactNode;
  renderSchema?: (props: NativeIframeRendererProps) => ReactNode;
  widgets: Omit<NativeEditorWidgets, 'mention' | 'linkCard' | 'linkIframe' | 'linkSchema'>;
  workspaceScoped: boolean;
}
/** Assemble the existing owned document host, not a second persistence driver.
 * Permission/lock/runtime/title contracts stay mandatory at that host boundary. */
export function NativeDocumentLinksHost({
  widgets,
  workspaceScoped,
  mentionOptions,
  renderIframe,
  renderSchema,
  getPopupContainer,
  onInit,
  children,
  ...props
}: NativeDocumentLinksHostProps) {
  const [kernel, setKernel] = useState<NativeIEditorKernel>();
  const workspaceMentions = useNativeWorkspaceMentions(workspaceScoped);
  return (
    <NativePageDocumentHost
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
      onInit={(editor) => {
        setKernel(editor);
        onInit?.(editor);
      }}
    >
      {kernel ? (
        <>
          <NativeMentionMenu
            getPopupContainer={getPopupContainer}
            kernel={kernel}
            options={mentionOptions ?? workspaceMentions}
          />
          <NativeLinkEditor kernel={kernel} />
        </>
      ) : null}
      {children}
    </NativePageDocumentHost>
  );
}
