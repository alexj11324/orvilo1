'use client';

import { createStaticStyles } from 'antd-style';
import { PlusIcon, XIcon } from 'lucide-react';
import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import type { SelectOption } from '@/components/SelectOptions';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';

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
          {fallbacks.map((fallbackFont) => (
            <SortableItem
              className={styles.item}
              key={fallbackFont}
              style={{ alignItems: 'center', gap: 4, justifyContent: 'space-between' }}
              value={fallbackFont}
            >
              <span className={'truncate'} style={{ flex: 1, fontFamily: fallbackFont }}>
                {labelOf(fallbackFont)}
              </span>
              <Button
                aria-label={t('settingAppearance.font.fallback.remove')}
                size="icon-sm"
                title={t('settingAppearance.font.fallback.remove')}
                variant="ghost"
                onClick={() => remove(fallbackFont)}
              >
                {createElement(XIcon)}
              </Button>
              <SortableItemHandle />
            </SortableItem>
          ))}
        </div>
      </Sortable>
      {adding ? (
        <Combobox
          defaultOpen
          items={candidates.map((option) => option.value)}
          itemToStringLabel={(value) => {
            const label = labelOf(String(value));
            return typeof label === 'string' ? label : String(value);
          }}
          onOpenChange={(open) => {
            if (!open) setAdding(false);
          }}
          onValueChange={(value) => {
            if (typeof value === 'string') add(value);
          }}
        >
          <ComboboxInput
            autoFocus
            aria-label={ariaLabel}
            placeholder={t('settingAppearance.font.fallback.placeholder')}
            showTrigger={false}
          />
          <ComboboxContent>
            {loading && (
              <ComboboxEmpty>
                <Spinner className="size-4" />
              </ComboboxEmpty>
            )}
            <ComboboxList>
              {(value: string) => (
                <ComboboxItem key={value} value={value}>
                  {labelOf(value)}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
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
