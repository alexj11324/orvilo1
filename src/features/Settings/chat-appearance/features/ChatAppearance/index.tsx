'use client';

import { Form, FormGroup, highlighterThemes, mermaidThemes } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { SettingsSectionSkeleton } from '@/components/Skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FORM_STYLE } from '@/const/layoutTokens';
import { useSaveState } from '@/hooks/useSaveState';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

import ChatTransitionPreview from './ChatTransitionPreview';
import HighlighterPreview from './HighlighterPreview';
import LinkIconPreview from './LinkIconPreview';
import MermaidPreview from './MermaidPreview';

const ChatAppearance = memo(() => {
  const { t } = useTranslation('setting');
  const { general } = useUserStore(settingsSelectors.currentSettings, isEqual);
  const [setSettings, isUserStateInit] = useUserStore((s) => [s.setSettings, s.isUserStateInit]);
  const { status: saveStatus, lastSavedAt, save, retry } = useSaveState();
  const [savingKey, setSavingKey] = useState<string>();

  if (!isUserStateInit) return <SettingsSectionSkeleton />;

  const handleChange = (key: string, value: any) => {
    setSavingKey(key);
    save(() => setSettings({ general: { [key]: value } }));
  };

  // Show the shared save-state hint only on the control the user last touched.
  const renderSaveHint = (key: string) =>
    savingKey === key && (
      <AutoSaveHint lastUpdatedTime={lastSavedAt} saveStatus={saveStatus} onRetry={retry} />
    );

  return (
    <>
      <FormGroup
        collapsible={false}
        gap={16}
        title={t('settingChatAppearance.transitionMode.title')}
        variant={'filled'}
        extra={
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            {renderSaveHint('transitionMode')}
            <Tabs
              value={general.transitionMode}
              onValueChange={(key) => handleChange('transitionMode', key)}
            >
              <TabsList>
                {[
                  {
                    key: 'none',
                    label: t('settingChatAppearance.transitionMode.options.none.value'),
                  },
                  {
                    key: 'fadeIn',
                    label: t('settingChatAppearance.transitionMode.options.fadeIn'),
                  },
                  {
                    key: 'smooth',
                    label: t('settingChatAppearance.transitionMode.options.smooth'),
                  },
                ].map((item) => (
                  <TabsTrigger key={item.key} value={item.key}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        }
      >
        <ChatTransitionPreview key={general.transitionMode} mode={general.transitionMode} />
      </FormGroup>

      <Form
        collapsible={false}
        itemsType={'group'}
        variant={'filled'}
        items={[
          {
            children: [
              {
                children: (
                  <div
                    className={'flex min-w-0'}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    {renderSaveHint('enableAutoScrollOnStreaming')}
                    <Switch
                      checked={general.enableAutoScrollOnStreaming ?? true}
                      onCheckedChange={(checked) =>
                        handleChange('enableAutoScrollOnStreaming', checked)
                      }
                    />
                  </div>
                ),
                label: t('settingChatAppearance.autoScrollOnStreaming.title'),
                minWidth: undefined,
              },
              {
                children: (
                  <div
                    className={'flex min-w-0'}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    {renderSaveHint('expandWorkflowWhileStreaming')}
                    <Switch
                      checked={general.expandWorkflowWhileStreaming ?? false}
                      onCheckedChange={(checked) =>
                        handleChange('expandWorkflowWhileStreaming', checked)
                      }
                    />
                  </div>
                ),
                label: t('settingChatAppearance.workflowStreamingExpand.title'),
                minWidth: undefined,
              },
              {
                children: (
                  <div
                    className={'flex min-w-0'}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    {renderSaveHint('enableMessageLinkIcon')}
                    <Switch
                      checked={general.enableMessageLinkIcon ?? true}
                      onCheckedChange={(checked) => handleChange('enableMessageLinkIcon', checked)}
                    />
                  </div>
                ),
                desc: <LinkIconPreview />,
                label: t('settingChatAppearance.linkIcon.title'),
                minWidth: undefined,
              },
            ],
            title: t('settingChatAppearance.chatBehavior.title'),
          },
        ]}
        {...FORM_STYLE}
      />

      <FormGroup
        collapsible={false}
        gap={16}
        title={t('settingChatAppearance.highlighterTheme.title')}
        variant={'filled'}
        extra={
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            {renderSaveHint('highlighterTheme')}
            <Select
              value={general.highlighterTheme}
              items={highlighterThemes.map((item) => ({
                label: item.displayName,
                value: item.id,
              }))}
              onValueChange={(value) => {
                if (value !== null) ((value) => handleChange('highlighterTheme', value))(value);
              }}
            >
              <SelectTrigger
                style={{
                  width: 240,
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {highlighterThemes
                  .map((item) => ({
                    label: item.displayName,
                    value: item.id,
                  }))
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <HighlighterPreview key={general.highlighterTheme} theme={general.highlighterTheme} />
      </FormGroup>

      <FormGroup
        gap={16}
        title={t('settingChatAppearance.mermaidTheme.title')}
        variant={'filled'}
        extra={
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            {renderSaveHint('mermaidTheme')}
            <Select
              value={general.mermaidTheme}
              items={mermaidThemes.map((item) => ({
                label: item.displayName,
                value: item.id,
              }))}
              onValueChange={(value) => {
                if (value !== null) ((value) => handleChange('mermaidTheme', value))(value);
              }}
            >
              <SelectTrigger
                style={{
                  width: 240,
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mermaidThemes
                  .map((item) => ({
                    label: item.displayName,
                    value: item.id,
                  }))
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <MermaidPreview key={general.mermaidTheme} theme={general.mermaidTheme} />
      </FormGroup>
    </>
  );
});

export default ChatAppearance;
