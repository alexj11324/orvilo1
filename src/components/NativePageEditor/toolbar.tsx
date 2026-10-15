'use client';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@orvilo/editor-runtime/native-browser';
import {
  DiffAction,
  LITEXML_DIFFNODE_ALL_COMMAND,
  LITEXML_DIFFNODE_COMMAND,
  type NativeIEditorKernel,
  TOGGLE_LINK_COMMAND,
} from '@orvilo/editor-runtime/native-browser';
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  type RangeSelection,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { useNativeEditable } from './useNativeEditable';

export function NativeDiffActions({
  editor,
  nodeKey,
}: {
  editor: NativeIEditorKernel;
  nodeKey?: string;
}) {
  const { t } = useTranslation('editor');
  const editable = useNativeEditable(editor);
  const act = (action: DiffAction) =>
    editor.isEditable() &&
    (nodeKey
      ? editor.dispatchCommand(LITEXML_DIFFNODE_COMMAND, { action, nodeKey })
      : editor.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, { action }));
  return (
    <div
      aria-label={t('modifier.review', { defaultValue: 'Review suggested changes' })}
      className="flex flex-wrap gap-2"
      contentEditable={false}
      role="group"
    >
      <Button
        disabled={!editable}
        size="default"
        variant="outline"
        onClick={() => act(DiffAction.Reject)}
        onMouseDown={(e) => e.preventDefault()}
      >
        {t(nodeKey ? 'modifier.reject' : 'modifier.rejectAll')}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        onClick={() => act(DiffAction.Accept)}
        onMouseDown={(e) => e.preventDefault()}
      >
        {t(nodeKey ? 'modifier.accept' : 'modifier.acceptAll')}
      </Button>
    </div>
  );
}
export function NativeFormattingToolbar({ editor }: { editor: NativeIEditorKernel }) {
  const { t } = useTranslation('editor');
  const editable = useNativeEditable(editor);
  const [url, setUrl] = useState('');
  const selected = useRef<RangeSelection | null>(null);
  useEffect(() => {
    const lexical = editor.getLexicalEditor();
    return lexical?.registerUpdateListener(({ editorState }) =>
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selected.current = selection.clone();
      }),
    );
  }, [editor]);
  const restore = () => {
    if (selected.current) $setSelection(selected.current.clone());
  };
  return (
    <div
      aria-label={t('toolbar.label', { defaultValue: 'Formatting' })}
      className="flex flex-wrap items-center gap-2"
      role="toolbar"
    >
      {(['bold', 'italic', 'underline', 'strikethrough', 'code'] as const).map((format) => (
        <Button
          disabled={!editable}
          key={format}
          size="default"
          variant="ghost"
          onClick={() => editor.isEditable() && editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
          onMouseDown={(e) => e.preventDefault()}
        >
          {t(`toolbar.${format}`, { defaultValue: format })}
        </Button>
      ))}
      <Button
        disabled={!editable}
        size="default"
        variant="ghost"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor.isEditable() && editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
      >
        {t('toolbar.bulletList', { defaultValue: 'Bullet list' })}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="ghost"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor.isEditable() && editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
      >
        {t('toolbar.numberedList', { defaultValue: 'Numbered list' })}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="ghost"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor.isEditable() && editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        }
      >
        {t('toolbar.removeList', { defaultValue: 'Remove list' })}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="ghost"
        onClick={() => editor.isEditable() && editor.dispatchCommand(UNDO_COMMAND, undefined)}
        onMouseDown={(e) => e.preventDefault()}
      >
        {t('toolbar.undo', { defaultValue: 'Undo' })}
      </Button>
      <Button
        disabled={!editable}
        size="default"
        variant="ghost"
        onClick={() => editor.isEditable() && editor.dispatchCommand(REDO_COMMAND, undefined)}
        onMouseDown={(e) => e.preventDefault()}
      >
        {t('toolbar.redo', { defaultValue: 'Redo' })}
      </Button>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!editor.isEditable()) return;
          let parsed: URL;
          try {
            parsed = new URL(url);
          } catch {
            return;
          }
          if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return;
          editor.getLexicalEditor()?.update(() => {
            if (!editor.isEditable()) return;
            restore();
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
          });
          editor.focus();
        }}
      >
        <input
          aria-label={t('link.editLinkTitle')}
          className="h-9 rounded-(--radius-input) border border-input bg-background px-3 text-sm text-foreground"
          disabled={!editable}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button disabled={!editable} size="default" type="submit">
          {t('link.edit', { defaultValue: 'Set link' })}
        </Button>
        <Button
          disabled={!editable}
          size="default"
          type="button"
          variant="outline"
          onClick={() => {
            editor.getLexicalEditor()?.update(() => {
              if (!editor.isEditable()) return;
              restore();
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
            });
            editor.focus();
          }}
        >
          {t('link.unlink')}
        </Button>
      </form>
    </div>
  );
}
