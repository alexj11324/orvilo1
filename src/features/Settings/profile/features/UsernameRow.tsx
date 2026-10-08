'use client';
import { type ChangeEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import ProfileRow from './ProfileRow';

const UsernameRow = () => {
  const { t } = useTranslation('auth');
  const username = useUserStore(userProfileSelectors.username);
  const updateUsername = useUserStore((s) => s.updateUsername);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const usernameRegex = /^\w+$/;

  const validateUsername = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return t('profile.usernameRequired');
    if (trimmed.length > 64) return t('profile.usernameTooLong');
    if (!usernameRegex.test(trimmed)) return t('profile.usernameRule');
    return '';
  };

  const handleSave = useCallback(async () => {
    const value = inputRef.current?.value?.trim();
    if (!value || value === username) {
      setError('');
      return;
    }

    const validationError = validateUsername(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');
      await updateUsername(value);
      setDirty(false);
    } catch (err: any) {
      console.error('Failed to update username:', err);
      if (err?.data?.code === 'CONFLICT' || err?.message === 'USERNAME_TAKEN') {
        setError(t('profile.usernameDuplicate'));
      } else {
        setError(t('profile.usernameUpdateFailed'));
      }
    } finally {
      setSaving(false);
    }
  }, [username, updateUsername, t]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDirty(value.trim() !== (username || ''));
    if (!value.trim()) {
      setError('');
      return;
    }
    if (!usernameRegex.test(value)) {
      setError(t('profile.usernameRule'));
      return;
    }
    setError('');
  };

  const handleCancel = useCallback(() => {
    if (inputRef.current) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(inputRef.current, username || '');
      inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setError('');
    setDirty(false);
    inputRef.current?.blur();
  }, [username]);

  return (
    <ProfileRow
      anchor={'profile-username'}
      description={t('profile.usernameDescription')}
      label={t('profile.username')}
    >
      <div className="flex items-center gap-2">
        {saving && <Spinner className="opacity-50" />}
        {error && (
          <span className="text-sm text-destructive" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {error}
          </span>
        )}
        {dirty && !saving && (
          <Button
            size="sm"
            type="button"
            variant="outline"
            onMouseDown={(e) => {
              e.preventDefault();
              handleCancel();
            }}
          >
            {t('profile.cancel')}
          </Button>
        )}
        <Input
          aria-invalid={error ? true : undefined}
          aria-label={t('profile.username')}
          defaultValue={username || ''}
          disabled={saving}
          key={username}
          placeholder={t('profile.usernamePlaceholder')}
          ref={inputRef}
          style={{ width: 180, maxWidth: '100%' }}
          onBlur={handleSave}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              void handleSave();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              handleCancel();
            }
          }}
        />
      </div>
    </ProfileRow>
  );
};

export default UsernameRow;
