import { Tag, Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
            <Tag color={'blue'} style={{ marginInlineEnd: 0 }} variant={'filled'}>
              {score.toFixed(1)}
            </Tag>
          ) : (
            <Text
              style={{ textAlign: 'center', width: 32, wordBreak: 'keep-all' }}
              type={'secondary'}
            >
              {score.toFixed(1)}
            </Text>
          )}
        </SimpleTooltip>
      )}
      <CategoryAvatar category={category || 'general'} />
    </div>
  );
});
export default TitleExtra;
