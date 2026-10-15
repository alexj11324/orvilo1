'use client';

import { type CSSProperties, memo, useEffect, useMemo, useRef, useState } from 'react';

import AsyncError from '@/components/AsyncError';
import { useIsDark } from '@/hooks/useIsDark';

import { detectIndentStyle } from './indent';
import { getEditorLanguage } from './language';
import { mountNativeCodePane, type NativePaneState } from './nativePane';
import StatusBar, { type CursorPosition } from './StatusBar';
import { styles } from './style';

export interface CodeEditorPaneProps {
  className?: string;
  /**
   * Path or filename of the edited file. Selects the grammar and names the
   * language in the status bar; takes precedence over `language`.
   */
  filePath?: string;
  /** Explicit CodeMirror grammar id, for content that has no file behind it. */
  language?: string;
  onChange?: (value: string) => void;
  /** Triggered when the user presses Cmd/Ctrl + S while the editor has focus. */
  onSave?: () => void | Promise<void>;
  readOnly?: boolean;
  /** Shows the cursor position, indentation, word wrap toggle and language. */
  showStatusBar?: boolean;
  style?: CSSProperties;
  value: string;
}

const CodeEditorPane = memo<CodeEditorPaneProps>(
  ({
    value,
    filePath,
    language,
    style,
    className,
    readOnly = false,
    showStatusBar = false,
    onChange,
    onSave,
  }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const pane = useRef<Awaited<ReturnType<typeof mountNativeCodePane>>>(undefined);
    const isDark = useIsDark();
    const [lineWrapping, setLineWrapping] = useState(true);
    const [cursor, setCursor] = useState<CursorPosition>();
    const [error, setError] = useState<unknown>();
    const editorLanguage = useMemo(
      () => (filePath ? getEditorLanguage(filePath) : undefined),
      [filePath],
    );
    const mode = editorLanguage?.mode ?? language ?? '';
    const [indent] = useState(() => detectIndentStyle(value));
    const live = useRef({
      state: { value, mode, readOnly, lineWrapping, dark: isDark } satisfies NativePaneState,
      indent,
      onChange,
      onSave,
    });
    live.current = {
      state: { value, mode, readOnly, lineWrapping, dark: isDark },
      indent,
      onChange,
      onSave,
    };
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const controller = new AbortController();
      const initial = live.current;
      void mountNativeCodePane(
        host,
        {
          autoCloseBrackets: !initial.state.readOnly,
          foldGutter: true,
          indentWithTabs: initial.indent.useTabs,
          lineNumbers: true,
          lineWrapping: initial.state.lineWrapping,
          matchBrackets: true,
          mode: initial.state.mode,
          readOnly: initial.state.readOnly,
          styleActiveLine: true,
          tabSize: initial.indent.size,
          theme: 'default',
          value: initial.state.value,
          useHistory: true,
        },
        initial.state,
        {
          onChange: (next) => live.current.onChange?.(next),
          onSave: () => {
            void live.current.onSave?.();
          },
          onCursor: setCursor,
        },
        controller.signal,
      )
        .then((mounted) => {
          if (!mounted || controller.signal.aborted) {
            mounted?.destroy();
            return;
          }
          pane.current = mounted;
          // Props can change while the local professional asset is loading.
          mounted.apply(live.current.state);
        })
        .catch((failure: unknown) => {
          if (!controller.signal.aborted) {
            controller.abort();
            pane.current = undefined;
            setError(failure);
          }
        });
      return () => {
        controller.abort();
        pane.current = undefined;
      };
    }, []);
    useEffect(() => {
      pane.current?.apply(live.current.state);
    }, [value, mode, readOnly, lineWrapping, isDark]);

    return (
      <div className={`${styles.container} ${className ?? ''}`.trim()} style={style}>
        <div className={styles.editorArea}>
          {error !== undefined && <AsyncError error={error} variant="inline" />}
          <div className="h-full" ref={hostRef} />
        </div>
        {showStatusBar && (
          <StatusBar
            cursor={cursor}
            indent={indent}
            languageLabel={editorLanguage?.label ?? language ?? ''}
            lineWrapping={lineWrapping}
            readOnly={readOnly}
            onLineWrappingChange={setLineWrapping}
          />
        )}
      </div>
    );
  },
);
CodeEditorPane.displayName = 'CodeEditorPane';
export default CodeEditorPane;
