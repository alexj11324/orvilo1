'use client';
import { createModal, ModalFooter, toast, useModalContext } from '@lobehub/ui/base-ui';
import { t as translate } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { ProjectListItem } from '@/store/project';
import { useProjectStore } from '@/store/project';

interface RenameProjectContentProps {
  project: ProjectListItem;
}

const RenameProjectContent = ({ project }: RenameProjectContentProps) => {
  const { t } = useTranslation(['project', 'common']);
  const { close } = useModalContext();
  const updateProject = useProjectStore((s) => s.updateProject);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(project.name);
  const normalizedName = name.trim();

  const handleRename = async () => {
    if (!normalizedName || normalizedName === project.name || loading) return;
    setLoading(true);
    try {
      await updateProject(project.id, { name: normalizedName });
      close();
      toast.success(t('rename.success'));
    } catch (error) {
      console.error('Failed to rename project', error);
      toast.error(t('rename.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col" style={{ gap: 6, padding: 16 }}>
        <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
          {t('rename.nameLabel')}
        </span>
        <Input
          autoFocus
          maxLength={255}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) void handleRename();
          }}
        />
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button
          aria-busy={loading}
          disabled={!normalizedName || normalizedName === project.name || loading}
          variant="default"
          onClick={handleRename}
        >
          {loading && <Spinner />}
          {t('rename.action')}
        </Button>
      </ModalFooter>
    </>
  );
};

export const openRenameProjectModal = (project: ProjectListItem) =>
  createModal({
    content: <RenameProjectContent project={project} />,
    footer: null,
    styles: { content: { padding: 0 } },
    title: translate('rename.title', { ns: 'project' }),
    width: 420,
  });
