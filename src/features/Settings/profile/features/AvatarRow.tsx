'use client';

import { PencilIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui/spinner';
import { Upload } from '@/components/Upload';
import UserAvatar from '@/features/User/UserAvatar';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';
import { saveToast } from '@/store/utils/saveToast';
import { imageToBase64 } from '@/utils/imageToBase64';
import { createUploadImageHandler } from '@/utils/uploadFIle';

import ProfileRow from './ProfileRow';

const AvatarRow = () => {
  const { t } = useTranslation('auth');
  const isLogin = useUserStore(authSelectors.isLogin);
  const updateAvatar = useUserStore((s) => s.updateAvatar);
  const [uploading, setUploading] = useState(false);

  const saveAvatar = useCallback(
    async (avatar: string) => {
      try {
        setUploading(true);
        const img = new Image();
        img.src = avatar;

        await new Promise((resolve, reject) => {
          img.addEventListener('load', resolve);
          img.addEventListener('error', reject);
        });

        const webpBase64 = imageToBase64({ img, size: 256 });
        await updateAvatar(webpBase64);
      } catch (error) {
        console.error('Failed to upload avatar:', error);
        saveToast(error, {
          retry: () => void saveAvatar(avatar),
          title: t('profile.avatarUploadError'),
        });
      } finally {
        setUploading(false);
      }
    },
    [updateAvatar, t],
  );

  const handleUploadAvatar = useMemo(() => createUploadImageHandler(saveAvatar), [saveAvatar]);

  const canUpload = isLogin;

  const avatarContent = canUpload ? (
    <Upload beforeUpload={handleUploadAvatar} maxCount={1}>
      <div className="group relative cursor-pointer overflow-hidden rounded-lg">
        <UserAvatar size={40} />
        <div
          className={`${'absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100'} avatar-edit-overlay`}
          style={uploading ? { opacity: 1 } : undefined}
        >
          {uploading ? (
            <Spinner className="size-4 text-white" />
          ) : (
            <PencilIcon className="size-4 text-white" />
          )}
        </div>
      </div>
    </Upload>
  ) : (
    <UserAvatar size={40} />
  );

  return (
    <ProfileRow action={avatarContent} anchor={'profile-avatar'} label={t('profile.avatar')} />
  );
};

export default AvatarRow;
