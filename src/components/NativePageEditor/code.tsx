'use client';

import {
  ICodemirrorEditLockService,
  SELECT_AFTER_CODEMIRROR_COMMAND,
  SELECT_BEFORE_CODEMIRROR_COMMAND,
} from '@orvilo/editor-runtime/native-browser';
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  type LexicalNode,
  UNDO_COMMAND,
} from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import InputNumber from '@/components/InputNumber';
import Mermaid from '@/components/Mermaid';
import Select from '@/components/Select';
import { Button } from '@/components/ui/button';
import { useIsDark } from '@/hooks/useIsDark';

import {
  nativeCodeLanguages,
  resolveNativeCodeLanguage,
} from '../NativeCodeEditor/languageCatalog';
import { mountProfessionalCodeBlock } from '../NativeCodeEditor/professional/codeBlockIsland';
import type { NativeWidgetProps } from './session';

interface CodeOptions {
  indentWithTabs: boolean;
  lineNumbers: boolean;
  tabSize: number;
}
interface CodeNode extends LexicalNode {
  readonly code: string;
  readonly lang: string;
  readonly options: CodeOptions;
  setCode: (value: string) => this;
  setIndentWithTabs: (value: boolean) => this;
  setLang: (value: string) => this;
  setLineNumbers: (value: boolean) => this;
  setTabSize: (value: number) => this;
}
interface CodeSnapshot {
  code: string;
  language: string;
  options: CodeOptions;
}
const isCodeNode = (node: LexicalNode | null): node is CodeNode =>
  node?.getType() === 'code' && 'setCode' in node && 'setLang' in node;
const languageOptions = nativeCodeLanguages.map(({ name, value }) => ({ label: name, value }));
type Island = NonNullable<Awaited<ReturnType<typeof mountProfessionalCodeBlock>>>;

