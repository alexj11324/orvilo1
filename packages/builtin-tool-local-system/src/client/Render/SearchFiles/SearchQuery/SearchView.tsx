import { createStaticStyles, cx } from 'antd-style';
import { SearchIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { shinyTextStyles } from '@/styles';

const styles = createStaticStyles(({ css, cssVar }) => ({
  font: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  query: css`
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

interface SearchBarProps {
  defaultQuery: string;
  resultsNumber: number;
  searching?: boolean;
}

const SearchBar = memo<SearchBarProps>(({ defaultQuery, resultsNumber, searching }) => {
  const { t } = useTranslation('tool');
  return (
    <div className="flex flex-row items-center justify-between gap-10 h-[26px]">
      <div className={cx('flex flex-row items-center gap-2', styles.query)}>
        <span className="anticon" role="img">
          <SearchIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
        </span>
        <span className={cx(searching && shinyTextStyles.shinyText)}>{defaultQuery}</span>
      </div>

      <div className={cx('flex flex-row items-center', styles.font)}>
        <div>{t('search.searchResult')}</div>
        {resultsNumber}
      </div>
    </div>
  );
});
export default SearchBar;
