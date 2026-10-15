'use client';

import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { COMMAND_PRIORITY_CRITICAL, KEY_DOWN_COMMAND } from 'lexical';
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  SigmaIcon,
  SquareDashedBottomCodeIcon,
  Table2Icon,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  applyNativeSlashChoice,
  type NativeSlashChoice,
  type NativeSlashMatch,
  ownsNativeSlash,
  readNativeSlash,
  sameNativeSlash,
} from './slashActions';
import { createNativeSlashImagePicker } from './slashImagePicker';

interface Popup {
  container: HTMLElement;
  match: NativeSlashMatch;
}
const definitions = [
  { key: 'h1', label: 'slash.h1', icon: Heading1Icon },
  { key: 'h2', label: 'slash.h2', icon: Heading2Icon },
  { key: 'h3', label: 'slash.h3', icon: Heading3Icon },
  { key: 'tl', label: 'typobar.taskList', icon: ListTodoIcon },
  { key: 'ul', label: 'typobar.bulletList', icon: ListIcon },
  { key: 'ol', label: 'typobar.numberList', icon: ListOrderedIcon },
  { key: 'image', label: 'typobar.image', icon: ImageIcon },
  { key: 'hr', label: 'slash.hr', icon: MinusIcon },
  { key: 'table', label: 'slash.table', icon: Table2Icon },
  { key: 'codeblock', label: 'typobar.codeblock', icon: SquareDashedBottomCodeIcon },
  { key: 'tex', label: 'slash.tex', icon: SigmaIcon },
] as const;

/** Actual native page slash owner. Focus and selection remain in its own editor;
 * real ImagePlugin uploads retain the existing loading/error/retry media owner. */
