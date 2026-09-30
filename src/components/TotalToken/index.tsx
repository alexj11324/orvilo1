import { Tag } from '@lobehub/ui/base-ui';
import { useTheme } from 'antd-style';
import { ArrowDownToDot, ArrowUpFromDot } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// 使用Intl.NumberFormat来添加千分号
const formatNumber = (num: any) => {
  return new Intl.NumberFormat('en-US').format(num);
};

const getColor = (token: number) => {
  if (token > 100_000) return 'error';

  if (token > 50_000) return 'warning';

  return 'success';
};

interface TotalTokenProps {
  totalInputTokens?: number | null;
  totalOutputTokens?: number | null;
  totalTokens: number;
}

/** `12,345 = 10,000 + 2,345` — the total, then how it splits input vs output. */
const TotalToken = memo<TotalTokenProps>(({ totalTokens, totalInputTokens, totalOutputTokens }) => {
  const theme = useTheme();
  const { t } = useTranslation('spend');
  return typeof totalInputTokens === 'number' && typeof totalOutputTokens === 'number' ? (
    <div className={'flex items-center'} style={{ gap: 2, color: theme.colorTextDescription }}>
      <Tag color={getColor(totalTokens)} size={'small'} variant={'filled'}>
        {formatNumber(totalTokens)}
      </Tag>
      =
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Tag icon={createElement(ArrowDownToDot, { size: 16 })} size={'small'} variant={'filled'}>
            {formatNumber(totalInputTokens)}
          </Tag>
        </TooltipTrigger>
        <TooltipContent>{t('table.totalToken.input')}</TooltipContent>
      </Tooltip>
      +
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Tag icon={createElement(ArrowUpFromDot, { size: 16 })} size={'small'} variant={'filled'}>
            {formatNumber(totalOutputTokens)}
          </Tag>
        </TooltipTrigger>
        <TooltipContent>{t('table.totalToken.output')}</TooltipContent>
      </Tooltip>
    </div>
  ) : (
    <Tag
      color={getColor(totalTokens)}
      size={'small'}
      style={{ color: theme.colorTextDescription, fontSize: 14 }}
      variant={'filled'}
    >
      {formatNumber(totalTokens)}
    </Tag>
  );
});

export default TotalToken;
