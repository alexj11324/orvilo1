'use client';

import { type FormGroupItemType } from '@lobehub/ui';
import { Form } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { FORM_STYLE } from '@/const/layoutTokens';

const APP_ENVIRONMENT_ITEMS = [
  {
    descKey: 'settingSystemTools.appEnvironment.electron.desc',
    name: 'Electron',
    versionKey: 'electronVersion',
  },
  {
    descKey: 'settingSystemTools.appEnvironment.chromium.desc',
    name: 'Chromium',
    versionKey: 'chromeVersion',
  },
  {
    descKey: 'settingSystemTools.appEnvironment.node.desc',
    name: 'Node.js',
    versionKey: 'nodeVersion',
  },
] as const;

const AppEnvironmentSection = memo(() => {
  const { t } = useTranslation('setting');
  const orviloEnv = window.orviloEnv;

  const formItems: FormGroupItemType[] = [
    {
      children: APP_ENVIRONMENT_ITEMS.map((item) => {
        const version = orviloEnv?.[item.versionKey];
        const label = (
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <span>{item.name}</span>
            {version && (
              <Badge style={{ marginInlineStart: 0 }} variant="primary-light">
                {version}
              </Badge>
            )}
          </div>
        );
        return {
          desc: t(item.descKey),
          label,
          minWidth: undefined,
        };
      }),
      desc: t('settingSystemTools.appEnvironment.desc'),
      title: t('settingSystemTools.appEnvironment.title'),
    },
  ];

  return (
    <Form
      collapsible={false}
      items={formItems}
      itemsType={'group'}
      variant={'filled'}
      {...FORM_STYLE}
    />
  );
});

export default AppEnvironmentSection;
