'use client';

import { Github } from '@lobehub/icons';
import { createStaticStyles, cssVar, useResponsive } from 'antd-style';
import { CircleIcon, DotIcon, DownloadIcon, ScaleIcon, StarIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import OfficialIcon from '@/components/OfficialIcon';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
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
    <Button disabled size={'default'}>
      {cate?.icon}
      {cate?.label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-start gap-4 w-[100%]">
        <Avatar avatar={icon} shape={'square'} size={mobile ? 48 : 64} />
        <div
          className="flex flex-col flex-1 gap-1"
          style={{
            overflow: 'hidden',
          }}
        >
          <div
            className="flex flex-row items-center gap-2 justify-between"
            style={{
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              className="flex flex-row items-center flex-1 gap-3"
              style={{
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <h1
                className="truncate"
                style={{ fontSize: inModal ? 20 : mobile ? 18 : 24, margin: 0 }}
                title={identifier}
              >
                {name}
              </h1>
              {isOfficial && (
                <SimpleTooltip title={t('isOfficial')}>
                  <OfficialIcon size={24} />
                </SimpleTooltip>
              )}
              {!mobile && scores}
            </div>
            <div className="flex flex-row items-center gap-1.5">
              {recommendedDeployment?.installationMethod && (
                <InstallationIcon type={recommendedDeployment.installationMethod} />
              )}
              {github?.url && (
                <a
                  href={github.url}
                  rel="noreferrer"
                  target={'_blank'}
                  onClick={(event) => event.stopPropagation()}
                >
                  <ActionIcon fill={cssVar.colorTextDescription} icon={Github} />
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-row items-center gap-1">
            <div className={styles.version}>{version}</div>
            <span className="anticon" role="img">
              <DotIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
            {author?.url ? (
              <a href={author?.url} rel="noreferrer" target={'_blank'}>
                {author?.name}
              </a>
            ) : (
              <span>{author?.name}</span>
            )}
            {isClaimed && (
              <Badge size="sm" variant="secondary">
                {t('isClaimed')}
              </Badge>
            )}
            <span className="anticon" role="img">
              <DotIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
            <PublishedTime className={styles.time} date={(updatedAt || createdAt) as string} />
          </div>
        </div>
      </div>
      <div
        className="flex flex-row items-center flex-wrap"
        style={{ color: cssVar.colorTextSecondary, gap: mobile ? 12 : 24 }}
      >
        {mobile && scores}
        {!mobile && cateButton}
        <div className="flex flex-row items-center flex-wrap" style={{ gap: mobile ? 12 : 24 }}>
          {Boolean(github?.language) && (
            <div className="flex flex-row items-center gap-1.5">
              <span className="anticon" role="img">
                <CircleIcon
                  color={cssVar.colorFillTertiary}
                  fill={getLanguageColor(github?.language)}
                  height={12}
                  size={12}
                  width={12}
                />
              </span>
              {github?.language}
            </div>
          )}
          {Boolean(github?.license) && (
            <div className="flex flex-row items-center gap-1.5">
              <span className="anticon" role="img">
                <ScaleIcon fill={'transparent'} height={14} size={14} width={14} />
              </span>
              {github?.license}
            </div>
          )}
          {Boolean(installCount) && (
            <div className="flex flex-row items-center gap-1.5">
              <span className="anticon" role="img">
                <DownloadIcon fill={'transparent'} height={14} size={14} width={14} />
              </span>
              {installCount}
            </div>
          )}
          {Boolean(github?.stars) && (
            <div className="flex flex-row items-center gap-1.5">
              <span className="anticon" role="img">
                <StarIcon fill={'transparent'} height={14} size={14} width={14} />
              </span>
              {github?.stars}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default Header;
