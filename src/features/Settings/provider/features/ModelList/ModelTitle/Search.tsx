import { useDebounce } from 'ahooks';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SearchBar from '@/components/SearchBar';

interface SearchProps {
  className?: string;
  onChange: (value: string) => void;
  value: string;
}

const Search = memo<SearchProps>(({ className, value, onChange }) => {
  const { t } = useTranslation('modelProvider');
  const [localValue, setLocalValue] = useState(value);
  const debouncedValue = useDebounce(localValue, { wait: 200 });
  const skipDebouncedEmitRef = useRef(false);

  useEffect(() => {
    skipDebouncedEmitRef.current = true;
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (skipDebouncedEmitRef.current) {
      skipDebouncedEmitRef.current = false;

      return;
    }

    if (!localValue) {
      if (value) onChange('');

      return;
    }

    if (debouncedValue === value) return;

    onChange(debouncedValue);
  }, [debouncedValue, localValue, onChange, value]);

  return (
    <SearchBar
      className={className}
      placeholder={t('providerModels.list.search')}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
    />
  );
});
export default Search;
