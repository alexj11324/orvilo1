import { Select } from '@lobehub/ui/base-ui';
import { ArrowDownNarrowWide, Search } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';

interface SortOption {
  label: string;
  value: string;
}

interface FilterBarProps {
  onSearch: (value: string) => void;
  onSortChange?: (sort: string) => void;
  searchValue: string;
  sortOptions?: SortOption[];
  sortValue?: string;
}

const FilterBar = memo<FilterBarProps>(
  ({ searchValue, onSearch, sortValue, onSortChange, sortOptions }) => {
    const { t } = useTranslation('memory');

    return (
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2 -translate-y-1/2 opacity-60" size={16} />
          <Input
            className="pl-7"
            defaultValue={searchValue}
            placeholder={t('filter.search')}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                onSearch(v);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch(e.currentTarget.value);
            }}
          />
        </div>
        {sortOptions && sortOptions.length > 0 && onSortChange && (
          <Select
            options={sortOptions}
            prefix={<ArrowDownNarrowWide style={{ marginRight: 4 }} />}
            style={{ minWidth: 150 }}
            value={sortValue}
            onChange={(value) => onSortChange(value as string)}
          />
        )}
      </div>
    );
  },
);

export default FilterBar;
