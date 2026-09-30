'use client';

import { cssVar } from 'antd-style';
import { RefreshCw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';

import Item from './Item';
import { type SuggestMode } from './useRandomQuestions';
import { useRandomQuestions } from './useRandomQuestions';

interface ListProps {
  count?: number;
  disabled?: boolean;
  mode: SuggestMode;
}

const List = memo<ListProps>(({ mode, count = 3, disabled }) => {
  const { t } = useTranslation('suggestQuestions');
  const { t: tCommon } = useTranslation('common');
  const { questions, refresh } = useRandomQuestions(mode, count);

  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {questions.map((item) => {
          const prompt = t(item.promptKey as any);
          return (
            <Item
              description={prompt}
              disabled={disabled}
              key={item.id}
              prompt={prompt}
              title={t(item.titleKey as any)}
            />
          );
        })}
      </div>
      <div
        className="flex items-center gap-1"
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.65 : undefined,
        }}
        onClick={() => {
          if (disabled) return;

          refresh();
        }}
      >
        <ActionIcon disabled={disabled} icon={RefreshCw} size={'small'} />
        <div className="text-[12px]" style={{ color: cssVar.colorTextSecondary }}>
          {tCommon('switch')}
        </div>
      </div>
    </div>
  );
});

export default List;
