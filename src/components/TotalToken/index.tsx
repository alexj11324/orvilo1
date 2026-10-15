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
  const { t } = useTranslation('spend');
  return typeof totalInputTokens === 'number' && typeof totalOutputTokens === 'number' ? (
    <div className="flex items-center gap-0.5 text-sm leading-5.5 text-foreground-description">
      <Badge
        className="h-auto min-h-6 py-0 text-sm leading-5.5"
        size="sm"
        variant={getVariant(totalTokens)}
      >
        {formatNumber(totalTokens)}
      </Badge>
      =
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge className="h-auto min-h-6 py-0 text-sm leading-5.5" size="sm" variant="secondary">
            {createElement(ArrowDownToDot, { size: 16 })}
            {formatNumber(totalInputTokens)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t('table.totalToken.input')}</TooltipContent>
      </Tooltip>
      +
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Badge className="h-auto min-h-6 py-0 text-sm leading-5.5" size="sm" variant="secondary">
            {createElement(ArrowUpFromDot, { size: 16 })}
            {formatNumber(totalOutputTokens)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t('table.totalToken.output')}</TooltipContent>
      </Tooltip>
    </div>
  ) : (
    <Badge
      className="h-auto min-h-6 py-0 text-sm leading-5.5"
      size="sm"
      variant={getVariant(totalTokens)}
    >
      {formatNumber(totalTokens)}
    </Badge>
  );
});

export default TotalToken;
