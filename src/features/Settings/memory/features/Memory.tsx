'use client';

import { type FormGroupItemType } from '@lobehub/ui';
import { Form } from '@lobehub/ui';
import { type UserMemoryEffort } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import LevelSlider from '@/components/LevelSlider';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FORM_STYLE } from '@/const/layoutTokens';
import { usePermission } from '@/hooks/usePermission';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

const MEMORY_EFFORT_LEVELS: readonly UserMemoryEffort[] = ['low', 'medium', 'high'];

const MemorySetting = memo(() => {
  const { t } = useTranslation('setting');
  const { allowed: canManageMemory, reason } = usePermission('manage_settings');
  const [form] = Form.useForm();
  const memory = useUserStore(settingsSelectors.currentMemorySettings, isEqual);
  const memoryEnabled = useUserStore(settingsSelectors.memoryEnabled);
  const [setSettings, isUserStateInit] = useUserStore((s) => [s.setSettings, s.isUserStateInit]);
  const { status: saveStatus, lastSavedAt, save, retry } = useSaveState();

  if (!isUserStateInit)
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="h-4 w-full" key={index} />
        ))}
      </div>
    );

  const memorySettings: FormGroupItemType = {
    children: [
      {
        children: <Switch disabled={!canManageMemory} />,
        desc: t('memory.enabled.desc'),
        label: t('memory.enabled.title'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'enabled',
        tooltip: reason,
        trigger: 'onCheckedChange',
        valuePropName: 'checked',
      },
      {
        children: (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex min-w-0">
                  <LevelSlider<UserMemoryEffort>
                    defaultValue="medium"
                    disabled={!canManageMemory}
                    levels={MEMORY_EFFORT_LEVELS}
                    style={{ minWidth: 160 }}
                    value={memory.effort}
                    marks={{
                      0: t('memory.effort.level.low'),
                      1: t('memory.effort.level.medium'),
                      2: t('memory.effort.level.high'),
                    }}
                    onChange={(value) => {
                      if (!canManageMemory) return;

                      save(() => setSettings({ memory: { effort: value } }));
                    }}
                  />
                </span>
              }
            />
            <TooltipContent side="top">{reason}</TooltipContent>
          </Tooltip>
        ),
        desc: t('memory.effort.desc'),
        label: t('memory.effort.title'),
        layout: 'horizontal',
        minWidth: undefined,
      },
    ],
    extra: <AutoSaveHint lastUpdatedTime={lastSavedAt} saveStatus={saveStatus} onRetry={retry} />,
    title: t('memory.title'),
  };

  return (
    <Form
      collapsible={false}
      form={form}
      initialValues={{ ...memory, enabled: memoryEnabled }}
      items={[memorySettings]}
      itemsType={'group'}
      variant={'filled'}
      onValuesChange={(values) => {
        if (!canManageMemory) return;

        save(() => setSettings({ memory: values }));
      }}
      {...FORM_STYLE}
    />
  );
});

export default MemorySetting;
