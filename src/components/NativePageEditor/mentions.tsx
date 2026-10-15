'use client';

import {
  INSERT_MENTION_COMMAND,
  type NativeIEditorKernel,
} from '@orvilo/editor-runtime/native-browser';
import Fuse from 'fuse.js';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  type RangeSelection,
} from 'lexical';
import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

export interface NativeMentionItem {
  icon?: ReactNode;
  key: string;
  label: ReactNode;
  metadata?: Record<string, unknown>;
}
export interface NativeMentionOptions {
  fuseOptions?: { keys?: string[]; threshold?: number };
  items: NativeMentionItem[];
  maxLength?: number;
}
interface Match {
  end: number;
  nodeKey: string;
  query: string;
  selection: RangeSelection;
  start: number;
  token: string;
}
/** Capture a single text-node token and its real selection. Reject stale or
 * non-collapsed/IME/read-only selections rather than insert at a new caret. */
function matchMention(maxLength: number): Match | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
  const node = selection.anchor.getNode();
  if (!$isTextNode(node) || node.hasFormat('code')) return;
  const end = selection.anchor.offset;
  const match = node
    .getTextContent()
    .slice(0, end)
    .match(/(?:^|\s)@([^@\s]*)$/u);
  if (!match || match[1].length > maxLength) return;
  const token = `@${match[1]}`;
  return {
    selection: selection.clone(),
    nodeKey: node.getKey(),
    start: end - token.length,
    end,
    token,
    query: match[1],
  };
}
export function NativeMentionMenu({
  kernel,
  options,
  getPopupContainer,
}: {
  kernel: NativeIEditorKernel;
  options?: NativeMentionOptions;
  getPopupContainer?: (root: HTMLElement) => HTMLElement;
}) {
  const { t } = useTranslation('common');
  const id = useId();
  const current = useRef(options);
  current.current = options;
  const active = useRef<Match | undefined>(undefined);
  const [match, setMatch] = useState<Match>();
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const editor = kernel.getLexicalEditor();
  const items = useMemo(
    () =>
      options
        ? match?.query
          ? new Fuse(options.items, {
              keys: options.fuseOptions?.keys ?? ['label', 'metadata.description'],
              threshold: options.fuseOptions?.threshold ?? 0.35,
            })
              .search(match.query)
              .map((result) => result.item)
          : options.items
        : [],
    [options, match?.query],
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const indexRef = useRef(index);
  indexRef.current = index;
  const close = () => {
    active.current = undefined;
    setMatch(undefined);
  };
  const choose = (item: NativeMentionItem) => {
    const pending = active.current;
    if (!editor || !pending || !editor.isEditable() || editor.isComposing()) return;
    editor.update(
      () => {
        const selection = $getSelection();
        const node = $getNodeByKey(pending.nodeKey);
        if (
          !$isRangeSelection(selection) ||
          !selection.isCollapsed() ||
          selection.anchor.key !== pending.nodeKey ||
          selection.anchor.offset !== pending.end ||
          !$isTextNode(node) ||
          node.getTextContent().slice(pending.start, pending.end) !== pending.token
        )
          return;
        const range = pending.selection.clone();
        range.anchor.set(pending.nodeKey, pending.start, 'text');
        range.focus.set(pending.nodeKey, pending.end, 'text');
        $setSelection(range);
        range.removeText();
        editor.dispatchCommand(INSERT_MENTION_COMMAND, {
          label: String(item.label),
          metadata: item.metadata,
        });
        const after = $getSelection();
        if ($isRangeSelection(after)) after.insertText(' ');
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    close();
    editor.focus();
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(() => {
    if (!editor) return;
    const refresh = () => {
      const next =
        current.current && editor.isEditable() && !editor.isComposing()
          ? editor.getEditorState().read(() => matchMention(current.current?.maxLength ?? 50))
          : undefined;
      active.current = next;
      setMatch(next);
      if (!next) return;
      const dom = window.getSelection();
      const root = editor.getRootElement();
      if (!dom?.rangeCount || !root?.contains(dom.anchorNode)) {
        close();
        return;
      }
      const rect = dom.getRangeAt(0).getBoundingClientRect();
      setPosition({ left: rect.left, top: rect.bottom });
    };
    const update = editor.registerUpdateListener(refresh);
    const editable = editor.registerEditableListener(refresh);
    const keyboard = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (!active.current || event.isComposing) return false;
        const count = itemsRef.current.length;
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
          return true;
        }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
          event.preventDefault();
          setIndex((previous) => (previous + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
          return true;
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && count) {
          event.preventDefault();
          const item = itemsRef.current[indexRef.current % count];
          if (item) chooseRef.current(item);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const root = editor.getRootElement();
    const blur = () => close();
    root?.addEventListener('blur', blur);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      update();
      editable();
      keyboard();
      root?.removeEventListener('blur', blur);
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, [editor, options]);
  useEffect(() => {
    setIndex(0);
  }, [match?.query]);
  useEffect(() => {
    const root = editor?.getRootElement();
    if (!root || !match) return;
    const previous = new Map(
      ['aria-controls', 'aria-activedescendant', 'aria-expanded'].map((key) => [
        key,
        root.getAttribute(key),
      ]),
    );
    root.setAttribute('aria-controls', id);
    root.setAttribute('aria-expanded', 'true');
    const item = items[index % items.length];
    if (item) root.setAttribute('aria-activedescendant', `${id}-${item.key}`);
    return () => {
      for (const [key, value] of previous) {
        if (value === null) root.removeAttribute(key);
        else root.setAttribute(key, value);
      }
    };
  }, [editor, match, index, items, id]);
  const root = editor?.getRootElement();
  if (!match || !root) return null;
  return createPortal(
    <div
      className="fixed z-50 max-h-64 max-w-full overflow-auto rounded-(--radius-card) border border-divider bg-popover p-1 text-sm text-popover-foreground shadow-(--shadow-raised)"
      id={id}
      role="listbox"
      style={position}
    >
      {items.length ? (
        items.map((item, itemIndex) => (
          <div
            aria-selected={itemIndex === index % items.length}
            id={`${id}-${item.key}`}
            key={item.key}
            role="option"
            className={cn(
              'flex min-h-9 cursor-pointer items-center gap-2 rounded-(--radius-input) px-2',
              itemIndex === index % items.length && 'bg-accent',
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(item);
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </div>
        ))
      ) : (
        <div className="px-2 py-1 text-muted-foreground" role="status">
          {t('cmdk.noResults')}
        </div>
      )}
    </div>,
    getPopupContainer?.(root) ?? document.body,
  );
}
