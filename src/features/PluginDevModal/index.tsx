import { isDesktop } from '@orvilo/const';
import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { type OrviloToolCustomPlugin } from '@orvilo/types';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type FieldPath, FormProvider, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

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
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSingleton } from '@/hooks/useSingleton';

import MCPManifestForm from './MCPManifestForm';
import {
  createMcpDevDefaults,
  getMcpDevPayload,
  type McpDevFormValues,
  setMcpDevValues,
} from './MCPManifestForm/utils';
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

    const mobile = useIsMobile();
    const form = useForm<McpDevFormValues>({
      defaultValues: createMcpDevDefaults(),
      mode: 'onChange',
      shouldUnregister: false,
    });
    const mountedFields = useSingleton(() => new Set<FieldPath<McpDevFormValues>>());
    const onFieldMount = useCallback(
      (name: FieldPath<McpDevFormValues>, mounted: boolean) => {
        if (mounted) mountedFields.add(name);
        else mountedFields.delete(name);
      },
      [mountedFields],
    );
    const getPayload = (values: McpDevFormValues) =>
      getMcpDevPayload(values, enableOAuth, [...mountedFields]);
    const authType = useWatch({ control: form.control, name: 'customParams.mcp.auth.type' });

    useEffect(() => {
      const subscription = form.watch((_, info) => {
        // Programmatic seeds/imports/reset update the preview without reporting a user edit.
        if (info.type === 'change')
          onValueChange?.(
            getMcpDevPayload(form.getValues(), enableOAuth, [
              ...mountedFields,
            ]) as Partial<OrviloToolCustomPlugin>,
          );
      });
      return () => subscription.unsubscribe();
    }, [form, onValueChange, enableOAuth, mountedFields]);

    // Seed the form once per modal open, waiting for `value` to arrive (it may
    // be undefined initially while edit-mode credentials are being fetched).
    const seededRef = useRef(false);
    useEffect(() => {
      if (!open) {
        seededRef.current = false;
        return;
      }
      if (value !== undefined && !seededRef.current) {
        setMcpDevValues(form, value);
        seededRef.current = true;
      }
    }, [form, open, value]);

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
        const isValid = await form.trigger([...mountedFields]);
        if (!isValid) {
          popup?.close();
          return;
        }
        const values = getPayload(form.getValues()) as OrviloToolCustomPlugin;
        await doSave(values, { oauthPopup: popup });
      } catch {
        popup?.close();
      }
    };

    const handleSubmit = form.handleSubmit(async (values) => {
      await doSave(getPayload(values) as OrviloToolCustomPlugin);
    });

    const handlePrimaryClick = () => {
      if (enableOAuth && authType === 'oauth2') return runOAuthFlow();
      void handleSubmit();
    };

    useEffect(() => {
      if (mode === 'create' && !open) form.reset(createMcpDevDefaults());
    }, [form, mode, open]);

    const buttonClassName = mobile ? 'flex-1' : 'm-0';

    const footer = (
      <div className="flex flex-row flex-1 gap-3 justify-between">
        {isEditMode ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button className={buttonClassName} variant="destructive">
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
            className={buttonClassName}
            size="lg"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button
            className={buttonClassName}
            loading={submitting}
            size="lg"
            variant={'default'}
            onClick={handlePrimaryClick}
          >
            {t(isEditMode ? 'dev.update' : 'dev.save')}
          </Button>
        </div>
      </div>
    );

    return (
      <FormProvider {...form}>
        <Sheet open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
          <SheetContent
            className="gap-0 rounded-none"
            side="bottom"
            style={{ height: isDesktop ? `calc(100vh - ${TITLE_BAR_HEIGHT}px)` : '100vh' }}
          >
            <SheetHeader>
              <SheetTitle>
                {t(isEditMode ? 'dev.title.skillSettings' : 'dev.title.create')}
              </SheetTitle>
            </SheetHeader>
            <div className={`flex-1 min-h-0 mx-auto w-full ${mobile ? 'max-w-full' : 'max-w-200'}`}>
              <div
                className="flex flex-row gap-0 h-full"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <div className="flex flex-3 flex-col gap-4 overflow-y-auto p-6">
                  <MCPManifestForm
                    enableOAuth={enableOAuth}
                    form={form}
                    getMountedFields={() => [...mountedFields]}
                    isEditMode={isEditMode}
                    onAuthorizeOAuth={runOAuthFlow}
                    onFieldMount={onFieldMount}
                    onSubmit={handleSubmit}
                  />
                </div>
                <PluginPreview form={form} />
              </div>
            </div>
            <SheetFooter>{footer}</SheetFooter>
          </SheetContent>
        </Sheet>
      </FormProvider>
    );
  },
);

export default DevModal;
