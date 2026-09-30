import { Skeleton } from '@lobehub/ui/base-ui';
import type { BuiltinPlaceholderProps, SearchQuery } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { SearchIcon } from 'lucide-react';
import { memo } from 'react';

import { useIsMobile } from '@/hooks/useIsMobile';
import { shinyTextStyles } from '@/styles';

const ITEM_HEIGHT = 80;
const ITEM_WIDTH = 160;

const styles = createStaticStyles(({ css, cssVar }) => ({
  query: cx(
    css`
      padding-block: 4px;
      padding-inline: 8px;
      border-radius: 8px;

      font-size: 12px;
      color: ${cssVar.colorTextSecondary};

      &:hover {
        background: ${cssVar.colorFillTertiary};
      }
    `,
    shinyTextStyles.shinyText,
  ),
}));

export const Search = memo<BuiltinPlaceholderProps<SearchQuery>>(({ args }) => {
  const { query } = args || {};

  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-row justify-between"
        style={{
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: isMobile ? 8 : 40,
          height: isMobile ? undefined : 32,
        }}
      >
        <div className={cx('flex flex-row items-center gap-2', styles.query)}>
          <span className="anticon" role="img">
            <SearchIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
          {query ? query : <Skeleton height={20} width={40} />}
        </div>

        <Skeleton height={20} width={40} />
      </div>
      <div className="flex flex-row gap-3">
        {['1', '2', '3', '4', '5'].map((id) => (
          <Skeleton height={ITEM_HEIGHT} key={id} radius={8} width={ITEM_WIDTH} />
        ))}
      </div>
    </div>
  );
});
