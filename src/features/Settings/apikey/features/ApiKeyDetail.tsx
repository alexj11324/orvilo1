'use client';
import { Pencil, Trash } from 'lucide-react';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogConfirm,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  API_KEY_FULL_ACCESS_SCOPE,
  type ApiKeyScope,
  isFullAccessApiKey,
} from '@/const/apiKeyScope';
import { type ApiKeyItem, type UpdateApiKeyParams } from '@/types/apiKey';

import ScopeSelector, { ScopeOverview } from './ApiKeyModal/ScopeSelector';
import { ApiKeyDisplay, EditableCell } from './index';

export interface ApiKeyDetailProps {
  apiKey?: ApiKeyItem;
  canDelete: boolean;
  canEdit: boolean;
  manageTooltip: string;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, params: UpdateApiKeyParams) => Promise<boolean>;
  open: boolean;
}

interface ApiKeyScopeEditorProps {
  apiKey: ApiKeyItem;
  canEdit: boolean;
  onUpdate: (id: string, params: UpdateApiKeyParams) => Promise<boolean>;
}

const ApiKeyScopeEditor: FC<ApiKeyScopeEditorProps> = ({ apiKey, canEdit, onUpdate }) => {
  const { t } = useTranslation('auth');
  const initialFullAccess = isFullAccessApiKey(apiKey.scopes);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullAccess, setFullAccess] = useState(initialFullAccess);
  const [selected, setSelected] = useState<ApiKeyScope[]>(
    initialFullAccess ? [] : (apiKey.scopes as ApiKeyScope[]),
  );
  const scopeMissing = !fullAccess && selected.length === 0;

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <ScopeSelector
          fullAccess={fullAccess}
          selected={selected}
          onFullAccessChange={setFullAccess}
          onSelectedChange={setSelected}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFullAccess(initialFullAccess);
              setSelected(initialFullAccess ? [] : (apiKey.scopes as ApiKeyScope[]));
              setEditing(false);
            }}
          >
            {t('apikey.detail.permissions.cancel')}
          </Button>
          <Button
            disabled={saving || scopeMissing}
            loading={saving}
            type="button"
            variant="default"
            onClick={async () => {
              setSaving(true);
              try {
                const success = await onUpdate(apiKey.id, {
                  scopes: fullAccess ? [API_KEY_FULL_ACCESS_SCOPE] : selected,
                });
                if (success) setEditing(false);
              } catch {
                // The mutation owns user-facing error feedback. Keep the
                // editor open so the selected grants are not lost.
              } finally {
                setSaving(false);
              }
            }}
          >
            {t('apikey.detail.permissions.save')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {initialFullAccess ? (
        <div className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
          <span className="text-sm" style={{ fontSize: 14 }}>
            {t('apikey.scopes.fullAccess')}
          </span>
          <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
            {t('apikey.form.fields.scopes.fullAccessDescription')}
          </span>
        </div>
      ) : (
        <ScopeOverview scopes={apiKey.scopes!} />
      )}
      {canEdit && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil />
            {t('apikey.detail.permissions.edit')}
          </Button>
        </div>
      )}
    </div>
  );
};

/**
 * Full detail of one API key — the list's scopes column can only truncate.
 * Same management surface as the list rows (rename / toggle / delete), and
 * the scope grid mirrors the creation modal so create and inspect read as one
 * system. The creator may edit scopes in place; admins may revoke other
 * members' keys but cannot change their grants.
 */
