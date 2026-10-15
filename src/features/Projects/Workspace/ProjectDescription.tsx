'use client';
import { ReactLinkPlugin, ReactListPlugin } from '@lobehub/editor';
import { Editor, useEditor } from '@lobehub/editor/react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { createElement, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { projectService } from '@/services/project';

const styles = {
  editor:
    '[&_[contenteditable]]:min-h-8 [&_[contenteditable]]:text-sm [&_[contenteditable]]:leading-5.5 [&_[contenteditable]]:font-normal [&_[contenteditable]]:[--lobe-markdown-font-size:var(--text-sm)] [&_[contenteditable]]:[--lobe-markdown-line-height:calc(22/14)] pt-1 pr-0 pb-1 pl-0',
  header:
    'flex min-h-8 min-w-8 cursor-pointer items-center self-start gap-1 rounded-(--radius-button) border-0 bg-transparent p-0 text-inherit select-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
};

interface ProjectDescriptionProps {
  canEdit?: boolean;
  description?: string | null;
  onSaved?: () => void;
  projectId: string;
}

const plugins = [ReactLinkPlugin, ReactListPlugin];

// Keep the document mounted when collapsed so disclosure never discards a draft.
const ProjectDescription = ({
  canEdit = false,
  description,
  onSaved,
  projectId,
}: ProjectDescriptionProps) => {
  const { t } = useTranslation('project');
  const editor = useEditor();
  const bodyId = useId();
  const [open, setOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const baseline = useRef<string | undefined>(undefined);
  const source = useRef(description ?? '');
  const incoming = useRef(description ?? '');
  const label = t('overview.descriptionEditor');

  useEffect(
    () =>
      editor.getLexicalEditor()?.registerRootListener((root) => {
        root?.setAttribute('aria-label', label);
        root?.setAttribute('role', 'textbox');
        root?.setAttribute('aria-multiline', 'true');
      }),
    [editor, label],
  );

  useEffect(() => {
    const next = description ?? '';
    if (!dirty && !pending.current && next !== incoming.current) {
      incoming.current = next;
      source.current = next;
      baseline.current = undefined;
      editor.setDocument(next ? 'markdown' : 'text', next);
    }
  }, [description, dirty, editor]);

  const save = async () => {
    if (!canEdit || pending.current) return;
    const draft = String(editor.getDocument('markdown') ?? '');
    pending.current = true;
    setSaving(true);
    try {
      await projectService.update(projectId, { description: draft });
      source.current = draft;
      baseline.current = draft;
      setDirty(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        aria-controls={bodyId}
        aria-expanded={open}
        className={styles.header}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {createElement(open ? ChevronDownIcon : ChevronRightIcon, { size: 14 })}
        <span className="text-muted-foreground text-xs leading-5 font-medium">
          {t('overview.descriptionLabel')}
        </span>
      </button>
      <div hidden={!open} id={bodyId}>
        <Editor
          className={styles.editor}
          content={description || ''}
          debounceWait={0}
          editable={canEdit && !saving}
          editor={editor}
          plugins={plugins}
          type={description ? 'markdown' : 'text'}
          placeholder={
            <span className="block pt-1 pr-0 pb-1 pl-0 text-sm leading-5.5">
              {t('overview.descriptionEmpty')}
            </span>
          }
          onChange={(current) => {
            if (baseline.current !== undefined && !pending.current)
              setDirty(String(current.getDocument('markdown') ?? '') !== baseline.current);
          }}
          onFocus={() => {
            baseline.current ??= String(editor.getDocument('markdown') ?? '');
          }}
        />
        {dirty && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-row gap-2">
              <Button
                aria-busy={saving}
                disabled={saving || !canEdit}
                size="lg"
                variant="default"
                onClick={() => void save()}
              >
                {saving && <Spinner />}
                {t('overview.descriptionSave', { defaultValue: 'Save' })}
              </Button>
              <Button
                disabled={saving}
                size="lg"
                variant="outline"
                onClick={() => {
                  if (pending.current) return;
                  baseline.current = undefined;
                  editor.setDocument(source.current ? 'markdown' : 'text', source.current);
                  setDirty(false);
                }}
              >
                {t('overview.descriptionCancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDescription;
