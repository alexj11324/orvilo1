import { isDesktop } from '@orvilo/const';
import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { type OrviloToolCustomPlugin } from '@orvilo/types';
import { useResponsive } from 'antd-style';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form from '@/components/GroupForm';
import { toast } from '@/components/toast';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogConfirm,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import MCPManifestForm from './MCPManifestForm';
import PluginPreview from './PluginPreview';

interface DevModalProps {
  /** Enable the connector-backed OAuth auth type in the MCP form (see MCPManifestForm). */
  enableOAuth?: boolean;
  mode?: 'edit' | 'create';
  onDelete?: () => void;
  onOpenChange: (open: boolean) => void;
  onSave?: (
    value: OrviloToolCustomPlugin,
    ctx?: { oauthPopup?: Window | null },
  ) => Promise<void> | void;
  onValueChange?: (value: Partial<OrviloToolCustomPlugin>) => void;
  open?: boolean;
  value?: OrviloToolCustomPlugin;
}

const DevModal = memo<DevModalProps>(
  ({
    open,
    mode = 'create',
    value,
    onValueChange,
    onSave,
    onOpenChange,
    onDelete,
    enableOAuth,
  }) => {
    const isEditMode = mode === 'edit';
    const { t } = useTranslation('plugin');

    const [submitting, setSubmitting] = useState(false);

    const { mobile } = useResponsive();
    const [form] = Form.useForm();
    const authType = Form.useWatch(['customParams', 'mcp', 'auth', 'type'], form);

    // Seed the form once per modal open, waiting for `value` to arrive (it may
    // be undefined initially while edit-mode credentials are being fetched).
    const seededRef = useRef(false);
    useEffect(() => {
      if (!open) {
        seededRef.current = false;
        return;
      }
      if (value !== undefined && !seededRef.current) {
        form.setFieldsValue(value);
        seededRef.current = true;
      }
    }, [open, value]);

    const doSave = async (values: OrviloToolCustomPlugin, ctx?: { oauthPopup?: Window | null }) => {
      if (!onSave) {
        toast.success(t(isEditMode ? 'dev.updateSuccess' : 'dev.saveSuccess'));
        onOpenChange(false);
        return;
      }
      setSubmitting(true);
      try {
        await onSave(values, ctx);
        toast.success(t(isEditMode ? 'dev.updateSuccess' : 'dev.saveSuccess'));
        onOpenChange(false);
      } catch (error) {
        console.error('[DevModal] Install failed:', error);
        const httpStatus = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;
        toast.error(
          httpStatus === 403
            ? t(
                'dev.permissionDenied',
                'You are not allowed to modify this connector — only the creator or a workspace owner can',
              )
            : t('dev.saveError'),
        );
      } finally {
        setSubmitting(false);
      }
    };

    // OAuth needs window.open within the user-gesture tick (browsers block it
    // after an async boundary). Open a blank popup synchronously here, validate,
    // then hand it to onSave which navigates it to the authorize URL. Shared by
    // the footer save button and the in-form "Authorize" button.
    const runOAuthFlow = async () => {
      const popup = window.open('about:blank', 'orvilo-connector-oauth', 'width=600,height=720');
      try {
        const values = (await form.validateFields()) as OrviloToolCustomPlugin;
        await doSave(values, { oauthPopup: popup });
      } catch {
        popup?.close();
      }
    };

    const handlePrimaryClick = () => {
      if (enableOAuth && authType === 'oauth2') return runOAuthFlow();
      form.submit();
    };

    useEffect(() => {
      if (mode === 'create' && !open) form.resetFields();
    }, [open]);

    const buttonStyle = mobile ? { flex: 1 } : { margin: 0 };

    const footer = (
      <div className="flex flex-row flex-1 gap-3 justify-between">
        {isEditMode ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button style={buttonStyle} variant="destructive">
                  {t('delete', { ns: 'common' })}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('dev.confirmDeleteDevPlugin')}</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel', { ns: 'common' })}</AlertDialogCancel>
                <AlertDialogConfirm
                  variant="destructive"
                  onClick={() => {
                    onDelete?.();
                    toast.success(t('dev.deleteSuccess'));
                  }}
                >
                  {t('ok', { ns: 'common' })}
                </AlertDialogConfirm>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div />
        )}
        <div className="flex flex-row gap-3">
          <Button
            size="lg"
            style={buttonStyle}
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button
            loading={submitting}
            size="lg"
            style={buttonStyle}
            variant={'default'}
            onClick={handlePrimaryClick}
          >
            {t(isEditMode ? 'dev.update' : 'dev.save')}
          </Button>
        </div>
      </div>
    );

    return (
      <Form.Provider
        onFormChange={() => {
          onValueChange?.(form.getFieldsValue());
        }}
        onFormFinish={async (_, info) => {
          await doSave(info.values as OrviloToolCustomPlugin);
        }}
      >
        <Sheet open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
          <SheetContent
            className="gap-0"
            side="bottom"
            style={{ height: isDesktop ? `calc(100vh - ${TITLE_BAR_HEIGHT}px)` : '100vh' }}
          >
            <SheetHeader>
              <SheetTitle>
                {t(isEditMode ? 'dev.title.skillSettings' : 'dev.title.create')}
              </SheetTitle>
            </SheetHeader>
            <div
              className="flex-1 min-h-0"
              style={{ marginInline: 'auto', maxWidth: mobile ? '100%' : 800, width: '100%' }}
            >
              <div
                className="flex flex-row gap-0 h-[100%]"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <div className="flex flex-col gap-4 p-6" style={{ overflowY: 'auto', flex: 3 }}>
                  <MCPManifestForm
                    enableOAuth={enableOAuth}
                    form={form}
                    isEditMode={isEditMode}
                    onAuthorizeOAuth={runOAuthFlow}
                  />
                </div>
                <PluginPreview form={form} />
              </div>
            </div>
            <SheetFooter>{footer}</SheetFooter>
          </SheetContent>
        </Sheet>
      </Form.Provider>
    );
  },
);

export default DevModal;
