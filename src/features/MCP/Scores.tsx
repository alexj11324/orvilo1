'use client';

import { cn } from 'cn';
import { CircleDashedIcon, HammerIcon, LayersIcon, MessageSquareQuoteIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import {
  calculateScore,
  calculateScoreFlags,
  createScoreItems,
  getGradeStyleClass,
} from './calculateScore';

const styles = {
  disable: 'text-foreground-description',
  extraTag:
    'rounded-(--radius-chip) bg-muted ps-2.5 pe-3 py-1 text-xs leading-5 text-muted-foreground',
  extraTagActive: 'hover:text-foreground',
  gradeA: 'text-success-text bg-success-wash',
  gradeB: 'text-warning-text bg-warning-wash',
  gradeF: 'text-destructive-text bg-destructive-wash',
  gradeIcon:
    'flex-none size-5.5 rounded-full border-[1.5px] border-current text-xs leading-5 font-semibold',
  tag: 'rounded-(--radius-chip) bg-muted ps-2 pe-3 py-1 text-xs leading-5',
};

interface ScoresProps {
  deploymentOptions?: Array<{
    installationMethod?: string;
  }>;
  github?: {
    license?: string;
  };
  identifier: string;
  // List page support
  installationMethods?: string;
  isClaimed?: boolean;
  isValidated?: boolean;
  // Raw data properties
  overview?: {
    readme?: string;
  };
  promptsCount?: number;
  resourcesCount?: number;
  toolsCount?: number;
}

const Scores = memo<ScoresProps>(
  ({
    identifier,
    promptsCount,
    toolsCount,
    resourcesCount,
    isValidated,
    overview,
    github,
    deploymentOptions,
    isClaimed = false,
    installationMethods,
  }) => {
    const { t } = useTranslation('discover');

    // Use utility function to calculate all has* values, but need to handle type conversion
    const scoreFlags = calculateScoreFlags({
      // Only pass compatible properties, or perform type conversion
      deploymentOptions: deploymentOptions?.map((item) => ({
        // Ensure not undefined
        connection: { type: 'stdio' as const },
        installationMethod: item.installationMethod || 'manual', // Provide default connection
      })),
      github: github?.license
        ? {
            license: github.license,
            url: '', // Provide default url
          }
        : undefined,
      installationMethods,
      isClaimed,
      isValidated,
      overview: overview?.readme
        ? {
            readme: overview.readme,
          }
        : undefined,
      promptsCount,
      resourcesCount,
      toolsCount,
    });

    // Calculate score
    const scoreItems = createScoreItems(scoreFlags);
    const scoreResult = calculateScore(scoreItems);
    const { grade, percentage } = scoreResult;

    const showToolts = Boolean(toolsCount && toolsCount > 0);
    const showResources = Boolean(resourcesCount && resourcesCount > 0);
    const showPrompts = Boolean(promptsCount && promptsCount > 0);

    const showExtra = showToolts || showResources || showPrompts;

    const scoreTag = (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex max-w-full">
                <div
                  className={cn(
                    'flex max-w-full items-center gap-2',
                    styles.tag,
                    getGradeStyleClass(grade, styles),
                  )}
                >
                  <div className={cn('flex items-center justify-center', styles.gradeIcon)}>
                    {grade.toUpperCase()}
                  </div>
                  <span className="min-w-0 wrap-anywhere font-medium">
                    {t(`mcp.details.scoreLevel.${grade}.title`).toUpperCase()}
                  </span>
                </div>
              </span>
            }
          />
          <TooltipContent>{`${t(`mcp.details.scoreLevel.${grade}.desc`)} (${Math.round(percentage)}%)`}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    const unvalidatedTag = (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex max-w-full">
                <div
                  className={cn(
                    'flex items-center gap-2 text-foreground-description',
                    styles.tag,
                    'ps-1',
                  )}
                >
                  <CircleDashedIcon className="text-foreground-quaternary" size={22} />
                  {t('mcp.unvalidated.title')}
                </div>
              </span>
            }
          />
          <TooltipContent>{t('mcp.unvalidated.desc')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    return (
      <div
        className="flex max-w-full flex-none flex-wrap items-center gap-2"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {identifier && (isValidated ? scoreTag : unvalidatedTag)}
        {showExtra && (
          <div className={cn('flex items-center gap-4', styles.extraTag)}>
            {showToolts && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex max-w-full">
                        <div className={cn('flex items-center gap-2', styles.extraTagActive)}>
                          <HammerIcon size={14} />
                          {toolsCount}
                        </div>
                      </span>
                    }
                  />
                  <TooltipContent>
                    {[t('mcp.details.schema.tools.title'), t('mcp.details.schema.tools.desc')].join(
                      ': ',
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {showPrompts && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex max-w-full">
                        <div className={cn('flex items-center gap-2', styles.extraTagActive)}>
                          <MessageSquareQuoteIcon size={14} />
                          {promptsCount}
                        </div>
                      </span>
                    }
                  />
                  <TooltipContent>
                    {[
                      t('mcp.details.schema.prompts.title'),
                      t('mcp.details.schema.prompts.desc'),
                    ].join(': ')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {showResources && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex max-w-full">
                        <div className={cn('flex items-center gap-2', styles.extraTagActive)}>
                          <LayersIcon size={14} />
                          {resourcesCount}
                        </div>
                      </span>
                    }
                  />
                  <TooltipContent>
                    {[
                      t('mcp.details.schema.resources.title'),
                      t('mcp.details.schema.resources.desc'),
                    ].join(': ')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>
    );
  },
);

export default Scores;
