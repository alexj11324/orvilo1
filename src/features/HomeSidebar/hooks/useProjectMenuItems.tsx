import { BoxIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { type ItemType } from '@/components/Menu';
import { useCreateNewModal } from '@/features/LibraryModal/CreateNew';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

/**
 * Hook for generating menu items/buttons for knowledge base actions
 * Used in Body/Project/Actions.tsx
 */
export const useProjectMenuItems = () => {
  const { t } = useTranslation('knowledgeBase');
  const navigate = useWorkspaceAwareNavigate();
  const { open } = useCreateNewModal();

  /**
   * Create knowledge base action
   */
  const createProject = useCallback(() => {
    open({
      onSuccess: (id) => {
        navigate(`/knowledge/bases/${id}`);
      },
    });
  }, [open, navigate]);

  const createProjectMenuItem = useCallback(
    (): ItemType => ({
      icon: <BoxIcon size={14} />,
      key: 'createProject',
      label: t('createNew.title'),
      onClick: (info) => {
        info.domEvent?.stopPropagation();
        createProject();
      },
    }),
    [t, createProject],
  );

  return {
    createProject,
    createProjectMenuItem,
  };
};
