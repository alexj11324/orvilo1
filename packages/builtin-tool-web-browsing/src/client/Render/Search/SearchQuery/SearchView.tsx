import { createStaticStyles, cx } from 'antd-style';
import { SearchIcon } from 'lucide-react';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/useIsMobile';
import { shinyTextStyles } from '@/styles';

import { EngineAvatarGroup } from '../../../components/EngineAvatar';

const styles = createStaticStyles(({ css, cssVar }) => ({
  query: css`
    padding-block: 4px;
    padding-inline: 8px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

interface SearchBarProps {
  defaultEngines: string[];
  defaultQuery: string;
  onEditingChange: (editing: boolean) => void;
  resultsNumber: number;
  searching?: boolean;
}

const SearchBar = memo<SearchBarProps>(
  ({ defaultEngines, defaultQuery, resultsNumber, onEditingChange, searching }) => {
    const isMobile = useIsMobile();
    return (
      <div
        className="flex flex-row justify-between"
        style={{
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: isMobile ? 8 : 40,
          height: isMobile ? undefined : 32,
        }}
      >
        <div
          className={cx(styles.query, 'flex flex-row items-center gap-2 cursor-pointer')}
          onClick={() => {
            onEditingChange(true);
          }}
        >
          <span className="anticon" role="img">
            <SearchIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
          <span className={cx(searching && shinyTextStyles.shinyText)}>{defaultQuery}</span>
        </div>

        {searching ? (
          <Skeleton style={{ height: 20, width: 40 }} />
        ) : (
          <div className="flex flex-row items-center gap-1">
            <EngineAvatarGroup engines={defaultEngines} />
            {!isMobile && (
              <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                {resultsNumber}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
export default SearchBar;
