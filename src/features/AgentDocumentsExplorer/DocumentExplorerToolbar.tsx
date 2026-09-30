import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { FilePlusIcon, FolderPlusIcon, PlusIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { type DropdownItem, DropdownMenu } from '@/components/ItemsMenu';

const styles = createStaticStyles(({ css, cssVar }) => ({
  toolbar: css`
    /* padding-inline start matches a tree row's content edge:
       --trees-padding-inline (4) - --trees-item-margin-x (4), clamped at 0,
       plus the row's own margin (4) and padding (8). */
    padding-block: 8px 4px;
    padding-inline: 12px 8px;
    color: ${cssVar.colorTextSecondary};
  `,
  title: css`
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  `,
}));

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
    <div className={`flex items-center justify-between ${styles.toolbar}`}>
      <div className={cn('text-muted-foreground', styles.title)}>
        {t('workingPanel.resources.filter.documents')}
      </div>
      <DropdownMenu items={createMenuItems} placement={'bottomRight'}>
        <ActionIcon
          icon={PlusIcon}
          size={'small'}
          title={t('workingPanel.resources.tree.create')}
        />
      </DropdownMenu>
    </div>
  );
});

DocumentExplorerToolbar.displayName = 'DocumentExplorerToolbar';

export default DocumentExplorerToolbar;
