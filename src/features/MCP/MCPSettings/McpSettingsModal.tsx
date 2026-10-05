'use client';

import { t as i18nT } from 'i18next';
import { type RefObject } from 'react';

import { createModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';

import { type SettingsRef } from './index';
import Settings from './index';

interface McpSettingsModalOptions {
  identifier: string;
}

export const createMcpSettingsModal = ({ identifier }: McpSettingsModalOptions) => {
  const settingsRef: RefObject<SettingsRef | null> = { current: null };

  const modal = createModal({
    content: <Settings hideFooter identifier={identifier} ref={settingsRef} />,
    footer: (
      <div className="flex justify-between" style={{ width: '100%' }}>
        <Button
          onClick={() => {
            settingsRef.current?.reset();
          }}
        >
          {i18nT('reset', { ns: 'common' })}
        </Button>
        <div className="flex gap-2">
          <Button onClick={() => modal.close()}>{i18nT('cancel', { ns: 'common' })}</Button>
          <Button
            variant="default"
            onClick={() => {
              settingsRef.current?.save();
            }}
          >
            {i18nT('save', { ns: 'common' })}
          </Button>
        </div>
      </div>
    ),
    title: i18nT('dev.title.skillSettings', { ns: 'plugin' }),
    width: 600,
  });

  return modal;
};
