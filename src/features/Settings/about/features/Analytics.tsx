'use client';

import { BRANDING_NAME } from '@orvilo/business-const';
import { memo, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldContent, FieldDescription, FieldTitle } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { settingWidthClassNames } from '@/features/Setting/settingWidth';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

const Analytics = memo(() => {
  const { t } = useTranslation('setting');
  const checked = useUserStore(userGeneralSettingsSelectors.telemetry);
  const updateGeneralConfig = useUserStore((s) => s.updateGeneralConfig);
  const telemetryId = useId();

  return (
    <section className={`flex w-full min-w-0 flex-col gap-4 ${settingWidthClassNames.form}`}>
      <h2 className="text-sm leading-5.5 font-semibold text-foreground">{t('analytics.title')}</h2>
      <div className="rounded-(--radius-card) bg-secondary p-4">
        <Field
          className="min-h-11 items-center gap-4 py-2 has-[>[data-slot=field-content]]:items-center"
          orientation="horizontal"
        >
          <FieldContent className="min-w-0 text-sm leading-5.5">
            <FieldTitle className="text-sm leading-5.5" id={telemetryId}>
              {t('analytics.telemetry.title')}
            </FieldTitle>
            <FieldDescription className="text-xs leading-5" id={`${telemetryId}-description`}>
              {t('analytics.telemetry.desc', { appName: BRANDING_NAME })}
            </FieldDescription>
          </FieldContent>
          <Switch
            aria-describedby={`${telemetryId}-description`}
            aria-labelledby={telemetryId}
            checked={!!checked}
            onCheckedChange={(e) => {
              updateGeneralConfig({ telemetry: e });
            }}
          />
        </Field>
      </div>
    </section>
  );
});

export default Analytics;
