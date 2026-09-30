'use client';

import { isDesktop } from '@orvilo/const';
import { BrainCircuit } from 'lucide-react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
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
      size="sm"
      variant="outline"
      onClick={() => navigate('/memory/preferences', { escape: true })}
    >
      {createElement(BrainCircuit, {})}
      {t('memory.manageEntry')}
    </Button>
  );
};
