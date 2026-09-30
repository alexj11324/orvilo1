'use client';

import type { IEditor } from '@lobehub/editor';
import { DiffAction, LITEXML_DIFFNODE_ALL_COMMAND } from '@lobehub/editor';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { Check, X } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useIsDark } from '@/hooks/useIsDark';
import { useDocumentStore } from '@/store/document';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    position: absolute;
    z-index: 1000;
    inset-block-end: 24px;
    inset-inline-start: 50%;
    transform: translateX(-50%);
  `,
  toolbar: css`
    border-color: ${cssVar.colorFillSecondary};
    background: ${cssVar.colorBgElevated};
  `,
  toolbarDark: css`
    box-shadow:
      0 14px 28px -6px #0003,
      0 2px 4px -1px #0000001f;
  `,
  toolbarLight: css`
    box-shadow:
      0 14px 28px -6px #0000001a,
      0 2px 4px -1px #0000000f;
  `,
}));

const useIsEditorInit = (editor?: IEditor) => {
  const [isEditInit, setEditInit] = useState<boolean>(!!editor?.getLexicalEditor());

  useEffect(() => {
    if (!editor) return;

    // The editor may have initialized between render and this effect
    // (the Editor canvas mounts earlier and emits 'initialized' synchronously),
    // so re-check before subscribing to avoid missing the event forever.
    if (editor.getLexicalEditor()) {
      setEditInit(true);
      return;
    }

    const onInit = () => {
      setEditInit(true);
    };
    editor.on('initialized', onInit);
    return () => {
      editor.off('initialized', onInit);
    };
  }, [editor]);

  return isEditInit;
};

const useEditorHasPendingDiffs = (editor?: IEditor) => {
  const [hasPendingDiffs, setHasPendingDiffs] = useState(false);
  const isEditInit = useIsEditorInit(editor);

  // Listen to editor state changes to detect diff nodes
  useEffect(() => {
    if (!editor) return;

    const lexicalEditor = editor.getLexicalEditor();

    if (!lexicalEditor || !isEditInit) return;

    const checkForDiffNodes = () => {
      const editorState = lexicalEditor.getEditorState();
      editorState.read(() => {
        // Get all nodes and check if any is a diff node
        const nodeMap = editorState._nodeMap;
        let hasDiffs = false;
        nodeMap.forEach((node) => {
          if (node.getType() === 'diff') {
            hasDiffs = true;
          }
        });
        setHasPendingDiffs(hasDiffs);
      });
    };

    // Check initially
    checkForDiffNodes();

    const unregister = lexicalEditor.registerUpdateListener(() => {
      checkForDiffNodes();
    });
    // Register update listener
    return () => {
      unregister();
    };
  }, [editor, isEditInit]);

  return hasPendingDiffs;
};

interface DiffAllToolbarProps {
  documentId: string;
  editor?: IEditor;
}
const DiffAllToolbar = memo<DiffAllToolbarProps>(({ documentId, editor }) => {
  const { t } = useTranslation('editor');
  const isDarkMode = useIsDark();
  const [performSave, markDirty] = useDocumentStore((s) => [s.performSave, s.markDirty]);

  const hasPendingDiffs = useEditorHasPendingDiffs(editor);

  if (!editor || !hasPendingDiffs) return null;

  const handleSave = async () => {
    markDirty(documentId);
    await performSave(documentId, undefined, { saveSource: 'manual' });
  };

  return (
    <div className={styles.container}>
      <div
        style={{ border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG }}
        className={cn(
          'flex gap-2 p-1 shadow-md',
          cx(styles.toolbar, isDarkMode ? styles.toolbarDark : styles.toolbarLight),
        )}
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              editor.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, {
                action: DiffAction.Reject,
              });
              await handleSave();
            }}
          >
            <X size={16} />
            {t('modifier.rejectAll')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              editor.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, {
                action: DiffAction.Accept,
              });
              await handleSave();
            }}
          >
            <Check color={'green'} size={16} />
            {t('modifier.acceptAll')}
          </Button>
        </div>
      </div>
    </div>
  );
});

DiffAllToolbar.displayName = 'DiffAllToolbar';

export default DiffAllToolbar;
