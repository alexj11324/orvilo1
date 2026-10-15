import { ReactLinkPlugin, ReactListPlugin } from '@lobehub/editor';
import { Editor, useEditor } from '@lobehub/editor/react';
import { useEffect } from 'react';

import { useWhileMounted } from './useWhileMounted';

const plugins = [ReactLinkPlugin, ReactListPlugin];

const styles = {
  editor:
    'min-h-8 [&_[contenteditable]]:min-h-8 [&_[contenteditable]]:text-sm [&_[contenteditable]]:leading-5.5 [&_[contenteditable]]:font-normal [&_[contenteditable]]:[--lobe-markdown-font-size:var(--text-sm)] [&_[contenteditable]]:[--lobe-markdown-line-height:calc(22/14)] max-h-60 overflow-y-auto pt-2.5 pr-3 pb-1 pl-3',
};

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
      plugins={plugins}
      type={initialContent ? 'markdown' : 'text'}
      placeholder={
        <span className="block pt-2.5 pr-3 pb-1 pl-3 text-sm leading-5.5">{placeholder}</span>
      }
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
