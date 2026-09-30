'use client';

import { Select, type SelectOption } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { PlusIcon, XIcon } from 'lucide-react';
import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';

import { MAX_FALLBACK_FONTS } from './fontStack';
import { useFontFallbackStack } from './useFontFallbackStack';

const width = { width: 320 };
const styles = createStaticStyles(({ css, cssVar }) => ({
  item: css`
    padding-inline: ${cssVar.paddingSM} ${cssVar.paddingXXS};
  `,
}));

interface FallbackFontListProps {
  ariaLabel: string;
  loading?: boolean;
  needPrimaryHint: string;
  onChange: (stack: string[]) => void;
  options: SelectOption[];
  stack: string[];
}

const FallbackFontList = ({
  ariaLabel,
  loading,
  needPrimaryHint,
  onChange,
  options,
  stack,
}: FallbackFontListProps) => {
  const { t } = useTranslation('setting');
  const [adding, setAdding] = useState(false);
  const { add, atLimit, candidates, fallbacks, labelOf, primary, remove, reorder } =
    useFontFallbackStack({ onChange, options, stack });

  if (!primary) return <span className={'text-muted-foreground'}>{needPrimaryHint}</span>;

  return (
    <div className={'flex min-w-0'} style={{ flexDirection: 'column', gap: 6, ...width }}>
      <Sortable
        getItemValue={(item: { id: string }) => item.id}
        value={fallbacks.map((value) => ({ id: value }))}
        onValueChange={(next) => reorder(next.map((item) => item.id))}
      >
        <div className={'flex flex-col'} style={{ gap: 6 }}>
          {fallbacks.map((value) => (
            <SortableItem
              className={styles.item}
              key={value}
              style={{ alignItems: 'center', gap: 4, justifyContent: 'space-between' }}
              value={value}
            >
              <span className={'truncate'} style={{ flex: 1, fontFamily: value }}>
                {labelOf(value)}
              </span>
              <Button
                aria-label={t('settingAppearance.font.fallback.remove')}
                size="icon-sm"
                title={t('settingAppearance.font.fallback.remove')}
                variant="ghost"
                onClick={() => remove(value)}
              >
                {createElement(XIcon)}
              </Button>
              <SortableItemHandle />
            </SortableItem>
          ))}
        </div>
      </Sortable>
      {adding ? (
        <Select
          autoFocus
          defaultOpen
          showSearch
          aria-label={ariaLabel}
          loading={loading}
          options={candidates}
          placeholder={t('settingAppearance.font.fallback.placeholder')}
          onChange={(value: string) => add(value)}
          onOpenChange={(open) => {
            if (!open) setAdding(false);
          }}
        />
      ) : (
        <Button
          className="w-full"
          disabled={atLimit}
          variant="outline"
          onClick={() => setAdding(true)}
        >
          {createElement(PlusIcon)}
          {atLimit
            ? t('settingAppearance.font.fallback.limit', { count: MAX_FALLBACK_FONTS })
            : t('settingAppearance.font.fallback.add')}
        </Button>
      )}
    </div>
  );
};

export default FallbackFontList;
