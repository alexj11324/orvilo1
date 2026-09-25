'use client';

import { ReactLinkPlugin, ReactListPlugin } from '@lobehub/editor';
import { Editor, useEditor } from '@lobehub/editor/react';
import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BODY_TEXT_COLOR, SECTION_LABEL_PROPS } from '@/features/Projects/sectionLabel';
import { projectService } from '@/services/project';

const styles = createStaticStyles(({ css }) => ({
  editor: css`
    [contenteditable] {
      min-height: 32px;

      font-size: 15px !important;
      font-weight: 450;
      line-height: 24px;
      color: ${BODY_TEXT_COLOR};

      /* Headings keep full ink — the step between them and the prose is the
         description's hierarchy. */
      :is(h1, h2, h3, h4) {
        color: ${cssVar.colorText};
      }
    }
  `,
  header: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    gap: 4px;
    align-items: center;
    align-self: flex-start;

    padding: 0;
    border: 0;

    color: inherit;

    background: transparent;
  `,
}));

interface ProjectDescriptionProps {
  description?: string | null;
  onSaved?: () => void;
  projectId: string;
}

const plugins = [ReactLinkPlugin, ReactListPlugin];

// Keep the document mounted when collapsed so disclosure never discards a draft.
const ProjectDescription = ({ description, onSaved, projectId }: ProjectDescriptionProps) => {
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
    if (pending.current) return;
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
    <Flexbox gap={4}>
      <button
        aria-controls={bodyId}
        aria-expanded={open}
        className={styles.header}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon icon={open ? ChevronDownIcon : ChevronRightIcon} size={14} />
        <Text {...SECTION_LABEL_PROPS}>{t('overview.descriptionLabel')}</Text>
      </button>
      <div hidden={!open} id={bodyId}>
        <Editor
          className={styles.editor}
          content={description || ''}
          debounceWait={0}
          editable={!saving}
          editor={editor}
          placeholder={t('overview.descriptionEmpty')}
          plugins={plugins}
          style={{ padding: '4px 0' }}
          type={description ? 'markdown' : 'text'}
          onChange={(current) => {
            if (baseline.current !== undefined && !pending.current)
              setDirty(String(current.getDocument('markdown') ?? '') !== baseline.current);
          }}
          onFocus={() => {
            baseline.current ??= String(editor.getDocument('markdown') ?? '');
          }}
        />
        {dirty && (
          <Flexbox gap={8}>
            <Flexbox horizontal gap={8}>
              <Button loading={saving} size={'small'} type={'primary'} onClick={() => void save()}>
                {t('overview.descriptionSave', { defaultValue: 'Save' })}
              </Button>
              <Button
                disabled={saving}
                size={'small'}
                onClick={() => {
                  if (pending.current) return;
                  baseline.current = undefined;
                  editor.setDocument(source.current ? 'markdown' : 'text', source.current);
                  setDirty(false);
                }}
              >
                {t('overview.descriptionCancel', { defaultValue: 'Cancel' })}
              </Button>
            </Flexbox>
          </Flexbox>
        )}
      </div>
    </Flexbox>
  );
};

export default ProjectDescription;
