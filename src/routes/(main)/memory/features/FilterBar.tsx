import { ArrowDownNarrowWide, Search } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { selectItems, SelectOptionItems } from '@/components/SelectOptions';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';

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
            items={selectItems(sortOptions)}
            value={sortValue}
            onValueChange={(value) => onSortChange(value)}
          >
            <SelectTrigger style={{ minWidth: 150 }}>
              <ArrowDownNarrowWide style={{ marginRight: 4 }} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptionItems options={sortOptions} />
            </SelectContent>
          </Select>
        )}
      </div>
    );
  },
);

export default FilterBar;
