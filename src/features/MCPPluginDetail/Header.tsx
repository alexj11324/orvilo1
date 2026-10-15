'use client';

import { cn } from 'cn';
import { CircleIcon, DotIcon, DownloadIcon, ScaleIcon, StarIcon } from 'lucide-react';
import { memo, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Github } from '@/components/BrandIcons';
import OfficialIcon from '@/components/OfficialIcon';
import { Badge } from '@/components/reui/badge';
import { buttonVariants } from '@/components/ui/button';
import { SimpleTooltip, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Scores from '@/features/MCP/Scores';
import { getLanguageColor, getRecommendedDeployment } from '@/features/MCP/utils';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useCategory } from '@/hooks/useMCPCategory';

import InstallationIcon from '../../components/MCPDepsIcon';
import PublishedTime from '../../components/PublishedTime';
import { useDetailContext } from './DetailProvider';

const styles = {
  time: 'text-xs leading-5 text-foreground-description',
  version: 'font-mono text-xs leading-5',
};

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
  const viewportMobile = useIsMobile();
  const [responsiveReady, setResponsiveReady] = useState(false);
  useLayoutEffect(() => setResponsiveReady(true), []);
  const mobile = responsiveReady ? viewportMobile : isMobile;

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

  const cateBadge = (
    <Tooltip>
      <TooltipTrigger render={<Badge className="max-w-full" variant="secondary" />}>
        {cate?.icon ? <cate.icon className="size-4" size={16} /> : null}
        <span className="truncate">{cate?.label}</span>
      </TooltipTrigger>
      <TooltipContent className="rounded-(--radius-overlay)">
        <span className="min-w-0 break-words">{cate?.label}</span>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-start gap-4 w-full">
        <Avatar avatar={icon} shape={'square'} size={mobile ? 48 : 64} />
        <div className="flex flex-col flex-1 gap-1 overflow-hidden">
          <div className="flex flex-row items-center gap-2 justify-between overflow-hidden relative">
            <div className="flex flex-row items-center flex-1 gap-3 overflow-hidden relative">
              <h1
                title={identifier}
                className={cn(
                  'truncate m-0 font-semibold',
                  inModal || mobile ? 'text-xl leading-7' : 'text-2xl leading-8',
                )}
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
                  aria-label="GitHub"
                  className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                  href={github.url}
                  rel="noreferrer"
                  target={'_blank'}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Github className="size-4" fill="var(--foreground-description)" size={16} />
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-row items-center gap-1 text-xs leading-5">
            <div className={styles.version}>{version}</div>
            <span className="anticon" role="img">
              <DotIcon fill={'transparent'} height={16} size={16} width={16} />
            </span>
            {author?.url ? (
              <a href={author?.url} rel="noreferrer" target={'_blank'}>
                {author?.name}
              </a>
            ) : (
              <span>{author?.name}</span>
            )}
            {isClaimed && <Badge variant="secondary">{t('isClaimed')}</Badge>}
            <span className="anticon" role="img">
              <DotIcon fill={'transparent'} height={16} size={16} width={16} />
            </span>
            <PublishedTime className={styles.time} date={(updatedAt || createdAt) as string} />
          </div>
        </div>
      </div>
      <div
        className={cn(
          'flex flex-row items-center flex-wrap text-xs leading-5 text-muted-foreground',
          mobile ? 'gap-3' : 'gap-6',
        )}
      >
        {mobile && scores}
        {!mobile && cateBadge}
        <div className={cn('flex flex-row items-center flex-wrap', mobile ? 'gap-3' : 'gap-6')}>
          {Boolean(github?.language) && (
            <div className="flex flex-row items-center gap-1.5">
              <span className="anticon" role="img">
                <CircleIcon
                  color="var(--muted)"
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
                <ScaleIcon fill={'transparent'} height={16} size={16} width={16} />
              </span>
              {github?.license}
            </div>
          )}
          {Boolean(installCount) && (
            <div className="flex flex-row items-center gap-1.5">
              <span className="anticon" role="img">
                <DownloadIcon fill={'transparent'} height={16} size={16} width={16} />
              </span>
              {installCount}
            </div>
          )}
          {Boolean(github?.stars) && (
            <div className="flex flex-row items-center gap-1.5">
              <span className="anticon" role="img">
                <StarIcon fill={'transparent'} height={16} size={16} width={16} />
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
