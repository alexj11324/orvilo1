import { Text } from '@lobehub/ui/base-ui';
import type { BriefArtifactDocument, BriefArtifacts } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronRightIcon, FileTextIcon } from 'lucide-react';
import { memo } from 'react';

import { openDocumentModal, preloadDocumentModal } from '@/features/DocumentModal/loader';

const styles = createStaticStyles(({ css, cssVar }) => ({
  iconWrap: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};
  `,
}));

const BriefArtifactCard = memo<{ doc: BriefArtifactDocument }>(({ doc }) => {
  const title = doc.title || 'Untitled';

  return (
    <div
      className="flex items-center gap-3 py-[10px] px-3 cursor-pointer hover:bg-[var(--ant-color-fill-secondary)]"
      style={{ background: cssVar.colorFillTertiary, borderRadius: cssVar.borderRadius }}
      onClick={() => void openDocumentModal(doc.id)}
      onFocus={preloadDocumentModal}
      onPointerEnter={preloadDocumentModal}
    >
      <div className={styles.iconWrap}>
        <FileTextIcon size={20} strokeWidth={1.5} style={{ color: cssVar.colorTextSecondary }} />
      </div>
      <Text ellipsis style={{ flex: 1, minWidth: 0 }} weight={500}>
        {title}
      </Text>
      <ChevronRightIcon size={16} style={{ color: cssVar.colorTextQuaternary, flexShrink: 0 }} />
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
