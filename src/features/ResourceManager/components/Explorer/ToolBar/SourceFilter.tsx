'use client';

import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import {
  canFilterResourceSource,
  getResourceSourceFilter,
} from '@/features/ResourceManager/store/selectors';
import { ResourceSourceFilter } from '@/types/files';

const styles = {
  option:
    'flex-none h-6 px-2.5 rounded-[999px] text-xs text-[var(--ant-color-text-description)] hover:text-[var(--ant-color-text-description)]',
  optionActive: 'text-foreground hover:text-foreground bg-selected hover:bg-selected',
};

const OPTIONS: Array<{ key: ResourceSourceFilter; labelKey: string }> = [
  { key: ResourceSourceFilter.All, labelKey: 'FileManager.source.all' },
  { key: ResourceSourceFilter.Generated, labelKey: 'FileManager.source.generated' },
  { key: ResourceSourceFilter.Uploaded, labelKey: 'FileManager.source.uploaded' },
  { key: ResourceSourceFilter.Acceptance, labelKey: 'FileManager.source.acceptance' },
];

/**
 * Origin chips for the explorer list: All / AI generated / Uploaded /
 * Acceptance. Sits on the item-count row so the count and the pool it counts
 * read as one statement.
 *
 * Renders nothing where origin is meaningless (inside a library, on Pages or
 * Home) — see `canFilterResourceSource`.
 */
const SourceFilter = memo(() => {
  const { t } = useTranslation('components');
  const [canFilter, activeFilter, setSourceFilter] = useResourceManagerStore((s) => [
    canFilterResourceSource(s),
    getResourceSourceFilter(s),
    s.setSourceFilter,
  ]);

  if (!canFilter) return null;

  return (
    <div className="flex flex-row items-center gap-0.5">
      {OPTIONS.map((option) => {
        const isActive = activeFilter === option.key;

        return (
          <Button
            aria-pressed={isActive}
            className={cn(styles.option, isActive && styles.optionActive)}
            key={option.key}
            size="sm"
            variant="ghost"
            onClick={() => setSourceFilter(option.key)}
          >
            {t(option.labelKey as never)}
          </Button>
        );
      })}
    </div>
  );
});

SourceFilter.displayName = 'SourceFilter';

export default SourceFilter;
