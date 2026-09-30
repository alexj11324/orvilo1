import { useTheme } from 'antd-style';
import { ArrowDownToDot, ArrowUpFromDot } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// 使用Intl.NumberFormat来添加千分号
const formatNumber = (num: any) => {
  return new Intl.NumberFormat('en-US').format(num);
};

const getVariant = (token: number) => {
  if (token > 100_000) return 'destructive';

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
      <Badge size="sm" variant={getVariant(totalTokens)}>
        {formatNumber(totalTokens)}
      </Badge>
      =
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge size="sm" variant="secondary">
            {createElement(ArrowDownToDot, { size: 16 })}
            {formatNumber(totalInputTokens)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t('table.totalToken.input')}</TooltipContent>
      </Tooltip>
      +
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge size="sm" variant="secondary">
            {createElement(ArrowUpFromDot, { size: 16 })}
            {formatNumber(totalOutputTokens)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t('table.totalToken.output')}</TooltipContent>
      </Tooltip>
    </div>
  ) : (
    <Badge
      size="sm"
      style={{ color: theme.colorTextDescription, fontSize: 14 }}
      variant={getVariant(totalTokens)}
    >
      {formatNumber(totalTokens)}
    </Badge>
  );
});

export default TotalToken;
