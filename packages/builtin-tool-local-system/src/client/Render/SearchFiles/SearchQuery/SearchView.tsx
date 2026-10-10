import { cn } from 'cn';
import { SearchIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { shinyTextStyles } from '@/styles';

const styles = {
  font: 'text-[12px] text-[var(--ant-color-text-tertiary)]',
  query: 'rounded-[8px] px-2 py-1 text-[12px] text-muted-foreground',
};

interface SearchBarProps {
  defaultQuery: string;
  resultsNumber: number;
  searching?: boolean;
}

const SearchBar = memo<SearchBarProps>(({ defaultQuery, resultsNumber, searching }) => {
  const { t } = useTranslation('tool');
  return (
    <div className="flex flex-row items-center justify-between gap-10 h-[26px]">
      <div className={cn('flex flex-row items-center gap-2', styles.query)}>
        <span className="anticon" role="img">
          <SearchIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
        </span>
        <span className={cn(searching && shinyTextStyles.shinyText)}>{defaultQuery}</span>
      </div>

      <div className={cn('flex flex-row items-center', styles.font)}>
        <div>{t('search.searchResult')}</div>
        {resultsNumber}
      </div>
    </div>
  );
});
export default SearchBar;
