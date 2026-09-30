'use client';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { ProjectIcon } from './ProjectIcon';

const ProjectDisabled = () => {
  const { t } = useTranslation('project');
  const navigate = useWorkspaceAwareNavigate();

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ height: '100%', width: '100%' }}
    >
      <div className="flex flex-col" style={{ alignItems: 'center', gap: 12 }}>
        <ProjectIcon size={40} />
        <span className="text-sm" style={{ fontSize: 18, fontWeight: 600 }}>
          {t('disabled.title')}
        </span>
        <Button variant="outline" onClick={() => navigate('/settings/labs')}>
          {t('disabled.action')}
        </Button>
      </div>
    </div>
  );
};

export default ProjectDisabled;