const ApiKeyDetail: FC<ApiKeyDetailProps> = ({
  apiKey,
  canDelete,
  canEdit,
  manageTooltip,
  onClose,
  onDelete,
  onUpdate,
  open,
}) => {
  const { t } = useTranslation('auth');

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[min(92vw,520px)] sm:max-w-[min(92vw,520px)]" side={'right'}>
        <SheetHeader>
          <SheetTitle>{t('apikey.detail.title')}</SheetTitle>
        </SheetHeader>
        {apiKey && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3">
              <div className="flex min-h-7 items-center gap-4">
                <span className="w-24 flex-none text-xs text-muted-foreground">
                  {t('apikey.list.columns.name')}
                </span>
                <span className="flex items-center overflow-hidden text-[13px]">
                  <EditableCell
                    disabled={!canEdit}
                    placeholder={t('apikey.display.enterPlaceholder')}
                    type="text"
                    value={apiKey.name}
                    onSubmit={(name) => {
                      if (!canEdit || !name || name === apiKey.name) return;
                      void onUpdate(apiKey.id, { name: name as string });
                    }}
                  />
                </span>
              </div>

              <div className="flex min-h-7 items-center gap-4">
                <span className="w-24 flex-none text-xs text-muted-foreground">
                  {t('apikey.list.columns.key')}
                </span>
                <span className="flex items-center overflow-hidden text-[13px]">
                  {apiKey.isMine === false ? (
                    <span style={{ opacity: 0.5 }}>{`sk-ov-${'*'.repeat(12)}`}</span>
                  ) : apiKey.keyDecryptionFailed ? (
                    <span title={t('apikey.display.unavailableDescription')}>
                      {t('apikey.display.unavailable')}
                    </span>
                  ) : (
                    <ApiKeyDisplay apiKey={apiKey.key} />
                  )}
                </span>
              </div>

              {apiKey.creator && (
                <div className="flex min-h-7 items-center gap-4">
                  <span className="w-24 flex-none text-xs text-muted-foreground">
                    {t('apikey.list.columns.creator')}
                  </span>
                  <span className="flex items-center overflow-hidden text-[13px]">
                    {apiKey.creator}
                  </span>
                </div>
              )}

              <div className="flex min-h-7 items-center gap-4">
                <span className="w-24 flex-none text-xs text-muted-foreground">
                  {t('apikey.detail.createdAt')}
                </span>
                <span className="flex items-center overflow-hidden text-[13px]">
                  {apiKey.createdAt.toLocaleString()}
                </span>
              </div>

              <div className="flex min-h-7 items-center gap-4">
                <span className="w-24 flex-none text-xs text-muted-foreground">
                  {t('apikey.list.columns.lastUsedAt')}
                </span>
                <span className="flex items-center overflow-hidden text-[13px]">
                  {apiKey.lastUsedAt?.toLocaleString() || t('apikey.display.neverUsed')}
                </span>
              </div>

              <div className="flex min-h-7 items-center gap-4">
                <span className="w-24 flex-none text-xs text-muted-foreground">
                  {t('apikey.list.columns.expiresAt')}
                </span>
                <span className="flex items-center overflow-hidden text-[13px]">
                  <EditableCell
                    disabled={!canEdit}
                    placeholder={t('apikey.display.neverExpires')}
                    type="date"
                    value={apiKey.expiresAt?.toLocaleString() || t('apikey.display.neverExpires')}
                    onSubmit={(expiresAt) => {
                      if (!canEdit || expiresAt === apiKey.expiresAt) return;
                      void onUpdate(apiKey.id, {
                        expiresAt: expiresAt ? new Date(expiresAt as string) : null,
                      });
                    }}
                  />
                </span>
              </div>

              <div className="flex min-h-7 items-center gap-4">
                <span className="w-24 flex-none text-xs text-muted-foreground">
                  {t('apikey.list.columns.status')}
                </span>
                <span
                  className="flex items-center overflow-hidden text-[13px]"
                  title={canEdit ? undefined : manageTooltip}
                >
                  <Switch
                    aria-label={t('apikey.list.columns.status')}
                    checked={!!apiKey.enabled}
                    disabled={!canEdit}
                    onCheckedChange={(checked) => {
                      if (!canEdit) return;
                      void onUpdate(apiKey.id, { enabled: checked });
                    }}
                  />
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-[13px] font-medium text-muted-foreground">
                {t('apikey.form.fields.scopes.label')}
              </span>
              <ApiKeyScopeEditor
                apiKey={apiKey}
                canEdit={canEdit}
                key={`${apiKey.id}-${apiKey.updatedAt.toISOString()}`}
                onUpdate={onUpdate}
              />
            </div>

            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      disabled={!canDelete}
                      title={canDelete ? t('apikey.list.actions.delete') : manageTooltip}
                      type="button"
                      variant="destructive"
                    >
                      <Trash />
                      {t('apikey.list.actions.delete')}
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('apikey.list.actions.deleteConfirm.title')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('apikey.list.actions.deleteConfirm.content')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t('apikey.list.actions.deleteConfirm.actions.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogConfirm
                      disabled={!canDelete}
                      onClick={async () => {
                        if (!canDelete) return;
                        await onDelete(apiKey.id);
                      }}
                    >
                      {t('apikey.list.actions.deleteConfirm.actions.ok')}
                    </AlertDialogConfirm>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ApiKeyDetail;
