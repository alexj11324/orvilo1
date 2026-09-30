'use client';

import { confirmModal, Text, toast, Upload } from '@lobehub/ui/base-ui';
import { Form } from 'antd';
import { cssVar } from 'antd-style';
import { CircleHelp, Globe, ImagePlus, Trash2 } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import EmojiPicker from '@/components/EmojiPicker';
import ImperativeModal from '@/components/ImperativeModal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { lambdaClient } from '@/libs/trpc/client';
import { useFileStore } from '@/store/file';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';
import { useServerConfigStore } from '@/store/serverConfig';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import SocialConnectButton from './SocialConnectButton';
import { type MarketUserProfile } from './types';
import useSocialConnect from './useSocialConnect';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB limit

interface ProfileSetupModalProps {
  accessToken: string | null;
  /**
   * Default display name to use (typically from OIDC)
   */
  defaultDisplayName?: string;
  /**
   * Whether this is the first-time setup (after initial sign in)
   */
  isFirstTimeSetup?: boolean;
  onClose: () => void;
  /**
   * Callback when profile is successfully updated
   */
  onSuccess?: (profile: MarketUserProfile) => void;
  open: boolean;
  /**
   * Current user profile (for editing existing profile)
   */
  userProfile?: MarketUserProfile | null;
}

interface CountedControlProps {
  maxLength?: number;
  onChange?: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  prefix?: ReactNode;
  rows?: number;
  value?: string;
}

