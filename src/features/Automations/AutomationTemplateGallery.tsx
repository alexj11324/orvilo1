import { Block, Center, Flexbox, Icon } from '@lobehub/ui';
import { Button, TabsIndicator, TabsList, TabsRoot, TabsTab, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { AlarmClockIcon, PlusIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import {
  AUTOMATION_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type TemplateCategoryId,
} from './automationTemplates';

const styles = createStaticStyles(({ css, cssVar }) => ({
  cardGrid: css`
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;

    @media (width >= 900px) {
      grid-template-columns: 1fr 1fr;
    }
  `,
  cardSummary: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  cardTitle: css`
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

interface AutomationTemplateGalleryProps {
  onStartBlank: () => void;
  /** Keep recommendations below an existing automation list (Cordy's "Recommended" section). */
  persistent?: boolean;
}

const AutomationTemplateGallery = memo<AutomationTemplateGalleryProps>(
  ({ onStartBlank, persistent = false }) => {
    const { t } = useTranslation('automation');
    const navigate = useWorkspaceAwareNavigate();
    const [category, setCategory] = useState<TemplateCategoryId>('popular');

    const selectTemplate = (id: string) =>
      navigate(`/automations/new?template=${encodeURIComponent(id)}`);

    const categoryTemplates =
      TEMPLATE_CATEGORIES.find((cat) => cat.id === category)?.templateIds ?? [];

    return (
      <Flexbox
        data-testid={'automation-template-gallery'}
        gap={16}
        paddingBlock={persistent ? 20 : 48}
        style={{ marginInline: 'auto', maxWidth: 960, width: '100%' }}
      >
        {persistent ? (
          <Flexbox horizontal align={'flex-start'} gap={16} justify={'space-between'}>
            <Flexbox gap={4}>
              <Text fontSize={14} weight={600}>
                {t('templates.section')}
              </Text>
              <Text fontSize={12} type={'secondary'}>
                {t('templates.gallery_cta')}
              </Text>
            </Flexbox>
            <Button icon={PlusIcon} size={'small'} onClick={onStartBlank}>
              {t('templates.start_blank')}
            </Button>
          </Flexbox>
        ) : (
          <Flexbox align={'center'} gap={4} style={{ textAlign: 'center' }}>
            <Center height={40} width={40}>
              <Icon color={cssVar.colorTextQuaternary} icon={AlarmClockIcon} size={40} />
            </Center>
            <Text fontSize={16} weight={600}>
              {t('page.empty.title')}
            </Text>
            <Text fontSize={13} style={{ maxWidth: 480 }} type={'secondary'}>
              {t('page.empty.hint')}
            </Text>
          </Flexbox>
        )}

        <TabsRoot
          size={'small'}
          value={category}
          onValueChange={(value) => setCategory(value as TemplateCategoryId)}
        >
          <TabsList>
            <TabsIndicator />
            {TEMPLATE_CATEGORIES.map((cat) => (
              <TabsTab key={cat.id} value={cat.id}>
                {t(`template_categories.${cat.id}`)}
              </TabsTab>
            ))}
          </TabsList>
        </TabsRoot>

        {categoryTemplates.length === 0 ? (
          <Flexbox align={'center'} paddingBlock={24}>
            <Text type={'secondary'}>{t('templates.gallery_empty')}</Text>
          </Flexbox>
        ) : (
          <div className={styles.cardGrid}>
            {categoryTemplates.map((id) => {
              const template = AUTOMATION_TEMPLATES[id];
              return (
                <Block
                  clickable
                  gap={4}
                  key={id}
                  padding={16}
                  variant={'outlined'}
                  onClick={() => selectTemplate(id)}
                >
                  <span className={styles.cardTitle}>{t(`templates.${template.id}.title`)}</span>
                  <span className={styles.cardSummary}>
                    {t(`templates.${template.id}.summary`)}
                  </span>
                </Block>
              );
            })}
          </div>
        )}

        {!persistent && (
          <Flexbox horizontal justify={'center'}>
            <Button icon={PlusIcon} size={'small'} onClick={onStartBlank}>
              {t('templates.start_blank')}
            </Button>
          </Flexbox>
        )}
      </Flexbox>
    );
  },
);

export default AutomationTemplateGallery;
