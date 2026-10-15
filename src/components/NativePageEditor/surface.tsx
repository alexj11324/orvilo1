'use client';
import './styles.css';

import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { COMMAND_PRIORITY_EDITOR, KEY_DOWN_COMMAND, type LexicalEditor } from 'lexical';
import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { NativeSessionContext } from './session';

type PortalEntry = { queryDOM: (element: HTMLElement) => HTMLElement | null; render: ReactNode };
type NativeDecoration = ReactNode | PortalEntry | { multi: PortalEntry[] };
function entries(decoration: NativeDecoration, element: HTMLElement): PortalEntry[] {
  if (decoration && typeof decoration === 'object' && 'multi' in decoration)
    return decoration.multi;
  if (decoration && typeof decoration === 'object' && 'queryDOM' in decoration) return [decoration];
  return [{ queryDOM: () => element, render: decoration }];
}
class DecoratorBoundary extends Component<
  { children: ReactNode; editor: NativeIEditorKernel; fallback: string },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.editor.emit('error', error);
  }
  render() {
    return this.state.error ? <span role="alert">{this.props.fallback}</span> : this.props.children;
  }
}
function flattenLocale(
  value: unknown,
  prefix = '',
  output: Record<string, string> = {},
): Record<string, string> {
  if (!value || typeof value !== 'object') return output;
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'string') output[path] = item;
    else flattenLocale(item, path, output);
  }
  return output;
}
export interface NativeEditorSurfaceProps {
  autoFocus?: boolean;
  children?: ReactNode;
  className?: string;
  content: unknown;
  contentClassName?: string;
  debounceWait?: number;
  editable?: boolean;
  editor: NativeIEditorKernel;
  label: string;
  onBlur?: () => void;
  onChange?: (editor: NativeIEditorKernel) => void;
  onFocus?: () => void;
  onInit?: (editor: NativeIEditorKernel) => void;
  onPressEnter?: (event: KeyboardEvent) => boolean | void;
  onTextChange?: (editor: NativeIEditorKernel) => void;
  placeholder?: ReactNode;
  readOnlyPresentation?: boolean;
  style?: CSSProperties;
  type?: 'json' | 'markdown' | 'text' | 'litexml';
}
/** Stable SSR tree and one initial hydration: prop polling never replaces a live
 * document. Parent APIs explicitly setDocument for source changes/reset. */
export function NativeEditorSurface(props: NativeEditorSurfaceProps) {
  const {
    editor,
    label,
    placeholder,
    className,
    style,
    children,
    editable = true,
    autoFocus = false,
  } = props;
  const { t, i18n } = useTranslation('editor');
  const callbacks = useRef(props);
  callbacks.current = props;
  const initial = useRef({ content: props.content, type: props.type ?? 'json' });
  const hydrated = useRef(false);
  const [lexical, setLexical] = useState<LexicalEditor | null>(null);
  const [decorators, setDecorators] = useState<Record<string, NativeDecoration>>({});
  const [empty, setEmpty] = useState(true);
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        editor.setRootElement(null);
        return;
      }
      const initialized = editor.setRootElement(element, callbacks.current.editable ?? true);
      setLexical(initialized);
      if (!hydrated.current) {
        hydrated.current = true;
        editor.setDocument(initial.current.type, initial.current.content);
        callbacks.current.onInit?.(editor);
      }
    },
    [editor],
  );
  useEffect(() => {
    editor.registerLocale(
      flattenLocale(i18n.getResourceBundle(i18n.resolvedLanguage ?? i18n.language, 'editor')),
    );
  }, [editor, i18n, i18n.language, i18n.resolvedLanguage]);
  useEffect(() => {
    if (lexical) editor.setEditable(editable);
  }, [editor, editable, lexical]);
  useEffect(() => {
    if (!lexical) return;
    setDecorators(lexical.getDecorators<NativeDecoration>());
    setEmpty(editor.isEmpty);
    const detach = lexical.registerDecoratorListener<NativeDecoration>(setDecorators);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = callbacks.current.onTextChange ? JSON.stringify(editor.getDocument('json')) : '';
    const publish = () => {
      callbacks.current.onChange?.(editor);
      if (!callbacks.current.onTextChange) return;
      const current = JSON.stringify(editor.getDocument('json'));
      if (current !== previous) {
        previous = current;
        callbacks.current.onTextChange?.(editor);
      }
    };
    const unregister = lexical.registerUpdateListener(() => {
      setEmpty(editor.isEmpty);
      if (timer) clearTimeout(timer);
      const wait = callbacks.current.debounceWait ?? 100;
      if (wait > 0)
        timer = setTimeout(() => {
          timer = undefined;
          publish();
        }, wait);
      else publish();
    });
    return () => {
      detach();
      unregister();
      if (timer) {
        clearTimeout(timer);
        publish();
      }
    };
  }, [editor, lexical]);
  useEffect(() => {
    if (!lexical) return;
    return editor.registerHighCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (
          event.key === 'Enter' &&
          !event.isComposing &&
          callbacks.current.onPressEnter?.(event)
        ) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor, lexical]);
  useEffect(() => {
    if (autoFocus && lexical) editor.focus();
  }, [autoFocus, editor, lexical]);
  return (
    <NativeSessionContext value={editor}>
      <div className={cn('native-editor-container relative', className)} style={style}>
        <div
          spellCheck
          suppressContentEditableWarning
          aria-label={label}
          aria-multiline={props.readOnlyPresentation ? undefined : true}
          contentEditable={editable}
          data-native-editor="true"
          ref={attach}
          role={props.readOnlyPresentation ? 'document' : 'textbox'}
          className={cn(
            'native-editor-content min-h-9 w-full whitespace-pre-wrap break-words text-sm text-foreground outline-none',
            props.contentClassName,
          )}
          onBlur={() => callbacks.current.onBlur?.()}
          onFocus={() => callbacks.current.onFocus?.()}
        />
        {empty && placeholder ? (
          <div
            aria-hidden="true"
            className="native-editor-placeholder pointer-events-none absolute inset-x-0 top-0 text-muted-foreground"
          >
            {placeholder}
          </div>
        ) : null}
        {Object.entries(decorators).flatMap(([key, decoration]) => {
          const element = lexical?.getElementByKey(key);
          if (!element) return [];
          return entries(decoration, element).flatMap((entry, index) => {
            const target = entry.queryDOM(element);
            if (!target) return [];
            return [
              createPortal(
                <DecoratorBoundary
                  editor={editor}
                  fallback={t('editor.renderFailed', {
                    defaultValue: 'Unable to render document content',
                  })}
                >
                  <Suspense fallback={null}>{entry.render}</Suspense>
                </DecoratorBoundary>,
                target,
                `${key}:${index}`,
              ),
            ];
          });
        })}
        {children}
      </div>
    </NativeSessionContext>
  );
}
