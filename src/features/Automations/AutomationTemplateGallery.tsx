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
      <div
        className="flex flex-col gap-4"
        data-testid={'automation-template-gallery'}
        style={{
          paddingBlock: persistent ? 20 : 48,
          marginInline: 'auto',
          maxWidth: 960,
          width: '100%',
        }}
      >
        {persistent ? (
          <div className="flex items-start gap-4 justify-between">
            <div className="flex flex-col gap-1">
              <Text fontSize={14} weight={600}>
                {t('templates.section')}
              </Text>
              <Text fontSize={12} type={'secondary'}>
                {t('templates.gallery_cta')}
              </Text>
            </div>
            <Button icon={PlusIcon} size={'small'} onClick={onStartBlank}>
              {t('templates.start_blank')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1" style={{ textAlign: 'center' }}>
            <div className="flex items-center justify-center h-[40px] w-[40px]">
              <AlarmClockIcon color={cssVar.colorTextQuaternary} size={40} />
            </div>
            <Text fontSize={16} weight={600}>
              {t('page.empty.title')}
            </Text>
            <Text fontSize={13} style={{ maxWidth: 480 }} type={'secondary'}>
              {t('page.empty.hint')}
            </Text>
          </div>
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
          <div className="flex flex-col items-center py-6">
            <Text type={'secondary'}>{t('templates.gallery_empty')}</Text>
          </div>
        ) : (
          <div className={styles.cardGrid}>
            {categoryTemplates.map((id) => {
              const template = AUTOMATION_TEMPLATES[id];
              return (
                <div
                  className="flex flex-col gap-1 p-4 border cursor-pointer hover:bg-[var(--ant-color-fill-tertiary)]"
                  key={id}
                  style={{
                    borderColor: cssVar.colorBorderSecondary,
                    background: cssVar.colorBgContainer,
                  }}
                  onClick={() => selectTemplate(id)}
                >
                  <span className={styles.cardTitle}>{t(`templates.${template.id}.title`)}</span>
                  <span className={styles.cardSummary}>
                    {t(`templates.${template.id}.summary`)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!persistent && (
          <div className="flex justify-center">
            <Button icon={PlusIcon} size={'small'} onClick={onStartBlank}>
              {t('templates.start_blank')}
            </Button>
          </div>
        )}
      </div>
    );
  },
);

export default AutomationTemplateGallery;
