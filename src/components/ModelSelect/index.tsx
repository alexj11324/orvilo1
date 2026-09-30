import { type IconAvatarProps } from '@lobehub/icons';
import { LobeHub as Orvilo } from '@lobehub/icons';
import { Avatar, Tag, Text } from '@lobehub/ui/base-ui';
import { type ChatModelCard } from '@orvilo/types';
import { createStaticStyles, useResponsive } from 'antd-style';
import { cn } from 'cn';
import {
  AudioLines,
  Infinity as InfinityIcon,
  LucideEye,
  LucideImage,
  LucidePaperclip,
  Video,
  Wrench,
} from 'lucide-react';
import { type ModelAbilities } from 'model-bank';
import numeral from 'numeral';
import { createElement, type CSSProperties, type FC, type HTMLAttributes } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelIcon, ProviderIcon } from '@/components/OrviloIcons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type AiProviderSourceType } from '@/types/aiProvider';
import { formatTokenNumber } from '@/utils/format';

import NewModelBadgeI18n, { NewModelBadge as NewModelBadgeCore } from './NewModelBadge';

export const TAG_CLASSNAME = 'orvilo-model-info-tags';

const styles = createStaticStyles(({ css, cssVar }) => ({
  tag: css`
    cursor: default;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 20px !important;
    height: 20px;
    border-radius: 4px;
  `,
  token: css`
    width: 36px !important;
    height: 20px;
    border-radius: 4px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
}));

type TooltipStyles = typeof styles;

interface ModelInfoTagsProps extends ModelAbilities {
  contextWindowTokens?: number | null;
  directionReverse?: boolean;
  disableTooltip?: boolean;
  isCustom?: boolean;
  placement?: 'top' | 'right';
  style?: CSSProperties;
}

interface FeatureTagsProps extends Pick<
  ModelAbilities,
  'files' | 'imageOutput' | 'vision' | 'video' | 'audio' | 'functionCall'
> {
  disableTooltip?: boolean;
  placement: 'top' | 'right';
  tagClassName: string;
}

interface FeatureTagItemProps {
  className: string;
  color: Parameters<typeof Tag>[0]['color'];
  disableTooltip?: boolean;
  enabled: boolean | undefined;
  icon: Parameters<typeof Icon>[0]['icon'];
  placement: 'top' | 'right';
  title: string;
}

const FeatureTagItem = memo<FeatureTagItemProps>(
  ({ className, color, disableTooltip, enabled, icon, placement, title }) => {
    if (!enabled) return null;

    const tag = (
      <Tag className={className} color={color} size={'small'}>
        {createElement(icon, { size: 16 })}
      </Tag>
    );

    if (disableTooltip) return tag;

    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>{tag}</TooltipTrigger>
        <TooltipContent side={placement}>{title}</TooltipContent>
      </Tooltip>
    );
  },
);

const FeatureTags = memo<FeatureTagsProps>(
  ({
    audio,
    disableTooltip,
    files,
    functionCall,
    imageOutput,
    placement,
    tagClassName,
    video,
    vision,
  }) => {
    const { t } = useTranslation('components');

    return (
      <>
        <FeatureTagItem
          className={tagClassName}
          color={'success'}
          disableTooltip={disableTooltip}
          enabled={files}
          icon={LucidePaperclip}
          placement={placement}
          title={t('ModelSelect.featureTag.file')}
        />
        <FeatureTagItem
          className={tagClassName}
          color={'success'}
          disableTooltip={disableTooltip}
          enabled={imageOutput}
          icon={LucideImage}
          placement={placement}
          title={t('ModelSelect.featureTag.imageOutput')}
        />
        <FeatureTagItem
          className={tagClassName}
          color={'success'}
          disableTooltip={disableTooltip}
          enabled={vision}
          icon={LucideEye}
          placement={placement}
          title={t('ModelSelect.featureTag.vision')}
        />
        <FeatureTagItem
          className={tagClassName}
          color={'magenta'}
          disableTooltip={disableTooltip}
          enabled={video}
          icon={Video}
          placement={placement}
          title={t('ModelSelect.featureTag.video')}
        />
        <FeatureTagItem
          className={tagClassName}
          color={'gold'}
          disableTooltip={disableTooltip}
          enabled={audio}
          icon={AudioLines}
          placement={placement}
          title={t('ModelSelect.featureTag.audio')}
        />
        <FeatureTagItem
          className={tagClassName}
          color={'info'}
          disableTooltip={disableTooltip}
          enabled={functionCall}
          icon={Wrench}
          placement={placement}
          title={t('ModelSelect.featureTag.functionCall')}
        />
      </>
    );
  },
);

const Context = memo(
  ({
    contextWindowTokens,
    disableTooltip,
    placement,
    styles,
  }: {
    contextWindowTokens: number;
    disableTooltip?: boolean;
    placement: 'top' | 'right';
    styles: TooltipStyles;
  }) => {
    const { t } = useTranslation('components');
    const tokensText = contextWindowTokens === 0 ? '∞' : formatTokenNumber(contextWindowTokens);

    const tag = (
      <Tag className={styles.token} size={'small'}>
        {contextWindowTokens === 0 ? <InfinityIcon size={17} strokeWidth={1.6} /> : tokensText}
      </Tag>
    );

    if (disableTooltip) return tag;

    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>{tag}</TooltipTrigger>
        <TooltipContent side={placement}>
          {t('ModelSelect.featureTag.tokens', {
            tokens: contextWindowTokens === 0 ? '∞' : numeral(contextWindowTokens).format('0,0'),
          })}
        </TooltipContent>
      </Tooltip>
    );
  },
);

export const ModelInfoTags = memo<ModelInfoTagsProps>(
  ({ directionReverse, disableTooltip, placement = 'top', style, ...model }) => {
    return (
      <div
        className={cn('flex', TAG_CLASSNAME)}
        style={{
          gap: 2,
          marginLeft: 'auto',
          ...style,
          flexDirection: directionReverse ? 'horizontal-reverse' : 'row',
          width: 'fit-content',
        }}
      >
        <FeatureTags
          audio={model.audio}
          disableTooltip={disableTooltip}
          files={model.files}
          functionCall={model.functionCall}
          imageOutput={model.imageOutput}
          placement={placement}
          tagClassName={styles.tag}
          video={model.video}
          vision={model.vision}
        />
        {typeof model.contextWindowTokens === 'number' && (
          <Context
            contextWindowTokens={model.contextWindowTokens}
            disableTooltip={disableTooltip}
            placement={placement}
            styles={styles}
          />
        )}
      </div>
    );
  },
);

interface ModelItemRenderProps extends ChatModelCard, Pick<HTMLAttributes<HTMLDivElement>> {
  abilities?: ModelAbilities;
  audio?: boolean;
  newBadgeLabel?: string;
  proBadgeLabel?: string;
  showInfoTag?: boolean;
}

export const ModelItemRender = memo<ModelItemRenderProps>(
  ({
    showInfoTag = true,
    abilities,
    audio,
    contextWindowTokens,
    files,
    functionCall,
    imageOutput,
    newBadgeLabel,
    proBadgeLabel,
    video,
    vision,
    id,
    displayName,
    releasedAt,
    className,
    style,
  }) => {
    const { mobile } = useResponsive();
    const displayNameOrId = displayName || id;

    return (
      <div
        className={cn('flex gap-8 items-center justify-between', className)}
        style={{ overflow: 'hidden', position: 'relative', width: '100%', ...style }}
      >
        <div
          className={'flex gap-2 items-center'}
          style={{ flexShrink: 1, minWidth: 0, overflow: 'hidden' }}
        >
          <ModelIcon model={id} size={20} />
          <Text
            style={mobile ? { maxWidth: '60vw' } : { minWidth: 0, overflow: 'hidden' }}
            ellipsis={{
              tooltip: displayNameOrId,
              tooltipWhenOverflow: true,
            }}
          >
            {displayNameOrId}
          </Text>
          {newBadgeLabel ? (
            <NewModelBadgeCore label={newBadgeLabel} releasedAt={releasedAt} />
          ) : (
            <NewModelBadgeI18n releasedAt={releasedAt} />
          )}
          {proBadgeLabel && (
            <Tag color="gold" size="small">
              {proBadgeLabel}
            </Tag>
          )}
        </div>
        {showInfoTag && (
          <ModelInfoTags
            audio={audio ?? abilities?.audio}
            contextWindowTokens={contextWindowTokens}
            files={files ?? abilities?.files}
            functionCall={functionCall ?? abilities?.functionCall}
            imageOutput={imageOutput ?? abilities?.imageOutput}
            style={{ zoom: 0.9 }}
            video={video ?? abilities?.video}
            vision={vision ?? abilities?.vision}
          />
        )}
      </div>
    );
  },
);

interface ProviderItemRenderProps {
  logo?: string;
  name: string;
  provider: string;
  size?: number;
  source?: AiProviderSourceType;
  type?: 'mono' | 'color' | 'avatar';
}

export const ProviderItemRender = memo<ProviderItemRenderProps>(
  ({ provider, name, source, logo, type = 'mono', size = 16 }) => {
    const isMono = type === 'mono';
    return (
      <div className={'flex items-center'} style={{ gap: 6, overflow: 'hidden' }}>
        {source === 'custom' && !!logo ? (
          <Avatar
            avatar={logo}
            shape={'circle'}
            size={size}
            style={isMono ? { filter: 'grayscale(1)' } : {}}
            title={name}
          />
        ) : provider === 'orvilo' ? (
          <Orvilo.Morden size={size} />
        ) : (
          <ProviderIcon provider={provider} size={size} type={type} />
        )}
        <Text ellipsis color={'inherit'}>
          {name}
        </Text>
      </div>
    );
  },
);

interface LabelRendererProps {
  Icon: FC<IconAvatarProps>;
  label: string;
}

export const LabelRenderer = memo<LabelRendererProps>(({ Icon, label }) => (
  <div className={'flex gap-2 items-center'}>
    {createElement(Icon, { size: 20 })}
    <span>{label}</span>
  </div>
));