export function NativePageSlashMenu({
  kernel,
  getPopupContainer,
}: {
  kernel: NativeIEditorKernel;
  getPopupContainer?: (root: HTMLElement) => HTMLElement;
}) {
  const { t } = useTranslation(['editor', 'common']);
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Popup>();
  const { refs, floatingStyles } = useFloating({
    placement: 'bottom-start',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const { setFloating, setPositionReference } = refs;
  const setMenu = useCallback(
    (node: HTMLDivElement | null) => {
      menu.current = node;
      setFloating(node);
    },
    [setFloating],
  );
  const [active, setActive] = useState(0);
  const [error, setError] = useState(false);
  const dismissed = useRef<NativeSlashMatch | undefined>(undefined);
  const composing = useRef(false);
  const picker = useRef<(() => void) | undefined>(undefined);
  const options = useMemo(
    () =>
      definitions
        .map((item) => ({ ...item, text: t(item.label) }))
        .filter(
          (item) =>
            !popup?.match.query ||
            `${item.key} ${item.text}`
              .toLocaleLowerCase()
              .includes(popup.match.query.toLocaleLowerCase()),
        ),
    [popup?.match.query, t],
  );
  const live = useRef({ popup, active, options, getPopupContainer });
  live.current = { popup, active, options, getPopupContainer };
  useEffect(() => {
    setActive(0);
  }, [popup?.match.query, options.length]);
  useEffect(() => {
    menu.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const editor = kernel.getLexicalEditor();
    const root = editor?.getRootElement();
    if (!editor || !root) return;
    const doc = root.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;
    dismissed.current = undefined;
    composing.current = false;
    let alive = true;
    let frame: number | undefined;
    const owns = (match: NativeSlashMatch) =>
      alive &&
      kernel.getLexicalEditor() === editor &&
      editor.getRootElement() === root &&
      root.isConnected &&
      ownsNativeSlash(editor, match);
    const close = () => {
      dismissed.current = live.current.popup?.match;
      setPopup(undefined);
    };
    const update = () => {
      if (
        !alive ||
        composing.current ||
        picker.current ||
        doc.activeElement !== root ||
        !editor.isEditable() ||
        editor.isComposing()
      ) {
        setPopup(undefined);
        return;
      }
      const selection = doc.getSelection();
      if (
        !selection?.isCollapsed ||
        !selection.anchorNode ||
        !root.contains(selection.anchorNode)
      ) {
        setPopup(undefined);
        return;
      }
      const match = editor.getEditorState().read(readNativeSlash);
      if (!match || sameNativeSlash(match, dismissed.current)) {
        setPopup(undefined);
        return;
      }
      const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined;
      if (!range) return;
      const container = live.current.getPopupContainer?.(root) ?? doc.body;
      if (container.ownerDocument !== doc || !container.isConnected) {
        setPopup(undefined);
        return;
      }
      setPositionReference({
        getBoundingClientRect: () => range.getBoundingClientRect(),
        contextElement: root,
      });
      setPopup({ match, container });
    };
    const schedule = () => {
      if (frame !== undefined) view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => {
        frame = undefined;
        update();
      });
    };
    const execute = (
      match: NativeSlashMatch,
      choice: NativeSlashChoice,
      file?: File,
      failedPopup?: Popup,
    ) => {
      if (!owns(match)) return;
      try {
        const accepted = applyNativeSlashChoice(editor, match, choice, file);
        setError(!accepted);
        if (!accepted && failedPopup) {
          dismissed.current = undefined;
          setPopup(failedPopup);
        }
        if (accepted) {
          dismissed.current = match;
          setPopup(undefined);
          editor.focus();
        }
      } catch {
        setError(true);
        if (failedPopup) {
          dismissed.current = undefined;
          setPopup(failedPopup);
        }
      }
    };
    const choose = (choice: NativeSlashChoice) => {
      const originalPopup = live.current.popup;
      const match = originalPopup?.match;
      if (!match || !owns(match)) return;
      setError(false);
      if (choice !== 'image') {
        execute(match, choice);
        return;
      }
      // Consume the slash only after a genuine image was selected. Cancel and
      // changed document/selection/permission leave the original text intact.
      const imagePicker = createNativeSlashImagePicker({
        doc,
        onFile: (file) => {
          picker.current = undefined;
          if (file.type.startsWith('image/')) execute(match, choice, file, originalPopup);
          else {
            setError(true);
            dismissed.current = undefined;
            setPopup(originalPopup);
          }
        },
        onCancel: () => {
          picker.current = undefined;
          if (owns(match)) editor.focus();
        },
        onError: () => {
          picker.current = undefined;
          setError(true);
          dismissed.current = undefined;
          setPopup(originalPopup);
        },
      });
      picker.current = imagePicker.dispose;
      close();
      imagePicker.open();
    };
    action.current = choose;
    const unregisterUpdate = editor.registerUpdateListener(schedule);
    const unregisterEditable = editor.registerEditableListener((editable) => {
      if (!editable) {
        close();
        picker.current?.();
      } else schedule();
    });
    const unregisterKeys = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (
          !live.current.popup ||
          event.isComposing ||
          event.keyCode === 229 ||
          composing.current ||
          editor.isComposing() ||
          !editor.isEditable()
        )
          return false;
        const count = live.current.options.length;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          close();
          return true;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (count)
            setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
          return true;
        }
        if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && count) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const option = live.current.options[Math.min(live.current.active, count - 1)];
          if (option)
            queueMicrotask(() => {
              if (alive) choose(option.key);
            });
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const startComposition = () => {
      composing.current = true;
      setPopup(undefined);
    };
    const endComposition = () => {
      composing.current = false;
      schedule();
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !root.contains(event.target)
      )
        close();
    };
    root.addEventListener('compositionstart', startComposition);
    root.addEventListener('compositionend', endComposition);
    doc.addEventListener('selectionchange', schedule);
    doc.addEventListener('focusin', schedule);
    doc.addEventListener('pointerdown', outside);
    view.addEventListener('scroll', schedule, true);
    view.addEventListener('resize', schedule);
    schedule();
    return () => {
      alive = false;
      action.current = undefined;
      picker.current?.();
      if (frame !== undefined) view.cancelAnimationFrame(frame);
      unregisterUpdate();
      unregisterEditable();
      unregisterKeys();
      root.removeEventListener('compositionstart', startComposition);
      root.removeEventListener('compositionend', endComposition);
      doc.removeEventListener('selectionchange', schedule);
      doc.removeEventListener('focusin', schedule);
      doc.removeEventListener('pointerdown', outside);
      view.removeEventListener('scroll', schedule, true);
      view.removeEventListener('resize', schedule);
      setPopup(undefined);
    };
  }, [kernel, setPositionReference]);
  const action = useRef<((choice: NativeSlashChoice) => void) | undefined>(undefined);
  useEffect(() => {
    const root = kernel.getLexicalEditor()?.getRootElement();
    if (!root || !popup) return;
    const previous = new Map(
      ['aria-controls', 'aria-expanded', 'aria-activedescendant'].map((key) => [
        key,
        root.getAttribute(key),
      ]),
    );
    root.setAttribute('aria-controls', id);
    root.setAttribute('aria-expanded', 'true');
    if (options.length)
      root.setAttribute('aria-activedescendant', `${id}-${Math.min(active, options.length - 1)}`);
    return () => {
      for (const [key, value] of previous) {
        if (value === null) root.removeAttribute(key);
        else root.setAttribute(key, value);
      }
    };
  }, [kernel, popup, id, active, options.length]);
  if (!popup) return null;
  return createPortal(
    <div
      aria-label={t('actionTag.category.command')}
      className="cn-menu-target z-50 max-h-80 min-w-48 overflow-y-auto rounded-(--radius-overlay) bg-popover p-1 text-popover-foreground shadow-(--shadow-popover) ring-1 ring-foreground/10"
      id={id}
      ref={setMenu}
      role="listbox"
      style={floatingStyles}
    >
      {options.map((item, index) => (
        <Button
          aria-selected={index === active}
          id={`${id}-${index}`}
          key={item.key}
          role="option"
          size="default"
          tabIndex={-1}
          type="button"
          variant="ghost"
          className={cn(
            'w-full justify-start gap-2',
            index === active && 'bg-accent text-accent-foreground',
          )}
          onClick={() => action.current?.(item.key)}
          onPointerDown={(event) => event.preventDefault()}
          onPointerMove={() => setActive(index)}
        >
          <item.icon aria-hidden className="size-4" />
          <span>{item.text}</span>
          <span className="ms-auto font-mono text-xs text-muted-foreground">{item.key}</span>
        </Button>
      ))}
      {!options.length && (
        <div className="p-2 text-sm text-muted-foreground" role="status">
          {t('cmdk.noResults', { ns: 'common' })}
        </div>
      )}
      {error && (
        <div className="p-2 text-sm text-destructive-text" role="alert">
          {t('nativeSlash.insertFailed')}
        </div>
      )}
    </div>,
    popup.container,
  );
}
