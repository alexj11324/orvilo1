'use client';

import { SortableList } from '@lobehub/ui';
import { Select, type SelectOption } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { PlusIcon, XIcon } from 'lucide-react';
import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
      <SortableList
        gap={6}
        items={fallbacks.map((value) => ({ id: value }))}
        renderItem={(item) => (
          <SortableList.Item
            horizontal
            align={'center'}
            className={styles.item}
            gap={4}
            id={item.id}
            justify={'space-between'}
            variant={'filled'}
          >
            <span className={'truncate'} style={{ flex: 1, fontFamily: item.id }}>
              {labelOf(item.id)}
            </span>
            <Button
              aria-label={t('settingAppearance.font.fallback.remove')}
              size="icon-sm"
              title={t('settingAppearance.font.fallback.remove')}
              variant="ghost"
              onClick={() => remove(item.id)}
            >
              {createElement(XIcon)}
            </Button>
            <SortableList.DragHandle />
          </SortableList.Item>
        )}
        onChange={(next) => reorder(next.map((item) => item.id))}
      />
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