/** The current browser Kernel code decorator, backed by the complete original professional kernel. */
export function NativeProfessionalCodeWidget({ node, editor, kernel }: NativeWidgetProps) {
  const { t } = useTranslation(['editor', 'common']);
  const host = useRef<HTMLDivElement>(null);
  const island = useRef<Island | undefined>(undefined);
  const dark = useIsDark();
  const liveDark = useRef(dark);
  liveDark.current = dark;
  const key = node.getKey();
  const service = kernel.requireService(ICodemirrorEditLockService);
  const read = useCallback(
    (): CodeSnapshot | undefined =>
      editor.getEditorState().read(() => {
        const current = $getNodeByKey(key);
        return isCodeNode(current)
          ? { code: current.code, language: current.lang, options: { ...current.options } }
          : undefined;
      }),
    [editor, key],
  );
  const [snapshot, setSnapshot] = useState(read);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [remoteName, setRemoteName] = useState<string | undefined>(undefined);
  const [editable, setEditable] = useState(kernel.isEditable());
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const initial = read();
    if (!initial) return;
    const controller = new AbortController();
    let held = false;
    let previous = initial;
    let enterAtEnd = false;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      if (releaseTimer !== undefined) clearTimeout(releaseTimer);
      releaseTimer = undefined;
    };
    const release = () => {
      clearTimer();
      const wasHeld = held;
      held = false;
      if (wasHeld) service?.releaseLock(key);
    };
    const readonly = () => !kernel.isEditable() || !!service?.getRemoteLockOwner(key);
    const syncReadonly = () => {
      const owner = service?.getRemoteLockOwner(key);
      const enabled = !readonly();
      setRemoteName(owner ? (owner.name ?? '') : undefined);
      setEditable(enabled);
      island.current?.setOption('readOnly', !enabled);
      if (!enabled) {
        release();
        island.current?.instance.blur();
      }
    };
    const sync = () => {
      const next = read();
      if (!next) return;
      setSnapshot(next);
      const current = island.current;
      if (!current) return;
      current.updateValue(next.code);
      if (next.language !== previous.language)
        current.setOption('mode', resolveNativeCodeLanguage(next.language).value);
      if (next.options.tabSize !== previous.options.tabSize)
        current.setOption('tabSize', next.options.tabSize ?? 2);
      if (next.options.indentWithTabs !== previous.options.indentWithTabs)
        current.setOption('indentWithTabs', next.options.indentWithTabs ?? false);
      if (next.options.lineNumbers !== previous.options.lineNumbers)
        current.setOption('lineNumbers', next.options.lineNumbers ?? false);
      previous = next;
      const selection = editor.getEditorState().read(() => $getSelection());
      const content = current.instance.view.contentDOM;
      const selected = $isNodeSelection(selection) && selection.has(key);
      if (selected && !readonly() && document.activeElement !== content) {
        current.instance.focus();
        if (enterAtEnd) current.instance.setSelectionToEnd();
      } else if (!selected && selection !== null && document.activeElement === content) {
        current.instance.blur();
      }
    };
    const boundary = (direction: 'before' | 'after') => {
      island.current?.instance.blur();
      editor.dispatchCommand(
        direction === 'before' ? SELECT_BEFORE_CODEMIRROR_COMMAND : SELECT_AFTER_CODEMIRROR_COMMAND,
        { key },
      );
      queueMicrotask(() => {
        if (!controller.signal.aborted) editor.focus();
      });
    };
    const unsubscribeLock = service?.subscribe(syncReadonly);
    const unregisterEditable = editor.registerEditableListener(syncReadonly);
    const unregisterUpdate = editor.registerUpdateListener(sync);
    const unregisterKeys = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        enterAtEnd = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    const visibility = () => {
      if (
        document.visibilityState === 'visible' &&
        document.activeElement !== island.current?.instance.view.contentDOM
      )
        release();
    };
    document.addEventListener('visibilitychange', visibility);
    syncReadonly();
    void mountProfessionalCodeBlock(
      host.current,
      {
        value: initial.code,
        mode: resolveNativeCodeLanguage(initial.language).value,
        readOnly: readonly(),
        tabSize: initial.options.tabSize ?? 2,
        indentWithTabs: initial.options.indentWithTabs ?? false,
        lineNumbers: initial.options.lineNumbers ?? false,
        theme: 'default',
        useHistory: true,
      },
      {
        onChange: (value) => {
          if (readonly()) return;
          editor.update(() => {
            const current = $getNodeByKey(key);
            if (isCodeNode(current)) current.setCode(value);
          });
        },
        onFocus: () => {
          clearTimer();
          if (readonly()) return false;
          const acquired = service?.acquireLock(key, 'CodeMirror block') ?? true;
          held = acquired;
          if (acquired)
            editor.update(() => {
              const selection = $getSelection();
              if ($isNodeSelection(selection) && selection.has(key)) return;
              const next = $createNodeSelection();
              next.add(key);
              $setSelection(next);
            });
          return acquired;
        },
        onBlur: () => {
          clearTimer();
          releaseTimer = setTimeout(() => {
            releaseTimer = undefined;
            if (
              document.visibilityState === 'hidden' ||
              document.activeElement === island.current?.instance.view.contentDOM
            )
              return;
            release();
          }, 100);
        },
        onBoundary: boundary,
        onUndoBoundary: () => {
          editor.dispatchCommand(UNDO_COMMAND, undefined);
        },
        onKeyDown: (event) => {
          event.stopPropagation();
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            boundary('after');
          } else if (
            event.key === 'Backspace' &&
            !readonly() &&
            !island.current?.instance.getValue().trim()
          ) {
            event.preventDefault();
            editor.update(() => {
              const current = $getNodeByKey(key);
              if (isCodeNode(current)) {
                current.selectPrevious();
                current.remove();
              }
            });
            queueMicrotask(() => {
              if (!controller.signal.aborted) editor.focus();
            });
          }
        },
      },
      liveDark.current,
      controller.signal,
    )
      .then((mounted) => {
        if (!mounted) return;
        if (controller.signal.aborted || !read()) {
          mounted.destroy();
          return;
        }
        island.current = mounted;
        mounted.setTheme(liveDark.current);
        sync();
        syncReadonly();
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      controller.abort();
      clearTimer();
      release();
      unsubscribeLock?.();
      unregisterEditable();
      unregisterUpdate();
      unregisterKeys();
      document.removeEventListener('visibilitychange', visibility);
      island.current = undefined;
    };
  }, [editor, kernel, key, service, read]);
  useEffect(() => {
    island.current?.setTheme(dark);
  }, [dark]);
  useEffect(() => {
    if (expanded && !preview) island.current?.instance.refresh();
  }, [expanded, preview]);

  if (!snapshot) return null;
  const language = resolveNativeCodeLanguage(snapshot.language).value;
  const mutate = (change: (current: CodeNode) => void) => {
    if (!kernel.isEditable() || service?.getRemoteLockOwner(key)) return;
    editor.update(() => {
      const current = $getNodeByKey(key);
      if (isCodeNode(current)) change(current);
    });
  };
  return (
    <div
      className="min-w-0 overflow-hidden rounded-(--radius-card) border border-border bg-background"
      contentEditable={false}
      onMouseUp={(event) => event.stopPropagation()}
      onSelect={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (!editable) {
          event.preventDefault();
          island.current?.instance.blur();
        }
      }}
    >
      {/* Code work toolbar uses the approved compact32 role. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-divider p-2">
        <Select
          aria-label={t('codemirror.selectLanguage')}
          disabled={!editable}
          options={languageOptions}
          size="compact"
          value={language}
          onChange={(value) => {
            if (typeof value === 'string') {
              mutate((current) => current.setLang(value));
              if (value !== 'mermaid') setPreview(false);
            }
          }}
        />
        <InputNumber
          aria-label={t('codemirror.tabSize')}
          disabled={!editable}
          max={8}
          min={1}
          size="compact"
          value={snapshot.options.tabSize ?? 2}
          onChange={(value) => mutate((current) => current.setTabSize(value ?? 2))}
        />
        <Button
          aria-pressed={snapshot.options.indentWithTabs ?? false}
          disabled={!editable}
          size="compact"
          variant="ghost"
          onClick={() =>
            mutate((current) => current.setIndentWithTabs(!snapshot.options.indentWithTabs))
          }
        >
          {t('codemirror.useTabs')}
        </Button>
        <Button
          aria-pressed={snapshot.options.lineNumbers ?? false}
          disabled={!editable}
          size="compact"
          variant="ghost"
          onClick={() => mutate((current) => current.setLineNumbers(!snapshot.options.lineNumbers))}
        >
          {t('codemirror.showLineNumbers')}
        </Button>
        <Button
          size="compact"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard
              .writeText(island.current?.instance.getValue() ?? snapshot.code)
              .then(
                () => setCopyError(false),
                () => setCopyError(true),
              );
          }}
        >
          {t('copy', { ns: 'common' })}
        </Button>
        {language === 'mermaid' && (
          <Button
            aria-pressed={preview}
            size="compact"
            variant="ghost"
            onClick={() => setPreview(!preview)}
          >
            {t('codemirror.preview')}
          </Button>
        )}
        <Button
          aria-expanded={expanded}
          size="compact"
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? 'actions.expand.off' : 'actions.expand.on')}
        </Button>
      </div>
      {remoteName !== undefined && (
        <div className="px-2 text-xs text-muted-foreground" role="status">
          {remoteName
            ? t('codemirror.locked', { name: remoteName })
            : t('codemirror.lockedAnonymous')}
        </div>
      )}
      {copyError && (
        <div className="px-2 text-xs text-destructive-text" role="status">
          {t('codemirror.copyFailed')}
        </div>
      )}
      {error && (
        <div className="p-2 text-destructive-text" role="alert">
          {t('file.error', { message: error })}
        </div>
      )}
      <div hidden={!expanded || preview} ref={host} />
      {expanded && preview && language === 'mermaid' && <Mermaid>{snapshot.code}</Mermaid>}
    </div>
  );
}
