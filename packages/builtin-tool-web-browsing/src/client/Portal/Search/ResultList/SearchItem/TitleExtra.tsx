import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { SimpleTooltip } from '@/components/ui/tooltip';

import { EngineAvatarGroup } from '../../../../components/EngineAvatar';
import CategoryAvatar from './CategoryAvatar';

interface TitleExtraProps {
  category?: string;
  engines: string[];
  highlight?: boolean;
  score?: number;
}

const TitleExtra = memo<TitleExtraProps>(({ category, score, highlight, engines }) => {
  const { t } = useTranslation('tool');

  return (
    <div className="flex flex-row items-center gap-1">
      <EngineAvatarGroup engines={engines} />
      {typeof score === 'number' && (
        <SimpleTooltip title={t(highlight ? 'search.includedTooltip' : 'search.scoreTooltip')}>
          {highlight ? (
            <Badge style={{ marginInlineEnd: 0 }} variant="info">
              {score.toFixed(1)}
            </Badge>
          ) : (
            <div
              className="text-muted-foreground"
              style={{ textAlign: 'center', width: 32, wordBreak: 'keep-all' }}
            >
              {score.toFixed(1)}
            </div>
          )}
        </SimpleTooltip>
      )}
      <CategoryAvatar category={category || 'general'} />
    </div>
  );
});
export default TitleExtra;
