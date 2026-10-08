'use client';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { saveToast } from '@/store/utils/saveToast';

import ProfileRow from './ProfileRow';

const FullNameRow = () => {
  const { t } = useTranslation('auth');
  const fullName = useUserStore(userProfileSelectors.fullName);
  const updateFullName = useUserStore((s) => s.updateFullName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    const value = inputRef.current?.value?.trim();
    if (!value || value === fullName) return;

    try {
      setSaving(true);
      await updateFullName(value);
    } catch (error) {
      console.error('Failed to update fullName:', error);
      saveToast(error, { retry: () => void handleSave(), title: t('profile.saveError') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileRow anchor={'profile-full-name'} label={t('profile.fullName')}>
      <div className="flex items-center gap-2">
        {saving && <Spinner className="opacity-50" />}
        <Input
          aria-label={t('profile.fullName')}
          defaultValue={fullName || ''}
          disabled={saving}
          key={fullName}
          placeholder={t('profile.fullName')}
          ref={inputRef}
          style={{ width: 180, maxWidth: '100%' }}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              handleSave();
            }
          }}
        />
      </div>
    </ProfileRow>
  );
};

export default FullNameRow;
