'use client';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { useUserStore } from '@/store/user';
import { saveToast } from '@/store/utils/saveToast';

import ProfileRow from './ProfileRow';

export const JobTitleRow = () => {
  const { t } = useTranslation('auth');
  const jobTitle = useUserStore((s) => s.user?.jobTitle ?? '');
  const updateJobTitle = useUserStore((s) => s.updateJobTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = inputRef.current?.value.trim() ?? '';
    if (saving || value === jobTitle) return;
    setSaving(true);
    try {
      await updateJobTitle(value);
    } catch (error) {
      console.error('Failed to update job title:', error);
      saveToast(error, { retry: () => void save(), title: t('profile.saveError') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileRow
      anchor={'profile-job-title'}
      description={t('profile.jobTitleDescription')}
      label={t('profile.jobTitle')}
    >
      <Input
        aria-label={t('profile.jobTitle')}
        defaultValue={jobTitle}
        disabled={saving}
        key={jobTitle}
        maxLength={128}
        placeholder={t('profile.jobTitlePlaceholder')}
        ref={inputRef}
        style={{ width: 180, maxWidth: '100%' }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            void save();
          }
        }}
      />
    </ProfileRow>
  );
};
