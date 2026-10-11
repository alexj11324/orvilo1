import { FilePlusIcon, FolderPlusIcon, PlusIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { type DropdownItem, DropdownMenu } from '@/components/ItemsMenu';

interface Props {
  onCreateDocument: () => void;
  onCreateFolder: () => void;
}

const DocumentExplorerToolbar = memo<Props>(({ onCreateDocument, onCreateFolder }) => {
  const { t } = useTranslation('chat');
  const createMenuItems = useMemo<DropdownItem[]>(
    () => [
      {
        icon: <FilePlusIcon />,
        key: 'new-document',
        label: t('workingPanel.resources.tree.newDocument'),
        onClick: onCreateDocument,
      },
      {
        icon: <FolderPlusIcon />,
        key: 'new-folder',
        label: t('workingPanel.resources.tree.newFolder'),
        onClick: onCreateFolder,
      },
    ],
    [onCreateDocument, onCreateFolder, t],
  );

  return (
    <div className="flex items-center justify-between pbs-2 pbe-1 ps-3 pe-2 text-muted-foreground">
      <div className="text-xs leading-5 font-medium">
        {t('workingPanel.resources.filter.documents')}
      </div>
      <DropdownMenu items={createMenuItems} placement={'bottomRight'}>
        <ActionIcon
          icon={PlusIcon}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 14 }}
          title={t('workingPanel.resources.tree.create')}
        />
      </DropdownMenu>
    </div>
  );
});

DocumentExplorerToolbar.displayName = 'DocumentExplorerToolbar';

export default DocumentExplorerToolbar;
