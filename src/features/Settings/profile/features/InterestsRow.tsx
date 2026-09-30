'use client';
import type { InterestAreaKey } from '@orvilo/const';
import { normalizeInterestsForStorage, resolveInterestAreaKey } from '@orvilo/const';
import { BriefcaseIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { INTEREST_AREAS } from '@/features/Onboarding/config';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { saveToast } from '@/store/utils/saveToast';

import ProfileRow from './ProfileRow';

const InterestsRow = () => {
  const { t } = useTranslation('auth');
  const { t: tOnboarding } = useTranslation('onboarding');
  const interests = useUserStore(userProfileSelectors.interests);
  const updateInterests = useUserStore((s) => s.updateInterests);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const normalizedInterests = useMemo(() => normalizeInterestsForStorage(interests), [interests]);

  const saveInterests = useCallback(
    async (updated: string[]) => {
      try {
        await updateInterests(updated);
      } catch (error) {
        console.error('Failed to update interests:', error);
        saveToast(error, {
          retry: () => void saveInterests(updated),
          title: t('profile.saveError'),
        });
      }
    },
    [updateInterests, t],
  );

  const areas = useMemo(
    () =>
      INTEREST_AREAS.map((area) => ({
        ...area,
        label: tOnboarding(`interests.area.${area.key}`),
      })),
    [tOnboarding],
  );

  const toggleInterest = useCallback(
    async (key: InterestAreaKey) => {
      const updated = normalizedInterests.includes(key)
        ? normalizedInterests.filter((i) => i !== key)
        : [...normalizedInterests, key];

      await saveInterests(updated);
    },
    [normalizedInterests, saveInterests],
  );

  const removeCustomInterest = useCallback(
    async (interest: string) => {
      const updated = normalizedInterests.filter((i) => i !== interest);

      await saveInterests(updated);
    },
    [normalizedInterests, saveInterests],
  );

  const handleAddCustom = useCallback(async () => {
    const trimmed = customInput.trim();
    if (!trimmed || normalizedInterests.includes(trimmed)) return;

    const updated = [...normalizedInterests, trimmed];
    setCustomInput('');

    await saveInterests(updated);
  }, [customInput, normalizedInterests, saveInterests]);

  return (
    <ProfileRow anchor={'profile-interests'} label={t('profile.interests')}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {areas.map((item) => {
            const isSelected = normalizedInterests.includes(item.key);
            return (
              <Button
                aria-pressed={isSelected}
                className={isSelected ? 'bg-muted' : undefined}
                key={item.key}
                type="button"
                variant="outline"
                onClick={() => toggleInterest(item.key)}
              >
                <item.icon className="shrink-0" size={14} />
                <span>{item.label}</span>
              </Button>
            );
          })}
          {normalizedInterests
            .filter((i) => !resolveInterestAreaKey(i))
            .map((interest) => (
              <Button
                key={interest}
                type="button"
                variant="outline"
                onClick={() => removeCustomInterest(interest)}
              >
                <span>{interest}</span>
              </Button>
            ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowCustomInput(!showCustomInput)}
          >
            <BriefcaseIcon className="shrink-0" size={14} />
            <span>{tOnboarding('interests.area.other')}</span>
          </Button>
        </div>
        {showCustomInput && (
          <Input
            placeholder={tOnboarding('interests.placeholder')}
            style={{ width: 200 }}

            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                handleAddCustom();
              }
            }}
          />
        )}
      </div>
    </ProfileRow>
  );
};

export default InterestsRow;
