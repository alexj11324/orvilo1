import { memo } from 'react';

import FileIcon from '@/components/FileIcon';
import RepoIcon from '@/components/LibIcon';
import LockedLibIcon from '@/components/LibIcon/Locked';
import { KnowledgeType } from '@/types/knowledgeBase';

interface KnowledgeIconProps {
  fileType?: string;
  /** KB only: render the shared restricted-library visual (folder + corner lock). */
  locked?: boolean;
  name: string;
  size?: number | { file?: number; repo?: number };
  type: KnowledgeType;
}

const KnowledgeIcon = memo<KnowledgeIconProps>(({ type, size, fileType, locked, name }) => {
  const repoSize = (typeof size === 'object' ? size.repo : size) || 24;
  const fileSize = (typeof size === 'object' ? size.file : size) || 24;

  return type === KnowledgeType.KnowledgeBase ? (
    <div
      className={'flex flex-col items-center justify-center'}
      style={{ height: repoSize, width: repoSize }}
    >
      {locked ? <LockedLibIcon size={repoSize / 1.2} /> : <RepoIcon size={repoSize / 1.2} />}
    </div>
  ) : (
    <FileIcon fileName={name} fileType={fileType!} size={fileSize} />
  );
});

export default KnowledgeIcon;
