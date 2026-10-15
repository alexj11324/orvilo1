'use client';

import { $findMatchingParent } from '@lexical/utils';
import {
  $createQuoteNode,
  $isListNode,
  $isQuoteNode,
  $setBlocksType,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_CODEMIRROR_COMMAND,
  INSERT_MATH_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  type NativeIEditorKernel,
  REMOVE_LIST_COMMAND,
} from '@orvilo/editor-runtime/native-browser';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type RangeSelection,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNativeEditable } from '@/components/NativePageEditor/useNativeEditable';
import { Button } from '@/components/ui/button';

import { $captureNativeToolbarSelection, applyNativeToolbarAction } from './richToolbarSelection';

export function NativeRichToolbar({ editor }: { editor: NativeIEditorKernel }) {
  const { t } = useTranslation('editor');
  const editable = useNativeEditable(editor);
  const selected = useRef<RangeSelection | null>(null);
  const [formats, setFormats] = useState<string[]>([]);
  const [listType, setListType] = useState<string>();
  const [quoted, setQuoted] = useState(false);
  useEffect(() => {
    let detach: (() => void) | undefined;
    const attach = () => {
      detach?.();
      const lexical = editor.getLexicalEditor();
      if (!lexical) return;
      const update = () =>
        lexical.getEditorState().read(() => {
          const selection = $captureNativeToolbarSelection();
          selected.current = selection;
          if (!selection) {
            setFormats([]);
            setListType(undefined);
            setQuoted(false);
            return;
          }
          setFormats(
            (['bold', 'italic', 'underline', 'strikethrough', 'code'] as const).filter((format) =>
              selection.hasFormat(format),
            ),
          );
          const list = $findMatchingParent(selection.anchor.getNode(), $isListNode);
          setListType($isListNode(list) ? list.getListType() : undefined);
          setQuoted(!!$findMatchingParent(selection.anchor.getNode(), $isQuoteNode));
        });
      update();
      detach = lexical.registerUpdateListener(update);
    };
    attach();
    editor.on('initialized', attach);
    return () => {
      detach?.();
      editor.off('initialized', attach);
    };
  }, [editor]);
  const apply = (action: () => void) => {
    const lexical = editor.getLexicalEditor();
    if (!lexical?.isEditable()) return;
    applyNativeToolbarAction(lexical, selected.current, action);
    editor.focus();
  };
  return (
    <div
      aria-label={t('actions.typobar.title')}
      className="flex flex-wrap gap-1 rounded-t-(--radius-input) bg-fill-quaternary p-2"
      role="toolbar"
    >
      {(['bold', 'italic', 'underline', 'strikethrough', 'code'] as const).map((format) => (
        <Button
          aria-pressed={formats.includes(format)}
          disabled={!editable}
          key={format}
          size="compact"
          type="button"
          variant="ghost"
          onClick={() => apply(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format))}
          onMouseDown={(event) => event.preventDefault()}
        >
          {t(`typobar.${format}`)}
        </Button>
      ))}
      <Button
        aria-pressed={listType === 'bullet'}
        disabled={!editable}
        size="compact"
        type="button"
        variant="ghost"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          apply(() =>
            editor.dispatchCommand(
              listType === 'bullet' ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
              undefined,
            ),
          )
        }
      >
        {t('typobar.bulletList')}
      </Button>
      <Button
        aria-pressed={listType === 'number'}
        disabled={!editable}
        size="compact"
        type="button"
        variant="ghost"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          apply(() =>
            editor.dispatchCommand(
              listType === 'number' ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
              undefined,
            ),
          )
        }
      >
        {t('typobar.numberList')}
      </Button>
      <Button
        aria-pressed={listType === 'check'}
        disabled={!editable}
        size="compact"
        type="button"
        variant="ghost"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          apply(() =>
            editor.dispatchCommand(
              listType === 'check' ? REMOVE_LIST_COMMAND : INSERT_CHECK_LIST_COMMAND,
              undefined,
            ),
          )
        }
      >
        {t('typobar.taskList')}
      </Button>
      <Button
        aria-pressed={quoted}
        disabled={!editable}
        size="compact"
        type="button"
        variant="ghost"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          apply(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            $setBlocksType(selection, () => (quoted ? $createParagraphNode() : $createQuoteNode()));
          })
        }
      >
        {t('typobar.blockquote')}
      </Button>
      <Button
        disabled={!editable}
        size="compact"
        type="button"
        variant="ghost"
        onClick={() => apply(() => editor.dispatchCommand(INSERT_MATH_COMMAND, { code: '' }))}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t('typobar.tex')}
      </Button>
      <Button
        disabled={!editable}
        size="compact"
        type="button"
        variant="ghost"
        onClick={() => apply(() => editor.dispatchCommand(INSERT_CODEMIRROR_COMMAND, undefined))}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t('typobar.codeblock')}
      </Button>
      <Button
        disabled={!editable}
        size="compact"
        type="button"
        variant="ghost"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (editor.isEditable()) editor.dispatchCommand(UNDO_COMMAND, undefined);
        }}
      >
        {t('typobar.undo')}
      </Button>
      <Button
        disabled={!editable}
        size="compact"
        type="button"
        variant="ghost"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (editor.isEditable()) editor.dispatchCommand(REDO_COMMAND, undefined);
        }}
      >
        {t('typobar.redo')}
      </Button>
    </div>
  );
}
