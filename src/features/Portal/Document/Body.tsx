'use client';

import { EDITOR_DEBOUNCE_TIME, EDITOR_MAX_WAIT } from '@orvilo/const';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { debounce } from 'es-toolkit/compat';
import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import CodeEditorPane from '@/components/CodeEditorPane';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import FloatingChatPanel from '@/features/FloatingChatPanel';
import { useDocumentChatTopic } from '@/features/FloatingChatPanel/useDocumentChatTopic';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useClientDataSWR } from '@/libs/swr';
import { portalKeys } from '@/libs/swr/keys';
import { documentService } from '@/services/document';
import { useAgentStore } from '@/store/agent';
import { useDocumentStore } from '@/store/document';
import { getDocumentRenderMode } from '@/utils/documentRenderMode';
import {
  getSkillMarkdownMetadataError,
  parseSkillMarkdownFrontmatterFields,
  parseSkillMarkdownMetadata,
} from '@/utils/skillMarkdown';

import {
  useDocumentViewFullPage,
  useResolvedAgentDocumentId,
  useResolvedDocumentId,
} from './documentViewContext';
import EditorCanvas from './EditorCanvas';
import TodoList from './TodoList';

const styles = createStaticStyles(({ css }) => ({
  content: css`
    overflow: auto;
    flex: 1;
    padding-inline: 16px;
  `,
  contentFull: css`
    /* Width is handled by WideScreenContainer; keep only the scroll host. */
    overflow: auto;
    flex: 1;
  `,
  frontmatter: css`
    margin-block: 16px 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorBgContainer};
  `,
  metadataKey: css`
    flex-shrink: 0;
    width: 112px;
    font-family: ${cssVar.fontFamilyCode};
    color: ${cssVar.colorTextSecondary};
  `,
  metadataRow: css`
    padding-block: 10px;
    padding-inline: 12px;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  metadataValue: css`
    min-width: 0;
    white-space: pre-wrap;
  `,
  sectionHeader: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  textArea: css`
    font-family: ${cssVar.fontFamilyCode};
  `,
}));

interface SkillFrontmatterBlockProps {
  documentId: string;
  frontmatter: string;
}

const SkillFrontmatterBlock = memo<SkillFrontmatterBlockProps>(({ documentId, frontmatter }) => {
  const { t } = useTranslation('editor');
  const metadata = useMemo(() => parseSkillMarkdownMetadata(frontmatter), [frontmatter]);
  const currentName = useMemo(
    () => parseSkillMarkdownFrontmatterFields(frontmatter).name,
    [frontmatter],
  );
  const [draft, setDraft] = useState(frontmatter);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [performSave, updateSkillFrontmatter] = useDocumentStore((s) => [
    s.performSave,
    s.updateSkillFrontmatter,
  ]);

  useEffect(() => {
    if (editing) return;
    setDraft(frontmatter);
  }, [editing, frontmatter]);

  const handleEdit = useCallback(() => {
    setDraft(frontmatter);
    setError(undefined);
    setEditing(true);
  }, [frontmatter]);

  const handleCancel = useCallback(() => {
    setDraft(frontmatter);
    setError(undefined);
    setEditing(false);
  }, [frontmatter]);

  const handleSave = useCallback(async () => {
    const nextError = getSkillMarkdownMetadataError(draft, { expectedName: currentName });
    if (nextError) {
      const message =
        nextError.type === 'nameLocked'
          ? t(`skillFrontmatter.invalid.${nextError.type}`, { name: nextError.expectedName })
          : t(`skillFrontmatter.invalid.${nextError.type}`);
      setError(message);
      return;
    }

    setSaving(true);
    try {
      const updated = updateSkillFrontmatter(documentId, draft);
      if (!updated) {
        setError(t('skillFrontmatter.saveFailed'));
        return;
      }

      await performSave(documentId, undefined, { saveSource: 'manual' });
      const latestDocument = useDocumentStore.getState().documents[documentId];
      if (latestDocument?.isDirty) {
        setError(t('skillFrontmatter.saveFailed'));
        return;
      }

      setEditing(false);
      setError(undefined);
    } finally {
      setSaving(false);
    }
  }, [currentName, documentId, draft, performSave, t, updateSkillFrontmatter]);

  return (
    <div className={cx('flex flex-col', styles.frontmatter)}>
      <div className={cx('flex flex-row items-center justify-between', styles.sectionHeader)}>
        <div className="text-muted-foreground">{t('skillFrontmatter.title')}</div>
        {editing ? (
          <div className="flex flex-row gap-2">
            <Button size="sm" variant="outline" onClick={handleCancel}>
              <XIcon data-icon="inline-start" />
              {t('cancel')}
            </Button>
            <Button loading={saving} size="sm" variant="default" onClick={handleSave}>
              <CheckIcon data-icon="inline-start" />
              {t('confirm')}
            </Button>
          </div>
        ) : (
          <ActionIcon
            icon={PencilIcon}
            size="small"
            title={t('skillFrontmatter.edit')}
            onClick={handleEdit}
          />
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 p-3">
          {/* Raw YAML is only exposed in edit mode so users can keep advanced frontmatter syntax. */}
          <Textarea
            rows={4}
            style={{ maxHeight: '19em' }}
            value={draft}
            className={cx(
              'border-0 px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0',
              styles.textArea,
            )}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              setDraft(event.target.value);
              setError(undefined);
            }}
          />
          {error && <div className="text-destructive">{error}</div>}
        </div>
      ) : metadata.length > 0 ? (
        metadata.map((item) => (
          <div className={cx('flex flex-row items-start', styles.metadataRow)} key={item.key}>
            <div className={cn(styles.metadataKey)}>{item.key}</div>
            <div className={cn(styles.metadataValue)}>{item.value}</div>
          </div>
        ))
      ) : (
        <div className={cx('flex flex-col', styles.metadataRow)}>
          <div className="text-muted-foreground">{t('skillFrontmatter.empty')}</div>
        </div>
      )}
    </div>
  );
});

interface HighlightEditorProps {
  content: string;
  documentId: string;
  filename: string;
  onSaved: (newContent: string) => void;
}

const HighlightEditor = memo<HighlightEditorProps>(({ content, documentId, filename, onSaved }) => {
  const [buffer, setBuffer] = useState<string | undefined>(undefined);
  const editingValue = buffer ?? content;

  const bufferRef = useRef(buffer);
  const documentIdRef = useRef(documentId);
  const onSavedRef = useRef(onSaved);
  bufferRef.current = buffer;
  documentIdRef.current = documentId;
  onSavedRef.current = onSaved;

  const writeBuffer = useCallback(async (source: 'manual' | 'autosave') => {
    const toWrite = bufferRef.current;
    if (toWrite === undefined) return;
    try {
      await documentService.updateDocument({
        content: toWrite,
        id: documentIdRef.current,
        saveSource: source,
      });
      // Update SWR cache before clearing the buffer so the editor's value prop
      // never falls back to stale content, which would otherwise reset the cursor.
      onSavedRef.current(toWrite);
      if (bufferRef.current === toWrite) setBuffer(undefined);
    } catch (error) {
      console.error('[HighlightEditor] save failed:', error);
    }
  }, []);

  const debouncedAutoSave = useMemo(
    () =>
      debounce(() => writeBuffer('autosave'), EDITOR_DEBOUNCE_TIME, {
        leading: false,
        maxWait: EDITOR_MAX_WAIT,
        trailing: true,
      }),
    [writeBuffer],
  );

  const handleChange = useCallback(
    (next: string) => {
      const isDirty = next !== content;
      setBuffer(isDirty ? next : undefined);
      if (isDirty) debouncedAutoSave();
      else debouncedAutoSave.cancel();
    },
    [content, debouncedAutoSave],
  );

  const handleSave = useCallback(async () => {
    debouncedAutoSave.cancel();
    await writeBuffer('manual');
  }, [debouncedAutoSave, writeBuffer]);

  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      debouncedAutoSave.cancel();
      const pendingContent = bufferRef.current;
      if (pendingContent === undefined) return;
      const pendingDocumentId = documentIdRef.current;
      // Defer the fire-and-forget save to a microtask so that StrictMode's synchronous
      // unmount/remount in development does not trigger a save. If the component is
      // immediately remounted, isMountedRef flips back to true before this runs.
      queueMicrotask(() => {
        if (isMountedRef.current) return;
        void documentService.updateDocument({
          content: pendingContent,
          id: pendingDocumentId,
          saveSource: 'autosave',
        });
      });
    };
  }, [debouncedAutoSave]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (bufferRef.current === undefined) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <CodeEditorPane
      showStatusBar
      filePath={filename}
      value={editingValue}
      onChange={handleChange}
      onSave={handleSave}
    />
  );
});

HighlightEditor.displayName = 'HighlightEditor';

const DocumentBody = memo(() => {
  const documentId = useResolvedDocumentId();
  const agentDocumentId = useResolvedAgentDocumentId();
  const fullPage = useDocumentViewFullPage();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  // `agentDocumentId` is what marks this as an *agent* document: only the agent-doc
  // openers pass it. The notebook opens plain topic documents with the id alone, and
  // `getOrCreateChatTopic` throws NOT_FOUND on those (no `agent_documents` row), so
  // the panel — and its topic lookup — must stay out of the way there.
  const panelEligible = !fullPage && !!activeAgentId && !!documentId && !!agentDocumentId;
  const { topicId: docChatTopicId } = useDocumentChatTopic({
    agentId: panelEligible ? activeAgentId : undefined,
    documentId: panelEligible ? documentId : undefined,
  });
  const [skillFrontmatter, contentFormat] = useDocumentStore((s) =>
    documentId
      ? [s.documents[documentId]?.skillFrontmatter ?? '', s.documents[documentId]?.contentFormat]
      : ['', undefined],
  );
  const isSkillMarkdown = contentFormat === 'skillMarkdown';

  const { data: documentMeta, mutate: mutateDocumentMeta } = useClientDataSWR(
    documentId ? portalKeys.documentHeader(documentId) : null,
    () => documentService.getDocumentById(documentId!),
  );
  const renderMode = documentMeta
    ? getDocumentRenderMode(documentMeta)
    : { mode: 'editor' as const };

  const handleHighlightSaved = useCallback(
    (saved: string) => {
      mutateDocumentMeta((prev) => (prev ? { ...prev, content: saved } : prev), {
        revalidate: false,
      });
    },
    [mutateDocumentMeta],
  );

  const editorContent = (
    <>
      {documentId && isSkillMarkdown && (
        <SkillFrontmatterBlock documentId={documentId} frontmatter={skillFrontmatter} />
      )}
      {renderMode.mode === 'highlight' && documentId ? (
        <HighlightEditor
          content={documentMeta?.content ?? ''}
          documentId={documentId}
          filename={documentMeta?.filename ?? ''}
          key={documentId}
          onSaved={handleHighlightSaved}
        />
      ) : (
        <EditorCanvas />
      )}
    </>
  );

  return (
    <div className="flex flex-col flex-1 h-[100%]" style={{ overflow: 'hidden' }}>
      <div className={fullPage ? styles.contentFull : styles.content}>
        {fullPage ? <WideScreenContainer>{editorContent}</WideScreenContainer> : editorContent}
      </div>
      <TodoList />
      {/* The full-page route hosts its own panel through `AgentDocumentPage`, so
          the in-portal panel only renders for the compact view. Both call sites
          drive a doc-anchored chat topic via `useDocumentChatTopic`, so the panel
          renders once that topic id resolves. */}
      {panelEligible && docChatTopicId && (
        <FloatingChatPanel
          agentDocumentId={agentDocumentId}
          agentId={activeAgentId}
          documentId={documentId ?? undefined}
          key={`${activeAgentId}:${docChatTopicId}:${documentId ?? 'none'}`}
          topicId={docChatTopicId}
        />
      )}
    </div>
  );
});

export default DocumentBody;
