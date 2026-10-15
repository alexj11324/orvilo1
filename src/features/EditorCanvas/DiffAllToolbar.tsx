'use client';

import type { IEditor } from '@lobehub/editor';
import { DiffAction, LITEXML_DIFFNODE_ALL_COMMAND } from '@lobehub/editor';
import { Check, X } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useDocumentStore } from '@/store/document';

const styles = {
  container: 'absolute z-1000 inset-be-6 inset-x-0 mx-auto [inline-size:fit-content]',
  toolbar:
    'flex gap-2 p-1 border border-border rounded-(--radius-overlay) bg-popover shadow-(--shadow-popover)',
};

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
  const [performSave, markDirty] = useDocumentStore((s) => [s.performSave, s.markDirty]);

  const hasPendingDiffs = useEditorHasPendingDiffs(editor);

  if (!editor || !hasPendingDiffs) return null;

  const handleSave = async () => {
    markDirty(documentId);
    await performSave(documentId, undefined, { saveSource: 'manual' });
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className="flex items-center gap-2">
          <Button
            size="compact"
            variant="ghost"
            onClick={async () => {
              editor.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, {
                action: DiffAction.Reject,
              });
              await handleSave();
            }}
          >
            <X className="size-4" size={16} />
            {t('modifier.rejectAll')}
          </Button>
          <Button
            size="compact"
            variant="secondary"
            onClick={async () => {
              editor.dispatchCommand(LITEXML_DIFFNODE_ALL_COMMAND, {
                action: DiffAction.Accept,
              });
              await handleSave();
            }}
          >
            <Check className="size-4 text-success-text" size={16} />
            {t('modifier.acceptAll')}
          </Button>
        </div>
      </div>
    </div>
  );
});

DiffAllToolbar.displayName = 'DiffAllToolbar';

export default DiffAllToolbar;
