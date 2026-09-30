import { createStaticStyles, cx } from 'antd-style';
import type { CSSProperties } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';

import { WebBrowsingManifest } from '../../../../manifest';
import { EngineAvatarGroup } from '../../../components/EngineAvatar';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    cursor: pointer;
    padding: 8px;
    font-size: 12px;
    color: initial;
  `,
}));

interface ShowMoreProps {
  engines: string[];
  messageId: string;
  resultsNumber: number;
  style?: CSSProperties;
}
const ShowMore = memo<ShowMoreProps>(({ style, messageId, engines, resultsNumber }) => {
  const [openToolUI] = useChatStore((s) => [s.openToolUI]);

  const { t } = useTranslation('tool');

  return (
    <div
      style={style}
      className={cx(
        styles.container,
        'flex flex-col gap-0.5 justify-between rounded-md border bg-card cursor-pointer',
      )}
      onClick={() => {
        openToolUI(messageId, WebBrowsingManifest.identifier);
      }}
    >
      <div className="line-clamp-2">{t('search.viewMoreResults', { results: resultsNumber })}</div>
      <div className="flex flex-row items-center gap-1">
        <EngineAvatarGroup engines={engines} />
      </div>
    </div>
  );
});

export default ShowMore;
