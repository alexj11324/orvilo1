import { cn } from 'cn';
import { AlarmClockIcon, PlusIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import {
  AUTOMATION_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type TemplateCategoryId,
} from './automationTemplates';

const styles = {
  cardGrid: 'grid grid-cols-[1fr] gap-3 [@media(width>=900px)]:grid-cols-[1fr_1fr]',
  cardSummary: 'line-clamp-2 text-[12px] text-muted-foreground',
  cardTitle: 'text-[13px] font-medium text-foreground',
};

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
              <div className="text-[14px] font-semibold">{t('templates.section')}</div>
              <div className="text-[12px] text-muted-foreground">{t('templates.gallery_cta')}</div>
            </div>
            <Button size="sm" onClick={onStartBlank}>
              <PlusIcon data-icon="inline-start" />
              {t('templates.start_blank')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1" style={{ textAlign: 'center' }}>
            <div className="flex items-center justify-center h-[40px] w-[40px]">
              <AlarmClockIcon color={'var(--ant-color-text-quaternary)'} size={40} />
            </div>
            <div className="text-[16px] font-semibold">{t('page.empty.title')}</div>
            <div className="text-[13px] text-muted-foreground" style={{ maxWidth: 480 }}>
              {t('page.empty.hint')}
            </div>
          </div>
        )}

        <Tabs value={category} onValueChange={(value) => setCategory(value as TemplateCategoryId)}>
          <TabsList>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id}>
                {t(`template_categories.${cat.id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {categoryTemplates.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <div className="text-muted-foreground">{t('templates.gallery_empty')}</div>
          </div>
        ) : (
          <div className={styles.cardGrid}>
            {categoryTemplates.map((id) => {
              const template = AUTOMATION_TEMPLATES[id];
              return (
                <div
                  {...clickableProps()}
                  key={id}
                  className={cn(
                    'flex flex-col gap-1 p-4 border cursor-pointer hover:bg-[var(--ant-color-fill-tertiary)]',
                    CLICKABLE_FOCUS_RING,
                  )}
                  style={{
                    borderColor: 'var(--sidebar-border)',
                    background: 'var(--card)',
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
            <Button size="sm" onClick={onStartBlank}>
              <PlusIcon data-icon="inline-start" />
              {t('templates.start_blank')}
            </Button>
          </div>
        )}
      </div>
    );
  },
);

export default AutomationTemplateGallery;
