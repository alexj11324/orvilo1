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
  HISTORY_PUSH_TAG,
  type RangeSelection,
} from 'lexical';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { INSERT_ACTION_TAG_COMMAND } from '../InputEditor/ActionTag/command';
import { useLocalFileTag } from '../InputEditor/useLocalFileTag';
import { useMentionCategories } from '../InputEditor/useMentionCategories';
import { INSERT_LOCAL_FILE_TAG_COMMAND } from './LocalFileTagPlugin';
import { INSERT_REFER_TOPIC_COMMAND } from './ReferTopicPlugin';
import { useNativeSlashActionItems } from './useNativeSlashActionItems';

interface Item {
  group?: string;
  key: string;
  label: ReactNode;
  metadata?: Record<string, unknown>;
  onSelect?: (editor: NativeIEditorKernel, matchingString: string) => void;
}
interface Match {
  end: number;
  node: string;
  prefix: '@' | '/';
  query: string;
  range: RangeSelection;
  start: number;
  token: string;
}
function findMatch(): Match | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
  const node = selection.anchor.getNode();
  if (!$isTextNode(node) || node.hasFormat('code')) return;
  const end = selection.anchor.offset;
  const match = node
    .getTextContent()
    .slice(0, end)
    .match(/(?:^|\s)([@/])([^@/\s]{0,50})$/u);
  if (!match) return;
  const prefix = match[1] === '@' ? '@' : '/';
  const token = prefix + match[2];
  return {
    prefix,
    node: node.getKey(),
    start: end - token.length,
    end,
    query: match[2],
    token,
    range: selection.clone(),
  };
}

/** Actual application suggestion providers; groups, project/device skills,
 * assignment/topic/action/file insertion preserve their existing business data. */
