import { ReactLinkPlugin, ReactListPlugin } from '@lobehub/editor';
import { Editor, useEditor } from '@lobehub/editor/react';
import { createStaticStyles } from 'antd-style';
import { useEffect } from 'react';

const plugins = [ReactLinkPlugin, ReactListPlugin];

const styles = createStaticStyles(({ css }) => ({
  editor: css`
    [contenteditable] {
      min-height: 32px;
      font-size: 15px !important;
      line-height: 24px;
    }
  `,
}));

interface ProjectUpdateEditorProps {
  disabled: boolean;
  label: string;
  onChange: (markdown: string) => void;
  onSubmit: () => void;
  placeholder: string;
}

export function ProjectUpdateEditor({
  disabled,
  label,
  onChange,
  onSubmit,
  placeholder,
}: ProjectUpdateEditorProps) {
  const editor = useEditor();
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
      content=""
      debounceWait={0}
      editable={!disabled}
      editor={editor}
      placeholder={placeholder}
      plugins={plugins}
      style={{ minHeight: 32, maxHeight: 240, overflowY: 'auto', padding: '10px 12px 4px' }}
      theme={{ fontSize: 15, lineHeight: 1.6 }}
      type="text"
      variant="chat"
      onChange={(current) => onChange(String(current.getDocument('markdown') ?? ''))}
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
