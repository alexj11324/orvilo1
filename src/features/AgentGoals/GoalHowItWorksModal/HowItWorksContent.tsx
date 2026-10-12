'use client';

import { RotateCcwIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
} from '@/components/reui/stepper';

const styles = {
  loopBack: 'p-4 border border-dashed border-divider rounded-(--radius-card)',
  loopIcon: 'flex-none text-foreground-quaternary',
};

/**
 * The mechanism behind a goal: what each round does and how it ends.
 *
 * This used to sit inline on the empty state, where it pushed the actual
 * starting points (the create button and the seeded examples) below the fold
 * on every visit — including the tenth one, when the user already knows how it
 * works. It now lives behind a hint at the bottom of the empty state, so the
 * explanation is one click away instead of a permanent tax.
 *
 * The three steps run as a vertical `Steps`: they are a sequence, and the rail
 * that connects them carries that ordering better than three separate cards.
 * `current={-1}` leaves every step in its neutral state — this explains the
 * loop, it does not track a run's progress.
 */
const HowItWorksContent = memo(() => {
  const { t } = useTranslation('chat');

  return (
    <div className="flex flex-col gap-3">
      <Stepper orientation={'vertical'} value={0}>
        <StepperNav>
          {[1, 2, 3].map((index) => (
            <StepperItem key={index} step={index}>
              <div className="flex items-start gap-2">
                <StepperIndicator className="text-xs leading-5">{index}</StepperIndicator>
                <div className="flex flex-col">
                  <StepperTitle className="text-base leading-6 font-semibold">
                    {t(`goalEmpty.step${index}.title` as never)}
                  </StepperTitle>
                  <StepperDescription className="text-sm leading-5.5">
                    {t(`goalEmpty.step${index}.desc` as never)}
                  </StepperDescription>
                </div>
              </div>
              {index < 3 && <StepperSeparator />}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>
      <div className={`flex items-start gap-2 ${styles.loopBack}`}>
        <RotateCcwIcon className={styles.loopIcon} size={16} />
        <div className="text-sm leading-5.5 text-muted-foreground">{t('goalEmpty.loop')}</div>
      </div>
    </div>
  );
});

HowItWorksContent.displayName = 'GoalHowItWorksContent';

export default HowItWorksContent;
