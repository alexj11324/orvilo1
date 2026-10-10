import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  calculateScore,
  calculateScoreFlags,
  createScoreItems,
  sortItemsByPriority,
} from '@/features/MCP/calculateScore';
import { useScoreList } from '@/features/MCP/useScoreList';

import { useDetailContext } from '../DetailProvider';
import Title from '../Title';
import GithubBadge from './GithubBadge';
import ScoreList from './ScoreList';
import TotalScore from './TotalScore';

const Score = memo(() => {
  const { t } = useTranslation('discover');
  const {
    github,
    overview,
    isValidated,
    toolsCount,
    promptsCount,
    resourcesCount,
    deploymentOptions,
  } = useDetailContext();

  // Use utility function to calculate all has* values
  const scoreFlags = calculateScoreFlags({
    deploymentOptions,
    github,
    isClaimed: false, // Detail page does not have claimed state yet
    isValidated,
    overview,
    promptsCount,
    resourcesCount,
    toolsCount,
  });

  // Calculate total score and grade
  const scoreItems = createScoreItems(scoreFlags);
  const scoreResult = calculateScore(scoreItems);

  // Use the new hook to create the score item list
  const scoreListItems = useScoreList();

  // Sort using utility function
  const sortedScoreListItems = sortItemsByPriority(scoreListItems);

  return (
    <div className="flex flex-col gap-4">
      {/* Total score display */}
      <TotalScore
        isValidated={isValidated}
        scoreResult={scoreResult}
        scoreItems={scoreListItems.map((item) => ({
          check: item.check,
          required: item.required,
          title: item.title,
          weight: item.weight,
        }))}
      />

      {/* Score details */}

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(max(240px, calc((100% - 1em) / 2)), 1fr))',
        }}
      >
        <div className="flex flex-col gap-4">
          <Title>{t('mcp.details.score.listTitle')}</Title>
          <div
            className="flex flex-col"
            style={{
              border: `1px solid var(--border)`,
              borderRadius: 'var(--ant-border-radius-lg)',
            }}
          >
            <ScoreList items={sortedScoreListItems} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Title>{t('mcp.details.githubBadge.title')}</Title>
          <div
            className="flex flex-col gap-4 p-4"
            style={{
              border: `1px solid var(--border)`,
              borderRadius: 'var(--ant-border-radius-lg)',
            }}
          >
            <GithubBadge />
          </div>
        </div>
      </div>
    </div>
  );
});

export default Score;
