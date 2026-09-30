'use client';
import { CopyButton } from '@lobehub/ui';
import { useModalContext } from '@lobehub/ui/base-ui';
import { Form } from 'antd';
import { type Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { API_KEY_FULL_ACCESS_SCOPE, type ApiKeyScope } from '@/const/apiKeyScope';
import { type CreateApiKeyParams } from '@/types/apiKey';

import ApiKeyDatePicker from '../ApiKeyDatePicker';
import ScopeSelector from './ScopeSelector';

type FormValues = Omit<CreateApiKeyParams, 'expiresAt' | 'scopes'>;

/** 'never' and 'custom' plus day-count presets, Vercel-token style. */
const EXPIRY_PRESETS = ['never', '7', '30', '60', '90', '180', '365', 'custom'] as const;
type ExpiryPreset = (typeof EXPIRY_PRESETS)[number];

const PRESET_LABEL_KEYS = {
  '7': 'apikey.form.fields.expiresAt.presets.7d',
  '30': 'apikey.form.fields.expiresAt.presets.30d',
  '60': 'apikey.form.fields.expiresAt.presets.60d',
  '90': 'apikey.form.fields.expiresAt.presets.90d',
  '180': 'apikey.form.fields.expiresAt.presets.180d',
  '365': 'apikey.form.fields.expiresAt.presets.1y',
  'custom': 'apikey.form.fields.expiresAt.presets.custom',
  'never': 'apikey.display.neverExpires',
} as const satisfies Record<ExpiryPreset, string>;

export interface ApiKeyModalContentProps {
  onSubmit: (values: CreateApiKeyParams) => Promise<{ key?: string | null } | void>;
}

const ApiKeyModalContent: FC<ApiKeyModalContentProps> = ({ onSubmit }) => {
  const { t } = useTranslation('auth');
  const { close } = useModalContext();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [fullAccess, setFullAccess] = useState(true);
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([]);
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>('never');
  const [customDate, setCustomDate] = useState<Dayjs | null>(null);
  // Filled once creation succeeds; flips the modal to the copy-now step.
  const [createdKey, setCreatedKey] = useState<string>();

  const scopeMissing = !fullAccess && selectedScopes.length === 0;
  // "Custom date" without a date would silently fall back to never-expires.
  const customDateMissing = expiryPreset === 'custom' && !customDate;

  // The preset resolves to a date at submit time, so a form left open does not
  // silently shorten the key's lifetime.
  const resolveExpiresAt = (): Date | null => {
    if (expiryPreset === 'never') return null;
    if (expiryPreset === 'custom') return customDate ? customDate.toDate() : null;
    return dayjs().add(Number(expiryPreset), 'day').hour(23).minute(59).second(59).toDate();
  };

  const handleFinish = async (values: FormValues) => {
    if (scopeMissing || customDateMissing) return;

    setLoading(true);
    try {
      const created = await onSubmit({
        ...values,
        expiresAt: resolveExpiresAt(),
        scopes: fullAccess ? [API_KEY_FULL_ACCESS_SCOPE] : selectedScopes,
      } satisfies CreateApiKeyParams);
      if (created?.key) {
        setCreatedKey(created.key);
      } else {
        close();
      }
    } finally {
      setLoading(false);
    }
  };

  if (createdKey) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className={`shrink-0 ${'text-emerald-600'}`} size={18} />
          <span className="text-sm" style={{ fontWeight: 500 }}>
            {t('apikey.created.title')}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
          <span className="flex-1 break-all font-mono text-xs">{createdKey}</span>
          <CopyButton content={createdKey} size={'small'} title={t('apikey.display.copy')} />
        </div>
        <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
          {t('apikey.created.hint')}
        </span>
        <Button className="w-full" type="button" variant="default" onClick={() => close()}>
          {t('apikey.created.done')}
        </Button>
      </div>
    );
  }

  const itemStyle = { marginBottom: 0 };

  return (
    <Form colon={false} form={form} layout={'vertical'} onFinish={handleFinish}>
      <div className="flex flex-col gap-4">
        <Form.Item
          label={t('apikey.form.fields.name.label')}
          name={'name'}
          rules={[{ required: true }]}
          style={itemStyle}
        >
          <Input placeholder={t('apikey.form.fields.name.placeholder')} />
        </Form.Item>

        <Form.Item label={t('apikey.form.fields.expiresAt.label')} style={itemStyle}>
          <div className="flex flex-col gap-4">
            <Select
              value={expiryPreset}
              items={EXPIRY_PRESETS.map((preset) => ({
                label: t(PRESET_LABEL_KEYS[preset]),
                value: preset,
              }))}
              onValueChange={(value) => {
                if (value) setExpiryPreset(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {t(PRESET_LABEL_KEYS[preset])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {expiryPreset === 'custom' && (
              <ApiKeyDatePicker
                showNeverExpiresFooter={false}
                style={{ width: '100%' }}
                value={customDate}
                onChange={setCustomDate}
              />
            )}
          </div>
        </Form.Item>

        <Form.Item
          help={scopeMissing ? t('apikey.form.fields.scopes.required') : undefined}
          label={t('apikey.form.fields.scopes.label')}
          style={itemStyle}
          validateStatus={scopeMissing ? 'error' : undefined}
        >
          <ScopeSelector
            fullAccess={fullAccess}
            selected={selectedScopes}
            onFullAccessChange={setFullAccess}
            onSelectedChange={setSelectedScopes}
          />
        </Form.Item>

        <Button
          className="w-full"
          disabled={loading || scopeMissing || customDateMissing}
          type={'submit'}
          variant="default"
        >
          {loading && <Loader2 className="animate-spin" />}
          {t('apikey.form.submit')}
        </Button>
      </div>
    </Form>
  );
};

export default ApiKeyModalContent;
