'use client';

import { Github } from '@lobehub/icons';
import { Flexbox, Icon, stopPropagation, Tooltip } from '@lobehub/ui';
import { ActionIcon, Avatar, Button, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, useResponsive } from 'antd-style';
import { CircleIcon, DotIcon, DownloadIcon, ScaleIcon, StarIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import OfficialIcon from '@/components/OfficialIcon';
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
    <Flexbox gap={12}>
      <Flexbox horizontal align={'flex-start'} gap={16} width={'100%'}>
        <Avatar avatar={icon} shape={'square'} size={mobile ? 48 : 64} />
        <Flexbox
          flex={1}
          gap={4}
          style={{
            overflow: 'hidden',
          }}
        >
          <Flexbox
            horizontal
            align={'center'}
            gap={8}
            justify={'space-between'}
            style={{
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Flexbox
              horizontal
              align={'center'}
              flex={1}
              gap={12}
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
                <Tooltip title={t('isOfficial')}>
                  <OfficialIcon size={24} />
                </Tooltip>
              )}
              {!mobile && scores}
            </Flexbox>
            <Flexbox horizontal align={'center'} gap={6}>
              {recommendedDeployment?.installationMethod && (
                <InstallationIcon type={recommendedDeployment.installationMethod} />
              )}
              {github?.url && (
                <a href={github.url} rel="noreferrer" target={'_blank'} onClick={stopPropagation}>
                  <ActionIcon fill={cssVar.colorTextDescription} icon={Github} />
                </a>
              )}
            </Flexbox>
          </Flexbox>
          <Flexbox horizontal align={'center'} gap={4}>
            <div className={styles.version}>{version}</div>
            <Icon icon={DotIcon} />
            {author?.url ? (
              <a href={author?.url} rel="noreferrer" target={'_blank'}>
                {author?.name}
              </a>
            ) : (
              <span>{author?.name}</span>
            )}
            {isClaimed && <Tag size={'small'}>{t('isClaimed')}</Tag>}
            <Icon icon={DotIcon} />
            <PublishedTime className={styles.time} date={(updatedAt || createdAt) as string} />
          </Flexbox>
        </Flexbox>
      </Flexbox>
      <Flexbox
        horizontal
        align={'center'}
        gap={mobile ? 12 : 24}
        wrap={'wrap'}
        style={{
          color: cssVar.colorTextSecondary,
        }}
      >
        {mobile && scores}
        {!mobile && cateButton}
        <Flexbox horizontal align={'center'} gap={mobile ? 12 : 24} wrap={'wrap'}>
          {Boolean(github?.language) && (
            <Flexbox horizontal align={'center'} gap={6}>
              <Icon
                color={cssVar.colorFillTertiary}
                fill={getLanguageColor(github?.language)}
                icon={CircleIcon}
                size={12}
              />
              {github?.language}
            </Flexbox>
          )}
          {Boolean(github?.license) && (
            <Flexbox horizontal align={'center'} gap={6}>
              <Icon icon={ScaleIcon} size={14} />
              {github?.license}
            </Flexbox>
          )}
          {Boolean(installCount) && (
            <Flexbox horizontal align={'center'} gap={6}>
              <Icon icon={DownloadIcon} size={14} />
              {installCount}
            </Flexbox>
          )}
          {Boolean(github?.stars) && (
            <Flexbox horizontal align={'center'} gap={6}>
              <Icon icon={StarIcon} size={14} />
              {github?.stars}
            </Flexbox>
          )}
        </Flexbox>
      </Flexbox>
    </Flexbox>
  );
});

export default Header;
