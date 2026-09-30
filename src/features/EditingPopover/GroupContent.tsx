import { stopPropagation } from '@lobehub/ui';
import { Check, PaletteIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import EmojiPicker from '@/components/EmojiPicker';
import { toast } from '@/components/toast';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import BackgroundSwatches from '@/features/AgentSetting/AgentMeta/BackgroundSwatches';
import GroupAvatar from '@/features/GroupAvatar';
import { useIsDark } from '@/hooks/useIsDark';
import { useFileStore } from '@/store/file';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';
import { useHomeStore } from '@/store/home';

const MAX_AVATAR_SIZE = 1024 * 1024;

interface GroupContentProps {
  avatar?: string;
  backgroundColor?: string;
  id: string;
  memberAvatars?: { avatar?: string; background?: string }[];
  onClose: () => void;
  title: string;
  type: 'group' | 'agentGroup';
}

const GroupContent = memo<GroupContentProps>(
  ({ id, title, avatar, backgroundColor, memberAvatars, type, onClose }) => {
    const { t } = useTranslation('setting');
    const locale = useGlobalStore(globalGeneralSelectors.currentLanguage);
    const isDarkMode = useIsDark();
    const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);

    const isAgentGroup = type === 'agentGroup';

    const [newTitle, setNewTitle] = useState(title);
    const [newAvatar, setNewAvatar] = useState<string | null | undefined>(avatar);
    const [newBackgroundColor, setNewBackgroundColor] = useState(backgroundColor);
    const [uploading, setUploading] = useState(false);

    const handleUpdate = useCallback(async () => {
      const titleChanged = newTitle && title !== newTitle;
      const avatarChanged = isAgentGroup && newAvatar !== avatar;
      const backgroundColorChanged = isAgentGroup && newBackgroundColor !== backgroundColor;

      if (titleChanged || avatarChanged || backgroundColorChanged) {
        try {
          useHomeStore.getState().setGroupUpdatingId(id);

          if (type === 'group') {
            await useHomeStore.getState().updateGroupName(id, newTitle);
          } else {
            await useHomeStore
              .getState()
              .renameAgentGroup(
                id,
                newTitle || title,
                avatarChanged ? newAvatar : undefined,
                backgroundColorChanged ? newBackgroundColor : undefined,
              );
          }
        } finally {
          useHomeStore.getState().setGroupUpdatingId(null);
        }
      }
      onClose();
    }, [
      newTitle,
      newAvatar,
      newBackgroundColor,
      title,
      avatar,
      backgroundColor,
      id,
      type,
      isAgentGroup,
      onClose,
    ]);

    const handleAvatarUpload = useCallback(
      async (file: File) => {
        if (file.size > MAX_AVATAR_SIZE) {
          toast.error(t('settingAgent.avatar.sizeExceeded'));
          return;
        }

        setUploading(true);
        try {
          const result = await uploadWithProgress({ file });
          if (result?.url) {
            setNewAvatar(result.url);
          }
        } finally {
          setUploading(false);
        }
      },
      [uploadWithProgress, t],
    );

    const handleAvatarDelete = useCallback(() => {
      setNewAvatar(null);
    }, []);

    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        });
      });
    }, []);

    return (
      <div className="flex items-center gap-1" style={{ width: 320 }} onClick={stopPropagation}>
        {isAgentGroup && (
          <EmojiPicker
            allowUpload
            allowDelete={!!newAvatar}
            loading={uploading}
            locale={locale}
            shape={'square'}
            value={newAvatar ?? undefined}
            background={
              newBackgroundColor && newBackgroundColor !== 'rgba(0,0,0,0)'
                ? newBackgroundColor
                : undefined
            }
            customRender={(avatarValue) => (
              <div
                className="flex flex-col items-center justify-center"
                style={{ cursor: 'pointer', height: 36, width: 36 }}
                onClick={stopPropagation}
              >
                {avatarValue ? (
                  <Avatar
                    emojiScaleWithBackground
                    avatar={avatarValue}
                    shape={'square'}
                    size={32}
                    background={
                      newBackgroundColor && newBackgroundColor !== 'rgba(0,0,0,0)'
                        ? newBackgroundColor
                        : undefined
                    }
                  />
                ) : (
                  <GroupAvatar
                    avatars={memberAvatars || []}
                    background={newBackgroundColor}
                    size={32}
                  />
                )}
              </div>
            )}
            customTabs={[
              {
                label: (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span style={{ display: 'inline-flex' }}>
                            <PaletteIcon size={{ size: 20, strokeWidth: 2.5 }} />
                          </span>
                        }
                      />
                      <TooltipContent>{t('settingAgent.backgroundColor.title')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ),
                render: () => (
                  <div className="flex flex-col p-2" style={{ width: 332 }}>
                    <BackgroundSwatches
                      gap={8}
                      shape={'square'}
                      size={38}
                      value={newBackgroundColor}
                      onChange={setNewBackgroundColor}
                    />
                  </div>
                ),
                value: 'background',
              },
            ]}
            onChange={setNewAvatar}
            onDelete={handleAvatarDelete}
            onUpload={handleAvatarUpload}
          />
        )}
        <Input
          data-testid="editing-popover-title-input"
          defaultValue={title}
          ref={inputRef}
          style={{ flex: 1 }}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleUpdate();
          }}
        />
        <ActionIcon
          data-testid="editing-popover-save"
          icon={Check}
          size={'small'}
          onClick={handleUpdate}
        />
      </div>
    );
  },
);

export default GroupContent;
