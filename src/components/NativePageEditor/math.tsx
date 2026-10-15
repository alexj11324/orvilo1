'use client';

import { NativeMathBlockNode, NativeMathInlineNode } from '@orvilo/editor-runtime/headless';
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  HISTORY_PUSH_TAG,
} from 'lexical';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

import type { NativeWidgetProps } from './session';

export interface NativeMathRenderer {
  render: (
    code: string,
    element: HTMLElement,
    options: { displayMode: boolean; throwOnError: boolean; trust: false },
  ) => void;
  renderToString: (
    code: string,
    options: { displayMode: boolean; throwOnError: boolean; trust: false },
  ) => string;
}

type MathNode = NativeMathInlineNode | NativeMathBlockNode;
function isMathNode(node: unknown): node is MathNode {
  return node instanceof NativeMathInlineNode || node instanceof NativeMathBlockNode;
}

/** Decorator and editor share the exact local MathPlugin node identities. No SDK
 * React context, command identities, HTML import, or JSON re-serialization layer. */
export function NativeMathWidget({
  editor,
  node,
  renderer,
}: NativeWidgetProps & { renderer: NativeMathRenderer }) {
  if (!isMathNode(node)) throw new Error('Native math owner received a non-math node');
  return <MathWidget editor={editor} node={node} renderer={renderer} />;
}

function MathWidget({
  editor,
  node,
  renderer,
}: Pick<NativeWidgetProps, 'editor'> & { node: MathNode; renderer: NativeMathRenderer }) {
  const { t } = useTranslation('editor');
  const key = node.getKey();
  const block = node instanceof NativeMathBlockNode;
  const errorId = useId();
  const preview = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [editable, setEditable] = useState(editor.isEditable());
  const [selected, setSelected] = useState(false);
  const [code, setCode] = useState(node.code);
  const [value, setValue] = useState(node.code);
  const [error, setError] = useState('');
  const [blockWidth, setBlockWidth] = useState<number>();
  const lastValid = useRef(node.code);
  const lastDocumentCode = useRef(node.code);
  const ownWrite = useRef(false);
  const enterAtStart = useRef(false);

  useEffect(() => editor.registerEditableListener(setEditable), [editor]);
  useEffect(() => {
    const sync = () =>
      editor.getEditorState().read(() => {
        const current = $getNodeByKey(key);
        if (!isMathNode(current)) {
          setSelected(false);
          return;
        }
        const selection = $getSelection();
        setSelected($isNodeSelection(selection) && selection.has(key));
        setCode(current.code);
        // Actual outside mutations, undo and reload replace the draft. A pending
        // invalid TeX draft survives selection dismissal while its document stays unchanged.
        if (current.code !== lastDocumentCode.current) {
          lastDocumentCode.current = current.code;
          lastValid.current = current.code;
          if (!ownWrite.current) {
            setValue(current.code);
            setError('');
          }
        }
      });
    sync();
    return editor.registerUpdateListener(({ prevEditorState }) => {
      const previousAnchor = prevEditorState.read(() => {
        const previous = $getSelection();
        return $isRangeSelection(previous) ? previous.anchor.key : null;
      });
      editor.getEditorState().read(() => {
        const anchor = previousAnchor ? $getNodeByKey(previousAnchor) : null;
        const current = $getNodeByKey(key);
        if (anchor && current) enterAtStart.current = anchor.isBefore(current);
      });
      sync();
    });
  }, [editor, key]);
  useEffect(() => {
    if (!preview.current) return;
    preview.current.replaceChildren();
    if (code)
      renderer.render(code, preview.current, {
        displayMode: block,
        throwOnError: false,
        trust: false,
      });
  }, [code, block, renderer]);

  useEffect(() => {
    if (!block || !selected) return;
    const root = editor.getRootElement();
    if (!root) return;
    const measure = () => setBlockWidth(root.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [block, selected, editor]);

  function write(next: string, finish = false) {
    if (!editor.isEditable()) return;
    ownWrite.current = true;
    editor.update(
      () => {
        const current = $getNodeByKey(key);
        if (!isMathNode(current) || !current.isAttached()) return;
        if (current.code !== next) current.updateCode(next);
        if (finish) current.selectNext();
      },
      { discrete: true, ...(finish ? { tag: HISTORY_PUSH_TAG } : {}) },
    );
    ownWrite.current = false;
  }
  function change(next: string) {
    setValue(next);
    try {
      if (next.trim())
        renderer.renderToString(next, { displayMode: block, throwOnError: true, trust: false });
      setError('');
      lastValid.current = next;
      write(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function leave(previous: boolean) {
    editor.update(
      () => {
        const current = $getNodeByKey(key);
        if (!isMathNode(current)) return;
        if (previous) current.selectPrevious();
        else current.selectNext();
      },
      { discrete: true },
    );
    editor.focus();
  }
  function remove() {
    if (!editor.isEditable()) return;
    editor.update(
      () => {
        const current = $getNodeByKey(key);
        if (!isMathNode(current)) return;
        current.selectPrevious();
        current.remove();
      },
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    editor.focus();
  }

  return (
    <Popover
      open={editable && selected}
      onOpenChange={(open) => {
        if (!open) {
          if (selected) leave(false);
          return;
        }
        if (!editor.isEditable()) return;
        editor.update(() => {
          const selection = $createNodeSelection();
          selection.add(key);
          $setSelection(selection);
        });
      }}
    >
      <PopoverTrigger
        aria-label={t('math.placeholder')}
        className={`${block ? 'block w-full overflow-x-auto py-4 text-center' : 'inline'} cursor-text rounded-(--radius-input) hover:bg-accent data-open:bg-selected`}
        nativeButton={false}
        render={<span contentEditable={false} />}
        tabIndex={editable ? 0 : -1}
        onPointerDown={() => {
          enterAtStart.current = false;
        }}
      >
        <span ref={preview} />
        {!code && <span className="text-muted-foreground">{t('math.placeholder')}</span>}
      </PopoverTrigger>
      <PopoverContent
        align={block ? 'start' : 'center'}
        className="w-80 max-w-full gap-2"
        finalFocus={false}
        style={block && blockWidth ? { width: blockWidth } : undefined}
        initialFocus={() => {
          input.current?.focus();
          if (enterAtStart.current) input.current?.setSelectionRange(0, 0);
          return input.current ?? true;
        }}
      >
        <Textarea
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-label={t('math.placeholder')}
          className="max-h-40 resize-none font-mono"
          disabled={!editable}
          placeholder={t('math.placeholder')}
          ref={input}
          rows={1}
          value={value}
          onChange={(event) => change(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            const { selectionStart, selectionEnd } = event.currentTarget;
            const collapsed = selectionStart === selectionEnd;
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              write(error ? lastValid.current : value, true);
              editor.focus();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              leave(false);
            } else if (event.key === 'Backspace' && !value.trim()) {
              event.preventDefault();
              remove();
            } else if (event.key === 'ArrowLeft' && collapsed && selectionStart === 0) {
              event.preventDefault();
              leave(true);
            } else if (event.key === 'ArrowRight' && collapsed && selectionStart === value.length) {
              event.preventDefault();
              leave(false);
            }
          }}
        />
        {error && (
          <p className="text-sm text-destructive-text" id={errorId} role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            disabled={!editable}
            size="compact"
            onClick={() => {
              write(error ? lastValid.current : value, true);
              editor.focus();
            }}
          >
            {t('confirm')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
