'use client';

import { Flexbox, Icon, TextArea } from '@lobehub/ui';
import { Button, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { projectService } from '@/services/project';

const styles = createStaticStyles(({ css }) => ({
  body: css`
    cursor: text;
    padding-block: 4px;
    border-radius: 6px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  header: css`
    cursor: pointer;
    user-select: none;
  `,
}));

interface ProjectDescriptionProps {
  description?: string | null;
  onSaved?: () => void;
  projectId: string;
}

/**
 * Linear's overview keeps the project description as a collapsible document
 * under the updates feed, editable in place. Ours mirrors that: a
 * "Description" disclosure whose body opens an inline editor on click and
 * saves through `project.update`.
 */
const ProjectDescription = memo<ProjectDescriptionProps>(({ description, onSaved, projectId }) => {
  const { t } = useTranslation('project');
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await projectService.update(projectId, { description: draft });
      setEditing(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flexbox gap={4}>
      <Flexbox
        horizontal
        align={'center'}
        className={styles.header}
        gap={4}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon icon={open ? ChevronDownIcon : ChevronRightIcon} size={14} />
        <Text fontSize={13} weight={500}>
          {t('overview.descriptionLabel')}
        </Text>
      </Flexbox>
      {open &&
        (editing ? (
          <Flexbox gap={8}>
            <TextArea
              autoFocus
              autoSize={{ minRows: 3 }}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Flexbox horizontal gap={8}>
              <Button loading={saving} size={'small'} type={'primary'} onClick={() => void save()}>
                {t('overview.descriptionSave', { defaultValue: 'Save' })}
              </Button>
              <Button
                disabled={saving}
                size={'small'}
                onClick={() => {
                  setDraft(description ?? '');
                  setEditing(false);
                }}
              >
                {t('overview.descriptionCancel', { defaultValue: 'Cancel' })}
              </Button>
            </Flexbox>
          </Flexbox>
        ) : (
          <div
            className={styles.body}
            onClick={() => {
              setDraft(description ?? '');
              setEditing(true);
            }}
          >
            {description ? (
              <Text
                fontSize={15}
                style={{ color: 'lch(19.588 1.25 282)', whiteSpace: 'pre-wrap' }}
                weight={450}
              >
                {description}
              </Text>
            ) : (
              <Text fontSize={14} type={'secondary'}>
                {t('overview.descriptionEmpty', { defaultValue: 'Add a description…' })}
              </Text>
            )}
          </div>
        ))}
    </Flexbox>
  );
});

ProjectDescription.displayName = 'ProjectDescription';

export default ProjectDescription;
