import type { BriefArtifactDocument, BriefArtifacts } from '@orvilo/types';
import { cn } from 'cn';
import { ChevronRightIcon, FileTextIcon } from 'lucide-react';
import { memo } from 'react';

import { openDocumentModal, preloadDocumentModal } from '@/features/DocumentModal/loader';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  iconWrap: 'flex shrink-0 items-center justify-center size-9 rounded-(--radius-card) bg-card',
};

const BriefArtifactCard = memo<{ doc: BriefArtifactDocument }>(({ doc }) => {
  const title = doc.title || 'Untitled';

  return (
    <div
      {...clickableProps()}
      className={cn(
        'flex items-center gap-3 py-2.5 px-3 rounded-(--radius-card) bg-muted cursor-pointer hover:bg-accent',
        CLICKABLE_FOCUS_RING,
      )}
      onClick={() => void openDocumentModal(doc.id)}
      onFocus={preloadDocumentModal}
      onPointerEnter={preloadDocumentModal}
    >
      <div className={styles.iconWrap}>
        <FileTextIcon className="text-muted-foreground" size={16} strokeWidth={1.5} />
      </div>
      <div className="truncate block flex-1 min-w-0 text-sm leading-5.5 font-medium">{title}</div>
      <ChevronRightIcon className="shrink-0 text-muted-foreground" size={16} />
    </div>
  );
});

interface BriefCardArtifactsProps {
  artifacts?: BriefArtifacts | null;
}

const BriefCardArtifacts = memo<BriefCardArtifactsProps>(({ artifacts }) => {
  const docs = artifacts?.documents;
  if (!docs?.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {docs.map((doc) => (
        <BriefArtifactCard doc={doc} key={doc.id} />
      ))}
    </div>
  );
});

export default BriefCardArtifacts;