export function NativeChatMenus({
  kernel,
  container,
  mentionEnabled,
  slashEnabled,
  bindKeys,
}: {
  kernel: NativeIEditorKernel;
  container: HTMLElement | null;
  mentionEnabled: boolean;
  slashEnabled: boolean;
  bindKeys: (handler: ((event: KeyboardEvent) => boolean) | undefined) => void;
}) {
  const categories = useMentionCategories();
  const { searchLocalFiles } = useLocalFileTag();
  const slashItems = useNativeSlashActionItems(kernel);
  const { t } = useTranslation('chat');
  const { t: common } = useTranslation('common');
  const id = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [match, setMatch] = useState<Match>();
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const active = useRef<Match>();
  const sequence = useRef(0);
  const live = useRef({ items, index });
  live.current = { items, index };
  const editor = kernel.getLexicalEditor();
  const invalidateRequests = useCallback(() => {
    ++sequence.current;
  }, []);
  function close() {
    ++sequence.current;
    active.current = undefined;
    setMatch(undefined);
  }
  function choose(item: Item) {
    const pending = active.current;
    if (!pending || !editor?.isEditable() || editor.isComposing()) return;
    editor.update(
      () => {
        const selection = $getSelection();
        const node = $getNodeByKey(pending.node);
        if (
          !$isRangeSelection(selection) ||
          !selection.isCollapsed() ||
          selection.anchor.key !== pending.node ||
          selection.anchor.offset !== pending.end ||
          !$isTextNode(node) ||
          node.getTextContent().slice(pending.start, pending.end) !== pending.token
        )
          return;
        const range = pending.range.clone();
        range.anchor.set(pending.node, pending.start, 'text');
        range.focus.set(pending.node, pending.end, 'text');
        $setSelection(range);
        range.removeText();
        const meta = item.metadata;
        if (pending.prefix === '/' && item.onSelect) item.onSelect(kernel, pending.query);
        else if (meta?.type === 'topic')
          kernel.dispatchCommand(INSERT_REFER_TOPIC_COMMAND, {
            topicId: String(meta.topicId ?? ''),
            topicTitle: String(meta.topicTitle ?? item.label),
          });
        else if (meta?.type === 'localFile')
          kernel.dispatchCommand(INSERT_LOCAL_FILE_TAG_COMMAND, {
            isDirectory: Boolean(meta.isDirectory),
            name: String(meta.name ?? item.label),
            path: String(meta.path ?? ''),
          });
        else if (meta?.type === 'skill' || meta?.type === 'tool')
          kernel.dispatchCommand(INSERT_ACTION_TAG_COMMAND, {
            category:
              meta.actionCategory === 'agentSkill' || meta.actionCategory === 'projectSkill'
                ? meta.actionCategory
                : meta.type,
            label: String(meta.label ?? item.label),
            type: String(meta.actionType ?? ''),
          });
        else
          kernel.dispatchCommand(INSERT_MENTION_COMMAND, {
            label: String(meta?.label ?? item.label),
            metadata: meta,
          });
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    close();
    editor.focus();
  }
  const chooseCurrent = useRef(choose);
  chooseCurrent.current = choose;
  useEffect(() => {
    bindKeys((event) => {
      if (!active.current || event.isComposing || !editor?.isEditable()) return false;
      const { items: currentItems, index: currentIndex } = live.current;
      if (event.key === 'Escape') {
        close();
        return true;
      }
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && currentItems.length) {
        setIndex(
          (previous) =>
            (previous + (event.key === 'ArrowUp' ? currentItems.length - 1 : 1)) %
            currentItems.length,
        );
        return true;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && currentItems.length) {
        chooseCurrent.current(currentItems[currentIndex % currentItems.length]);
        return true;
      }
      return false;
    });
    return () => bindKeys(undefined);
  }, [bindKeys, editor]);
  useEffect(() => {
    if (!editor) return;
    const refresh = () => {
      const next =
        editor.isEditable() && !editor.isComposing()
          ? editor.getEditorState().read(findMatch)
          : undefined;
      if (!next || (next.prefix === '@' ? !mentionEnabled : !slashEnabled)) {
        close();
        return;
      }
      active.current = next;
      setMatch(next);
      setIndex(0);
      setItems([]);
      const dom = window.getSelection();
      if (!dom?.rangeCount || !editor.getRootElement()?.contains(dom.anchorNode)) {
        close();
        return;
      }
      const rect = dom.getRangeAt(0).getBoundingClientRect();
      setPosition({ left: rect.left, top: rect.bottom });
      const ticket = ++sequence.current;
      const load = async (): Promise<Item[]> => {
        if (next.prefix === '/')
          return slashItems({
            leadOffset: next.start,
            matchingString: next.query,
            replaceableString: next.token,
          });
        const all = categories.flatMap((category) =>
          category.items.map((item) => ({ ...item, group: category.label })),
        );
        const ranked = next.query
          ? new Fuse(all, {
              keys: [
                'key',
                'label',
                'metadata.label',
                'metadata.searchText',
                'metadata.topicTitle',
              ],
              threshold: 0.3,
            })
              .search(next.query)
              .map((hit) => hit.item)
          : all;
        const files = next.query ? await searchLocalFiles(next.query) : [];
        return [
          ...files.map((file) => ({ ...file, group: t('mention.category.files') })),
          ...ranked,
        ];
      };
      void load().then(
        (result) => {
          if (ticket === sequence.current) setItems(result);
        },
        () => {
          if (ticket === sequence.current) {
            setItems([]);
          }
        },
      );
    };
    const update = editor.registerUpdateListener(refresh);
    const editable = editor.registerEditableListener(refresh);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      invalidateRequests();
      update();
      editable();
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, [
    editor,
    categories,
    searchLocalFiles,
    slashItems,
    mentionEnabled,
    slashEnabled,
    t,
    invalidateRequests,
  ]);
  useEffect(() => {
    const root = editor?.getRootElement();
    if (!root || !match) return;
    const previous = new Map(
      ['aria-controls', 'aria-expanded', 'aria-activedescendant'].map((name) => [
        name,
        root.getAttribute(name),
      ]),
    );
    root.setAttribute('aria-controls', id);
    root.setAttribute('aria-expanded', 'true');
    const item = items[index];
    if (item) root.setAttribute('aria-activedescendant', `${id}-${item.key}`);
    else root.removeAttribute('aria-activedescendant');
    return () => {
      for (const [name, value] of previous) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
    };
  }, [editor, match, items, index, id]);
  if (!match) return null;
  return createPortal(
    <div
      className="fixed z-50 max-h-64 overflow-auto rounded-(--radius-overlay) border border-divider bg-popover p-1 text-sm text-popover-foreground shadow-(--shadow-popover)"
      id={id}
      role="listbox"
      style={position}
    >
      {!items.length ? (
        <div className="px-2 py-1 text-muted-foreground" role="status">
          {common('cmdk.noResults')}
        </div>
      ) : null}
      {items.map((item, itemIndex) => (
        <div key={item.key}>
          {item.group && item.group !== items[itemIndex - 1]?.group ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">{item.group}</div>
          ) : null}
          <div
            aria-selected={itemIndex === index}
            id={`${id}-${item.key}`}
            role="option"
            className={
              itemIndex === index
                ? 'min-h-9 cursor-pointer rounded-(--radius-input) bg-selected px-2 py-2'
                : 'min-h-9 cursor-pointer rounded-(--radius-input) px-2 py-2 hover:bg-accent'
            }
            onMouseDown={(event) => {
              event.preventDefault();
              choose(item);
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>,
    container ?? document.body,
  );
}
