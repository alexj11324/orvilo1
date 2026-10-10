'use client';

import type { InterestAreaKey } from '@orvilo/const';
import type { BuiltinRenderProps, SaveUserQuestionInput } from '@orvilo/types';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const styles = {
  // The identity emoji is a graphic glyph: 48px avatar slot and 28px glyph dimension.
  avatar:
    'inline-flex shrink-0 items-center justify-center box-border size-12 rounded-full [font-size:28px] leading-none bg-fill-quaternary',
  chip: 'inline-flex items-center py-1 px-2.5 rounded-(--radius-chip) text-xs leading-5 text-foreground bg-fill-quaternary',
  detailCard: 'p-4 border border-divider rounded-(--radius-card) bg-muted',
  name: 'line-clamp-1 text-base leading-6 font-semibold text-foreground',
  sectionLabel: 'text-xs leading-5 font-semibold text-muted-foreground',
  value: 'text-sm leading-5.5 font-medium text-foreground',
};

const SaveUserQuestion = memo<BuiltinRenderProps<SaveUserQuestionInput, unknown, unknown>>(
  ({ args }) => {
    const { t } = useTranslation('plugin');
    const { t: tOnboarding } = useTranslation('onboarding');

    const agentName = args?.agentName?.trim();
    const agentEmoji = args?.agentEmoji?.trim();
    const fullName = args?.fullName?.trim();
    const interestLabels = useMemo(() => {
      const predefined = (args?.interests ?? []).map((key) =>
        tOnboarding(`interests.area.${key as InterestAreaKey}`),
      );
      const custom = (args?.customInterests ?? [])
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      return [...predefined, ...custom];
    }, [args?.interests, args?.customInterests, tOnboarding]);

    const hasAgentIdentity = Boolean(agentName || agentEmoji);
    const hasUserProfile = Boolean(fullName);
    const hasInterests = interestLabels.length > 0;

    if (!hasAgentIdentity && !hasUserProfile && !hasInterests) return null;

    return (
      <div className="flex flex-col gap-4">
        {hasAgentIdentity && (
          <div className="flex flex-col gap-2">
            <div className={styles.sectionLabel}>
              {t('builtins.orvilo-web-onboarding.render.agent')}
            </div>
            <div className={styles.detailCard}>
              <div className="flex items-center gap-3">
                <div className={styles.avatar}>{agentEmoji || '🤖'}</div>
                {agentName && <div className={styles.name}>{agentName}</div>}
              </div>
            </div>
          </div>
        )}

        {hasUserProfile && (
          <div className="flex flex-col gap-2">
            <div className={styles.sectionLabel}>
              {t('builtins.orvilo-web-onboarding.render.fullName')}
            </div>
            <div className={styles.detailCard}>
              <div className={styles.value}>{fullName}</div>
            </div>
          </div>
        )}

        {hasInterests && (
          <div className="flex flex-col gap-2">
            <div className={styles.sectionLabel}>
              {t('builtins.orvilo-web-onboarding.render.interests')}
            </div>
            <div className="flex flex-wrap gap-2">
              {interestLabels.map((label) => (
                <span className={styles.chip} key={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);

SaveUserQuestion.displayName = 'WebOnboardingSaveUserQuestion';

export default SaveUserQuestion;
