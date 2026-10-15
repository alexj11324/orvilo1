'use client';

import { NativeProfessionalCodeWidget } from '@/components/NativePageEditor/code';
import { NativeLinkEditor } from '@/components/NativePageEditor/linkEditor';
import {
  NativeDefaultIframe,
  NativeDefaultSchema,
  NativeLinkCardWidget,
  NativeLinkIframeWidget,
  NativeLinkSchemaWidget,
  NativeMentionWidget,
} from '@/components/NativePageEditor/linkMention';

import { NativeChatInputEditor, type NativeChatInputEditorProps } from './NativeChatInputEditor';

export type NativeCompleteChatInputEditorProps = Omit<NativeChatInputEditorProps, 'widgets'>;

/** All complex widget owners are actual local implementations; math remains a
 * required injected renderer until its own approved direct dependency exists. */
export function NativeCompleteChatInputEditor({
  children,
  ...props
}: NativeCompleteChatInputEditorProps) {
  return (
    <NativeChatInputEditor
      {...props}
      widgets={{
        code: (widget) => <NativeProfessionalCodeWidget {...widget} />,
        mention: (widget) => <NativeMentionWidget {...widget} />,
        linkCard: (widget) => <NativeLinkCardWidget {...widget} />,
        linkIframe: (widget) => (
          <NativeLinkIframeWidget
            {...widget}
            render={(item) => <NativeDefaultIframe {...item} />}
          />
        ),
        linkSchema: (widget) => (
          <NativeLinkSchemaWidget
            {...widget}
            render={(item) => <NativeDefaultSchema {...item} />}
          />
        ),
      }}
    >
      {(actions) => (
        <>
          <NativeLinkEditor kernel={actions.editor} />
          {typeof children === 'function' ? children(actions) : children}
        </>
      )}
    </NativeChatInputEditor>
  );
}