/** antd Form.Item injects value/onChange into this wrapper, which forwards them to the ReUI input. */
const CountedInput = ({ maxLength, prefix, ...rest }: CountedControlProps) => (
  <div className="relative">
    {prefix && (
      <span
        style={{
          color: cssVar.colorTextSecondary,
          left: 8,
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      >
        {prefix}
      </span>
    )}
    <Input className={prefix ? 'pl-7' : undefined} maxLength={maxLength} {...rest} />
    {maxLength !== undefined && (
      <span
        style={{
          color: cssVar.colorTextSecondary,
          fontSize: 12,
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      >
        {rest.value?.length ?? 0}/{maxLength}
      </span>
    )}
  </div>
);

const CountedTextArea = ({ maxLength, ...rest }: CountedControlProps) => (
  <div className="relative">
    <Textarea maxLength={maxLength} rows={rest.rows} {...rest} />
    {maxLength !== undefined && (
      <span
        style={{
          color: cssVar.colorTextSecondary,
          fontSize: 12,
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      >
        {rest.value?.length ?? 0}/{maxLength}
      </span>
    )}
  </div>
);

interface FormValues {
  description?: string;
  displayName: string;
  userName: string;
  website?: string;
}

const ProfileSetupModal = memo<ProfileSetupModalProps>(
  ({
    open,
    onClose,
    onSuccess,
    accessToken,
    defaultDisplayName,
    userProfile,
    isFirstTimeSetup = false,
  }) => {
    const { t } = useTranslation('marketAuth');

    const [form] = Form.useForm<FormValues>();
    const [loading, setLoading] = useState(false);
    const locale = useGlobalStore(globalGeneralSelectors.currentLanguage);

    // Check if it's in automatic authorization mode
    const enableMarketTrustedClient = useServerConfigStore(
      serverConfigSelectors.enableMarketTrustedClient,
    );

    // Get the current user's avatar as the default value
    const currentUserAvatar = useUserStore(userProfileSelectors.userAvatar);

    // Avatar state
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    // Banner state
    const [bannerUrl, setBannerUrl] = useState<string | null>(null);
    const [bannerUploading, setBannerUploading] = useState(false);

    // Social profiles loading state
    const [isLoadingSocialProfiles, setIsLoadingSocialProfiles] = useState(false);

    // File upload
    const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);

    // Social connect hooks
    const githubConnect = useSocialConnect({
      provider: 'github',
    });

    const twitterConnect = useSocialConnect({
      provider: 'twitter',
    });

    // Fetch social profiles when modal opens
    useEffect(() => {
      if (open && !isFirstTimeSetup) {
        const fetchProfiles = async () => {
          setIsLoadingSocialProfiles(true);
          try {
            await Promise.all([githubConnect.fetchProfile(), twitterConnect.fetchProfile()]);
          } finally {
            setIsLoadingSocialProfiles(false);
          }
        };
        fetchProfiles();
      }
    }, [open, isFirstTimeSetup, githubConnect, twitterConnect]);

    // Reset form when modal opens
    useEffect(() => {
      if (open) {
        // For userName default: use existing userName, or generate from displayName
        const existingUserName = userProfile?.userName;
        const existingDisplayName = userProfile?.displayName || defaultDisplayName || '';
        // Generate default userName from displayName (remove invalid chars, lowercase)
        const generatedUserName = existingDisplayName
          .toLowerCase()
          .replaceAll(/[^\w-]/g, '')
          .slice(0, 32);

        form.setFieldsValue({
          description: userProfile?.description || '',
          displayName: existingDisplayName,
          userName: existingUserName || generatedUserName,
          website: userProfile?.socialLinks?.website || '',
        });

        // Reset avatar and banner
        // Use avatarUrl from userProfile if available, otherwise use the current user's avatar as default
        setAvatarUrl(userProfile?.avatarUrl || currentUserAvatar || null);
        setBannerUrl(userProfile?.bannerUrl || null);
      }
    }, [open, userProfile, defaultDisplayName, form, currentUserAvatar]);

    // Handle avatar change (emoji)
    const handleAvatarChange = useCallback((emoji: string) => {
      setAvatarUrl(emoji);
    }, []);

    // Handle avatar upload
    const handleAvatarUpload = useCallback(
      async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(t('profileSetup.errors.fileTooLarge'));
          return;
        }

        setAvatarUploading(true);
        try {
          const result = await uploadWithProgress({ file });
          if (result?.url) {
            setAvatarUrl(result.url);
          }
        } catch (error) {
          console.error('[ProfileSetupModal] Avatar upload failed:', error);
          toast.error(t('profileSetup.errors.uploadFailed'));
        } finally {
          setAvatarUploading(false);
        }
      },
      [uploadWithProgress, t],
    );

    // Handle avatar delete
    const handleAvatarDelete = useCallback(() => {
      setAvatarUrl(null);
    }, []);

    // Handle banner upload
    const handleBannerUpload = useCallback(
      async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(t('profileSetup.errors.fileTooLarge'));
          return;
        }

        setBannerUploading(true);
        try {
          const result = await uploadWithProgress({ file });
          if (result?.url) {
            setBannerUrl(result.url);
          }
        } catch (error) {
          console.error('[ProfileSetupModal] Banner upload failed:', error);
          toast.error(t('profileSetup.errors.uploadFailed'));
        } finally {
          setBannerUploading(false);
        }
      },
      [uploadWithProgress, t],
    );

    // Handle banner delete
    const handleBannerDelete = useCallback(() => {
      setBannerUrl(null);
    }, []);

    const doSubmit = useCallback(async () => {
      // If not in automatic authorization mode, need to validate accessToken
      if (!enableMarketTrustedClient && !accessToken) {
        toast.error(t('profileSetup.errors.notAuthenticated'));
        return;
      }

      try {
        const values = await form.validateFields();
        setLoading(true);

        // Build socialLinks from OAuth profiles and website input
        const socialLinks: { github?: string; twitter?: string; website?: string } = {};
        if (githubConnect.profile?.username) socialLinks.github = githubConnect.profile.username;
        if (twitterConnect.profile?.username) socialLinks.twitter = twitterConnect.profile.username;
        if (values.website) socialLinks.website = values.website;

        // Build meta object (socialLinks should be inside meta)
        const meta: {
          bannerUrl?: string;
          description?: string;
          socialLinks?: { github?: string; twitter?: string; website?: string };
        } = {};
        if (values.description) meta.description = values.description;
        if (bannerUrl) meta.bannerUrl = bannerUrl;
        if (Object.keys(socialLinks).length > 0) meta.socialLinks = socialLinks;

        const result = await lambdaClient.market.user.updateUserProfile.mutate({
          avatarUrl: avatarUrl || undefined,
          displayName: values.displayName,
          meta: Object.keys(meta).length > 0 ? meta : undefined,
          userName: values.userName,
        });

        toast.success(t('profileSetup.success'));
        // Cast result.user to MarketUserProfile with required fields
        const userProfile: MarketUserProfile = {
          avatarUrl: result.user?.avatarUrl || avatarUrl || null,
          bannerUrl: bannerUrl || null,
          createdAt: result.user?.createdAt || new Date().toISOString(),
          description: values.description || null,
          displayName: values.displayName || null,
          id: result.user?.id || 0,
          namespace: result.user?.namespace || '',
          socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
          type: result.user?.type || null,
          userName: values.userName || null,
        };

        onSuccess?.(userProfile);
        onClose();
      } catch (error) {
        console.error('[ProfileSetupModal] Update failed:', error);
        if (error instanceof Error && error.message !== 'Validation failed') {
          // Check for username taken error (tRPC CONFLICT code)
          const errorMessage = error.message || '';
          if (
            errorMessage.toLowerCase().includes('already taken') ||
            errorMessage.includes('CONFLICT')
          ) {
            toast.error(t('profileSetup.errors.usernameTaken'));
          } else {
            toast.error(t('profileSetup.errors.updateFailed'));
          }
        }
      } finally {
        setLoading(false);
      }
    }, [
      accessToken,
      avatarUrl,
      bannerUrl,
      enableMarketTrustedClient,
      form,
      githubConnect.profile,
      twitterConnect.profile,
      onClose,
      onSuccess,
      t,
    ]);

    const handleSubmit = useCallback(async () => {
      try {
        const values = await form.validateFields();
        const oldUserName = userProfile?.userName;

        // If userName changed and it's not first-time setup, show confirmation
        if (!isFirstTimeSetup && oldUserName && values.userName !== oldUserName) {
          confirmModal({
            cancelText: t('profileSetup.confirmChangeUserId.cancel'),
            content: t('profileSetup.confirmChangeUserId.description', {
              newId: values.userName,
              oldId: oldUserName,
            }),
            okButtonProps: { danger: true },
            okText: t('profileSetup.confirmChangeUserId.confirm'),
            title: t('profileSetup.confirmChangeUserId.title'),
            onOk: doSubmit,
          });
          return;
        }

        await doSubmit();
      } catch {
        // validateFields failed, form will show errors
      }
    }, [doSubmit, form, isFirstTimeSetup, t, userProfile?.userName]);

    const handleCancel = useCallback(() => {
      if (!isFirstTimeSetup) {
        onClose();
      }
    }, [isFirstTimeSetup, onClose]);

    return (
      <ImperativeModal
        centered
        cancelButtonProps={isFirstTimeSetup ? { style: { display: 'none' } } : undefined}
        cancelText={t('profileSetup.cancel')}
        closable={!isFirstTimeSetup}
        confirmLoading={loading}
        keyboard={!isFirstTimeSetup}
        maskClosable={!isFirstTimeSetup}
        okText={isFirstTimeSetup ? t('profileSetup.getStarted') : t('profileSetup.save')}
        open={open}
        width={640}
        title={
          <div className="flex flex-col gap-1">
            <Text strong fontSize={16} lineHeight={1.4}>
              {isFirstTimeSetup ? t('profileSetup.titleFirstTime') : t('profileSetup.titleEdit')}
            </Text>
            <Text fontSize={13} lineHeight={1.4} type="secondary">
              {isFirstTimeSetup
                ? t('profileSetup.descriptionFirstTime')
                : t('profileSetup.descriptionEdit')}
            </Text>
          </div>
        }
        onCancel={handleCancel}
        onOk={handleSubmit}
      >
        <Form form={form} layout="vertical">
          <div className="flex gap-6">
            <div className="flex flex-1 flex-col">
              <Form.Item
                label={t('profileSetup.fields.displayName.label')}
                name="displayName"
                rules={[
                  { message: t('profileSetup.fields.displayName.required'), required: true },
                  {
                    max: 50,
                    message: t('profileSetup.fields.displayName.maxLength'),
                  },
                ]}
              >
                <CountedInput
                  maxLength={50}
                  placeholder={t('profileSetup.fields.displayName.placeholder')}
                />
              </Form.Item>
              <Form.Item
                name="userName"
                label={
                  <div className="flex items-center gap-1">
                    {t('profileSetup.fields.userName.label')}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          render={<CircleHelp size={14} style={{ cursor: 'help', opacity: 0.5 }} />}
                        />
                        <TooltipContent>{t('profileSetup.fields.userName.tooltip')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                }
                rules={[
                  { message: t('profileSetup.fields.userName.required'), required: true },
                  {
                    message: t('profileSetup.fields.userName.pattern'),
                    pattern: /^[\w-]+$/,
                  },
                  {
                    max: 32,
                    message: t('profileSetup.fields.userName.maxLength'),
                  },
                  {
                    message: t('profileSetup.fields.userName.minLength'),
                    min: 3,
                  },
                ]}
              >
                <CountedInput
                  maxLength={32}
                  placeholder={t('profileSetup.fields.userName.placeholder')}
                  prefix="@"
                />
              </Form.Item>
            </div>
            {/* Avatar Section */}
            <Form.Item>
              <EmojiPicker
                allowDelete={!!avatarUrl}
                loading={avatarUploading}
                locale={locale}
                shape="square"
                size={80}
                value={avatarUrl || undefined}
                allowUpload={{
                  enableEmoji: false,
                }}
                onChange={handleAvatarChange}
                onDelete={handleAvatarDelete}
                onUpload={handleAvatarUpload}
              />
            </Form.Item>
          </div>
          <Form.Item
            label={t('profileSetup.fields.description.label')}
            name="description"
            rules={[
              {
                max: 200,
                message: t('profileSetup.fields.description.maxLength'),
              },
            ]}
          >
            <CountedTextArea
              maxLength={200}
              placeholder={t('profileSetup.fields.description.placeholder')}
              rows={3}
            />
          </Form.Item>

          {/* Only show banner and social links in edit mode, not first-time setup */}
          {!isFirstTimeSetup && (
            <>
              {/* Banner Upload Section */}
              <Form.Item
                label={
                  <div className="flex items-center gap-1">
                    {t('profileSetup.fields.bannerUrl.label')}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          render={<CircleHelp size={14} style={{ cursor: 'help', opacity: 0.5 }} />}
                        />
                        <TooltipContent>
                          {t('profileSetup.fields.bannerUrl.tooltip')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                }
              >
                <div className="flex w-full flex-col gap-2">
                  <Upload
                    accept="image/*"
                    beforeUpload={handleBannerUpload}
                    maxCount={1}
                    style={{ display: 'block', width: '100%' }}
                  >
                    <div
                      style={{
                        backgroundColor: bannerUrl ? undefined : cssVar.colorFillTertiary,
                        backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined,
                        backgroundPosition: 'center',
                        backgroundSize: 'cover',
                        borderRadius: cssVar.borderRadiusLG,
                        cursor: 'pointer',
                        height: 120,
                        overflow: 'hidden',
                        position: 'relative',
                        width: '100%',
                      }}
                    >
                      <div
                        className="flex flex-col items-center justify-center"
                        style={{
                          background: bannerUrl ? 'rgba(0,0,0,0.4)' : 'transparent',
                          height: '100%',
                          opacity: bannerUrl ? 0 : 1,
                          transition: 'opacity 0.2s',
                          width: '100%',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                          if (bannerUrl) e.currentTarget.style.opacity = '0';
                        }}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <ImagePlus
                            size={24}
                            style={{ color: bannerUrl ? '#fff' : cssVar.colorTextSecondary }}
                          />
                          <Text
                            style={{
                              color: bannerUrl ? '#fff' : cssVar.colorTextSecondary,
                              fontSize: 12,
                            }}
                          >
                            {bannerUploading
                              ? t('profileSetup.fields.bannerUrl.uploading')
                              : t('profileSetup.fields.bannerUrl.clickToUpload')}
                          </Text>
                        </div>
                      </div>
                    </div>
                  </Upload>
                  {bannerUrl && (
                    <div className="flex items-center justify-end gap-2">
                      <Text
                        style={{
                          color: cssVar.colorError,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBannerDelete();
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <Trash2 size={12} />
                          {t('profileSetup.fields.bannerUrl.remove')}
                        </div>
                      </Text>
                    </div>
                  )}
                </div>
              </Form.Item>

              <Text style={{ display: 'block', marginBottom: 12 }} type="secondary">
                {t('profileSetup.socialLinks.title')}
              </Text>

              {/* GitHub OAuth Connect Button */}
              <div className="flex flex-col gap-3" style={{ marginBottom: 16 }}>
                <SocialConnectButton
                  disabled={isLoadingSocialProfiles}
                  isConnecting={githubConnect.isConnecting}
                  isDisconnecting={githubConnect.isDisconnecting}
                  profile={githubConnect.profile}
                  provider="github"
                  onConnect={githubConnect.connect}
                  onDisconnect={githubConnect.disconnect}
                />

                {/* Twitter OAuth Connect Button */}
                <SocialConnectButton
                  disabled={isLoadingSocialProfiles}
                  isConnecting={twitterConnect.isConnecting}
                  isDisconnecting={twitterConnect.isDisconnecting}
                  profile={twitterConnect.profile}
                  provider="twitter"
                  onConnect={twitterConnect.connect}
                  onDisconnect={twitterConnect.disconnect}
                />
              </div>

              {/* Website - Manual Input */}
              <Form.Item
                name="website"
                rules={[
                  {
                    message: t('profileSetup.fields.website.invalidUrl'),
                    type: 'url',
                  },
                ]}
              >
                <CountedInput
                  placeholder={t('profileSetup.fields.website.placeholder')}
                  prefix={<Globe size={14} />}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </ImperativeModal>
    );
  },
);

ProfileSetupModal.displayName = 'ProfileSetupModal';

export default ProfileSetupModal;
