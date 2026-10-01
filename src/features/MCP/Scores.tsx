'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
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

const styles = createStaticStyles(({ css }) => {
  return {
    active: css`
      background: ${cssVar.colorSuccessBgHover};
    `,
    disable: css`
      color: ${cssVar.colorTextDescription};
    `,
    extraTag: css`
      padding-block: 4px;
      padding-inline: 10px 12px;
      border-radius: 16px;

      color: ${cssVar.colorTextSecondary};

      background: ${cssVar.colorFillTertiary};
    `,
    extraTagActive: css`
      &:hover {
        color: ${cssVar.colorText};
      }
    `,
    gradeA: css`
      color: ${cssVar.colorSuccess};
      background: ${cssVar.colorSuccessBg};
    `,
    gradeB: css`
      color: ${cssVar.colorWarning};
      background: ${cssVar.colorWarningBg};
    `,
    gradeF: css`
      color: ${cssVar.colorError};
      background: ${cssVar.colorErrorBg};
    `,
    gradeIcon: css`
      flex: none;

      width: 22px;
      height: 22px;
      border: 1.5px solid;
      border-radius: 50%;

      font-size: 12px;
      font-weight: 600;
    `,
    tag: css`
      padding-block: 4px;
      padding-inline: 8px 12px;
      border-radius: 16px;
      background: ${cssVar.colorFillTertiary};
    `,
  };
});

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
              <span style={{ display: 'inline-flex' }}>
                <div
                  className={cn(
                    'flex items-center gap-2',
                    cx(styles.tag, getGradeStyleClass(grade, styles)),
                  )}
                  style={{
                    paddingLeft: 4,
                  }}
                >
                  <div
                    className={cn('flex items-center justify-center', styles.gradeIcon)}
                    style={{
                      borderColor:
                        grade === 'a'
                          ? cssVar.colorSuccess
                          : grade === 'b'
                            ? cssVar.colorWarning
                            : grade === 'f'
                              ? cssVar.colorError
                              : cssVar.colorTextSecondary,
                    }}
                  >
                    {grade.toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500 }}>
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
              <span style={{ display: 'inline-flex' }}>
                <div
                  className={cn('flex items-center gap-2', styles.tag)}
                  style={{
                    color: cssVar.colorTextDescription,
                    paddingLeft: 4,
                  }}
                >
                  <CircleDashedIcon color={cssVar.colorTextQuaternary} size={22} />
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
        className="flex items-center gap-2"
        style={{ flex: 'none' }}
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
                      <span style={{ display: 'inline-flex' }}>
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
                      <span style={{ display: 'inline-flex' }}>
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
                      <span style={{ display: 'inline-flex' }}>
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
