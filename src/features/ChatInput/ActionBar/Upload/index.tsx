import { validateVideoFileSize } from '@orvilo/utils/client';
import { css, cx } from 'antd-style';
import { FileUp, FolderUp, ImageUp, Paperclip } from 'lucide-react';
import { memo, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';

import TipGuide from '@/components/TipGuide';
import { toast } from '@/components/toast';
import { Upload } from '@/components/Upload';
import { useMediaUploadAbility } from '@/hooks/useMediaUploadAbility';
import { usePermission } from '@/hooks/usePermission';
import { useFileStore } from '@/store/file';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import { useEffectiveModel } from '../../hooks/useEffectiveModel';
import { SimpleTooltip } from '../../SimpleTooltip';
import { useChatInputStore } from '../../store';
import { type ActionDropdownMenuItems } from '../components/ActionDropdown';
import { ChatInputAction } from '../components/ChatInputAction';
import { MENU_ICON_SIZE, useKnowledgeMenuItems } from './useKnowledgeMenuItems';

const hotArea = css`
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-color: transparent;
  }
`;

const FileUpload = memo(() => {
  const { t } = useTranslation('chat');

  const enableKnowledgeBase = useServerConfigStore(
    (s) => featureFlagsSelectors(s).enableKnowledgeBase,
  );

  const upload = useFileStore((s) => s.uploadChatFiles);
  const editor = useChatInputStore((s) => s.editor);

  const agentId = useAgentId();
  const { model, provider } = useEffectiveModel(agentId);

  const { canUploadImage, canUploadVideo, canUploadAudio } = useMediaUploadAbility(
    model,
    provider,
    agentId,
  );

  const [showTip, updateGuideState] = useUserStore((s) => [
    preferenceSelectors.showUploadFileInKnowledgeBaseTip(s),
    s.updateGuideState,
  ]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const knowledgeItems = useKnowledgeMenuItems({ onUpdatingChange: setUpdating });

  // Viewer doesn't have `file:upload` permission — backend would 403.
  // Render the disabled paperclip with a tooltip so the entry stays visible
  // (per disabled-not-hidden UX rule), but block the dropdown which would
  // otherwise let users trigger the upload anyway.
  const { allowed: canUpload, reason } = usePermission('create_content');

  if (!enableKnowledgeBase) return null;

  if (!canUpload) {
    return (
      <SimpleTooltip title={reason}>
        <ChatInputAction
          disabled
          icon={Paperclip}
          showTooltip={false}
          title={t('upload.action.tooltip')}
        />
      </SimpleTooltip>
    );
  }

  const uploadItems: ActionDropdownMenuItems = [
    {
      closeOnClick: false,
      disabled: !canUploadImage,
      icon: (
        <span className="anticon" role="img">
          <ImageUp
            fill={'transparent'}
            height={MENU_ICON_SIZE}
            size={MENU_ICON_SIZE}
            width={MENU_ICON_SIZE}
          />
        </span>
      ),
      key: 'upload-image',
      label: canUploadImage ? (
        <Upload
          multiple
          accept={'image/*'}

          beforeUpload={async (file) => {
            setDropdownOpen(false);
            editor?.focus();
            await upload([file], agentId);

            return false;
          }}
        >
          <div className={cx(hotArea)}>{t('upload.action.imageUpload')}</div>
        </Upload>
      ) : (
        <SimpleTooltip side={'right'} title={t('upload.action.imageDisabled')}>
          <div className={cx(hotArea)}>{t('upload.action.imageUpload')}</div>
        </SimpleTooltip>
      ),
    },
    {
      closeOnClick: false,
      icon: (
        <span className="anticon" role="img">
          <FileUp
            fill={'transparent'}
            height={MENU_ICON_SIZE}
            size={MENU_ICON_SIZE}
            width={MENU_ICON_SIZE}
          />
        </span>
      ),
      key: 'upload-file',
      label: (
        <Upload
          multiple

          beforeUpload={async (file) => {
            if (
              (file.type.startsWith('image') && !canUploadImage) ||
              (file.type.startsWith('video') && !canUploadVideo) ||
              (file.type.startsWith('audio') && !canUploadAudio)
            )
              return false;

            // Validate video file size
            const validation = validateVideoFileSize(file);
            if (!validation.isValid) {
              toast.error(
                t('upload.validation.videoSizeExceeded', {
                  actualSize: validation.actualSize,
                  maxSize: validation.maxSize,
                }),
              );
              return false;
            }

            setDropdownOpen(false);
            editor?.focus();
            await upload([file], agentId);

            return false;
          }}
        >
          <div className={cx(hotArea)}>{t('upload.action.fileUpload')}</div>
        </Upload>
      ),
    },
    {
      closeOnClick: false,
      icon: (
        <span className="anticon" role="img">
          <FolderUp
            fill={'transparent'}
            height={MENU_ICON_SIZE}
            size={MENU_ICON_SIZE}
            width={MENU_ICON_SIZE}
          />
        </span>
      ),
      key: 'upload-folder',
      label: (
        <Upload
          directory
          multiple={true}

          beforeUpload={async (file) => {
            if (
              (file.type.startsWith('image') && !canUploadImage) ||
              (file.type.startsWith('video') && !canUploadVideo) ||
              (file.type.startsWith('audio') && !canUploadAudio)
            )
              return false;

            // Validate video file size
            const validation = validateVideoFileSize(file);
            if (!validation.isValid) {
              toast.error(
                t('upload.validation.videoSizeExceeded', {
                  actualSize: validation.actualSize,
                  maxSize: validation.maxSize,
                }),
              );
              return false;
            }

            setDropdownOpen(false);
            editor?.focus();
            await upload([file], agentId);

            return false;
          }}
        >
          <div className={cx(hotArea)}>{t('upload.action.folderUpload')}</div>
        </Upload>
      ),
    },
  ];

  const items: ActionDropdownMenuItems = [...uploadItems, ...knowledgeItems];

  const content = (
    <ChatInputAction
      icon={Paperclip}
      loading={updating}
      open={dropdownOpen}
      showTooltip={false}
      title={t('upload.action.tooltip')}
      trigger={['click', 'hover']}
      dropdown={{
        maxHeight: 500,
        maxWidth: 480,
        menu: { items },
        minWidth: 240,
      }}
      onOpenChange={setDropdownOpen}
    />
  );

  return (
    <Suspense
      fallback={<ChatInputAction disabled icon={Paperclip} title={t('upload.action.tooltip')} />}
    >
      {showTip ? (
        <TipGuide
          open={showTip}
          placement={'top'}
          title={t('knowledgeBase.uploadGuide')}
          onOpenChange={() => {
            updateGuideState({ uploadFileInKnowledgeBase: false });
          }}
        >
          {content}
        </TipGuide>
      ) : (
        content
      )}
    </Suspense>
  );
});

export default FileUpload;
