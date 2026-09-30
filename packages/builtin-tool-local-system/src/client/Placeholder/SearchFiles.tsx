import type { LocalSearchFilesParams } from '@orvilo/electron-client-ipc';
import type { BuiltinPlaceholderProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { SearchIcon } from 'lucide-react';
import React, { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const styles = createStaticStyles(({ css, cssVar }) => ({
  query: css`
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

const SearchFiles = memo<BuiltinPlaceholderProps<LocalSearchFilesParams>>(({ args = {} }) => {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-center justify-between gap-10 h-[26px]">
        <div className={cx('flex flex-row items-center gap-2', styles.query)}>
          <span className="anticon" role="img">
            <SearchIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
          {args.keywords || <Skeleton style={{ height: 20, width: 40 }} />}
        </div>

        <Skeleton style={{ height: 20, width: 40 }} />
      </div>
      <div className="flex flex-col items-center justify-center h-[140px]">
        <div className="flex flex-col gap-1 w-[90%]">
          <Skeleton style={{ height: 16 }} />
          <Skeleton style={{ height: 16 }} />
          <Skeleton style={{ height: 16 }} />
          <Skeleton style={{ height: 16 }} />
        </div>
      </div>
    </div>
  );
});

export default SearchFiles;
