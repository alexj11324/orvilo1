'use client';

import { Github } from '@lobehub/icons';
import { stopPropagation } from '@lobehub/ui';
import { ActionIcon, Avatar, Button, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, useResponsive } from 'antd-style';
import { CircleIcon, DotIcon, DownloadIcon, ScaleIcon, StarIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import OfficialIcon from '@/components/OfficialIcon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Scores from '@/features/MCP/Scores';
import { getLanguageColor, getRecommendedDeployment } from '@/features/MCP/utils';
import { useCategory } from '@/hooks/useMCPCategory';

import InstallationIcon from '../../components/MCPDepsIcon';
import PublishedTime from '../../components/PublishedTime';
import { useDetailContext } from './DetailProvider';

const styles = createStaticStyles(({ css }) => {
  return {
    desc: css`
      color: ${cssVar.colorTextSecondary};
    `,
    time: css`
      font-size: 12px;
      color: ${cssVar.colorTextDescription};
    `,
    version: css`
      font-family: ${cssVar.fontFamilyCode};
      font-size: 13px;
    `,
  };
});

const Header = memo<{ inModal?: boolean; mobile?: boolean }>(({ mobile: isMobile, inModal }) => {
  const { t } = useTranslation('discover');

  const {
    name,
    author,
    version,
    identifier,
    icon,
    updatedAt,
    createdAt,
    github,
    isValidated,
    promptsCount,
    resourcesCount,
    toolsCount,
    deploymentOptions = [],
    category,
    installCount,
    overview,
    isClaimed,
    isOfficial,
  } = useDetailContext();
  const { mobile = isMobile } = useResponsive();

  const recommendedDeployment = getRecommendedDeployment(deploymentOptions);
  const categories = useCategory();
  const cate = categories.find((c) => c.key === category);

  const scores = (
    <Scores
      deploymentOptions={deploymentOptions}
      github={github}
      identifier={identifier as string}
      isClaimed={isClaimed}
      isValidated={isValidated}
      overview={overview}
      promptsCount={promptsCount}
      resourcesCount={resourcesCount}
      toolsCount={toolsCount}
    />
  );

  const cateButton = (
    <Button disabled icon={cate?.icon} size={'middle'}>
      {cate?.label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-4" style={{ width: '100%' }}>
        <Avatar avatar={icon} shape={'square'} size={mobile ? 48 : 64} />
        <div
          className="flex flex-col flex-1 gap-1"
          style={{
            overflow: 'hidden',
          }}
        >
          <div
            className="flex items-center gap-2 justify-between"
            style={{
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              className="flex items-center flex-1 gap-3"
              style={{
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <Text
                ellipsis
                as={'h1'}
                style={{ fontSize: inModal ? 20 : mobile ? 18 : 24, margin: 0 }}
                title={identifier}
              >
                {name}
              </Text>
              {isOfficial && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span style={{ display: 'inline-flex' }}>
                          <OfficialIcon size={24} />
                        </span>
                      }
                    />
                    <TooltipContent>{t('isOfficial')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {!mobile && scores}
            </div>
            <div className="flex items-center gap-1.5">
              {recommendedDeployment?.installationMethod && (
                <InstallationIcon type={recommendedDeployment.installationMethod} />
              )}
              {github?.url && (
                <a href={github.url} rel="noreferrer" target={'_blank'} onClick={stopPropagation}>
                  <ActionIcon fill={cssVar.colorTextDescription} icon={Github} />
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className={styles.version}>{version}</div>
            <DotIcon />
            {author?.url ? (
              <a href={author?.url} rel="noreferrer" target={'_blank'}>
                {author?.name}
              </a>
            ) : (
              <span>{author?.name}</span>
            )}
            {isClaimed && <Tag size={'small'}>{t('isClaimed')}</Tag>}
            <DotIcon />
            <PublishedTime className={styles.time} date={(updatedAt || createdAt) as string} />
          </div>
        </div>
      </div>
      <div
        className="flex items-center flex-wrap"
        style={{
          gap: mobile ? 12 : 24,

          color: cssVar.colorTextSecondary,
        }}
      >
        {mobile && scores}
        {!mobile && cateButton}
        <div className="flex items-center flex-wrap" style={{ gap: mobile ? 12 : 24 }}>
          {Boolean(github?.language) && (
            <div className="flex items-center gap-1.5">
              <CircleIcon
                color={cssVar.colorFillTertiary}
                fill={getLanguageColor(github?.language)}
                size={12}
              />
              {github?.language}
            </div>
          )}
          {Boolean(github?.license) && (
            <div className="flex items-center gap-1.5">
              <ScaleIcon size={14} />
              {github?.license}
            </div>
          )}
          {Boolean(installCount) && (
            <div className="flex items-center gap-1.5">
              <DownloadIcon size={14} />
              {installCount}
            </div>
          )}
          {Boolean(github?.stars) && (
            <div className="flex items-center gap-1.5">
              <StarIcon size={14} />
              {github?.stars}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default Header;
