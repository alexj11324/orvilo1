import { ReactLinkPlugin, ReactListPlugin } from '@lobehub/editor';
import { Editor, useEditor } from '@lobehub/editor/react';
import { createStaticStyles } from 'antd-style';
import { useEffect } from 'react';

import { useWhileMounted } from './useWhileMounted';

const plugins = [ReactLinkPlugin, ReactListPlugin];

const styles = createStaticStyles(({ css }) => ({
  editor: css`
    [contenteditable] {
      min-height: 32px;
      font-size: 14px !important;
      line-height: 22px;
    }
  `,
}));

interface ProjectUpdateEditorProps {
  disabled: boolean;
  /** Markdown to prefill the editor with — used when editing an existing update. */
  initialContent?: string;
  label: string;
  onChange: (markdown: string) => void;
  onSubmit: () => void;
  placeholder: string;
}

export function ProjectUpdateEditor({
  disabled,
  initialContent,
  label,
  onChange,
  onSubmit,
  placeholder,
}: ProjectUpdateEditorProps) {
  const editor = useEditor();
  // The editor's trailing change may fire after a successful post unmounts it.
  const emitChange = useWhileMounted(onChange);
  useEffect(
    () =>
      editor.getLexicalEditor()?.registerRootListener((root) => {
        root?.setAttribute('aria-label', label);
        root?.setAttribute('role', 'textbox');
        root?.setAttribute('aria-multiline', 'true');
      }),
    [editor, label],
  );

  return (
    <Editor
      autoFocus
      className={styles.editor}
      content={initialContent ?? ''}
      debounceWait={0}
      editable={!disabled}
      editor={editor}
      placeholder={placeholder}
      plugins={plugins}
      style={{ minHeight: 32, maxHeight: 240, overflowY: 'auto', padding: '10px 12px 4px' }}
      theme={{ fontSize: 14, lineHeight: 1.6 }}
      type={initialContent ? 'markdown' : 'text'}
      onChange={(current) => emitChange(String(current.getDocument('markdown') ?? ''))}
      onPressEnter={({ event }) => {
        if (!event.isComposing && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSubmit();
          return true;
        }
      }}
    />
  );
}
