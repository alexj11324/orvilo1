'use client';

import {
  type NativeIEditorKernel,
  TOGGLE_LINK_COMMAND,
  UNLINK_LINK_COMMAND,
  UPDATE_LINK_TEXT_COMMAND,
} from '@orvilo/editor-runtime/native-browser';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  type BaseSelection,
  HISTORY_PUSH_TAG,
} from 'lexical';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { unlinkNativeNode } from './unlinkNativeNode';

export function NativeLinkEditor({ kernel }: { kernel: NativeIEditorKernel }) {
  const { t } = useTranslation('editor');
  const editor = kernel.getLexicalEditor();
  const [editable, setEditable] = useState(editor?.isEditable() ?? false);
  const [open, setOpen] = useState(false);
  const [url, setURL] = useState('');
  const [title, setTitle] = useState('');
  const selection = useRef<BaseSelection | null>(null);
  const nodeKey = useRef<string | undefined>(undefined);
  useEffect(
    () =>
      editor?.registerEditableListener((next) => {
        setEditable(next);
        if (!next) setOpen(false);
      }),
    [editor],
  );
  const capture = () => {
    if (!editor?.isEditable()) return;
    editor.getEditorState().read(() => {
      const current = $getSelection();
      selection.current = current?.clone() ?? null;
      let node = $isNodeSelection(current)
        ? current.getNodes()[0]
        : $isRangeSelection(current)
          ? current.anchor.getNode()
          : undefined;
      while (
        node &&
        ![
          'link',
          'autolink',
          'link-card',
          'link-block-card',
          'link-iframe',
          'schema-link',
        ].includes(node.getType())
      )
        node = node.getParent() ?? undefined;
      nodeKey.current = node?.getKey();
      const data = node?.exportJSON();
      setURL(data && 'url' in data && typeof data.url === 'string' ? data.url : '');
      setTitle(
        node && ['link', 'autolink'].includes(node.getType())
          ? node.getTextContent()
          : data && 'title' in data && typeof data.title === 'string'
            ? data.title
            : '',
      );
    });
    if (selection.current) setOpen(true);
  };
  const apply = (remove: boolean) => {
    if (!editor?.isEditable() || !selection.current) return;
    editor.update(
      () => {
        const key = nodeKey.current;
        const node = key ? $getNodeByKey(key) : null;
        if (key && !node) return;
        $setSelection(selection.current?.clone() ?? null);
        if (
          node &&
          ['link-card', 'link-block-card', 'link-iframe', 'schema-link'].includes(node.getType())
        ) {
          if (remove) unlinkNativeNode(node);
          else {
            const updated = { ...node.exportJSON(), title, url };
            node.updateFromJSON(updated);
          }
        } else if (node) {
          if (remove) editor.dispatchCommand(UNLINK_LINK_COMMAND, { key: node.getKey() });
          else {
            const updated = { ...node.exportJSON(), url };
            node.updateFromJSON(updated);
            if (title !== node.getTextContent())
              editor.dispatchCommand(UPDATE_LINK_TEXT_COMMAND, { key: node.getKey(), text: title });
          }
        } else editor.dispatchCommand(TOGGLE_LINK_COMMAND, remove ? null : url);
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    setOpen(false);
    editor.focus();
  };
  if (!editable) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" contentEditable={false}>
      <Button
        size="compact"
        variant="ghost"
        onClick={capture}
        onMouseDown={(event) => event.preventDefault()}
      >
        {t('link.edit')}
      </Button>
      {open ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-(--radius-card) border border-divider bg-popover p-2"
          onSubmit={(event) => {
            event.preventDefault();
            apply(false);
          }}
        >
          <Input
            required
            aria-label={t('link.editLinkTitle')}
            placeholder={t('link.placeholder')}
            type="url"
            value={url}
            onChange={(event) => setURL(event.target.value)}
          />
          {nodeKey.current ? (
            <Input
              aria-label={t('link.editTextTitle')}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          ) : null}
          <Button size="compact" type="submit">
            {t('confirm')}
          </Button>
          <Button size="compact" type="button" variant="ghost" onClick={() => apply(true)}>
            {t('link.unlink')}
          </Button>
          <Button
            size="compact"
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              editor?.focus();
            }}
          >
            {t('cancel')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
