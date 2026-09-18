'use client';

import { Icon } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import { BrainCircuit } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

export const ManageMemoryButton = () => {
  const { t } = useTranslation('setting');
  const navigate = useWorkspaceAwareNavigate();

  // Desktop-only, as it was before the browsing layers were retired. It now
  // points straight at the preferences manager — the one layer that survived,
  // and the one a user needs in order to read and delete what was remembered
  // about them.
  if (!isDesktop) return null;

  return (
    <Button
      icon={<Icon icon={BrainCircuit} />}
      size={'small'}
      onClick={() => navigate('/memory/preferences', { escape: true })}
    >
      {t('memory.manageEntry')}
    </Button>
  );
};
