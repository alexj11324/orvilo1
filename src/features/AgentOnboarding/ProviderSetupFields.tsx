import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';

interface ProviderSetupFieldsProps {
  apiKey: string;
  configDisabled?: boolean;
  endpoint: string;
  keyDisabled?: boolean;
  keyRequired?: boolean;
  model: string;
  onApiKeyChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  onModelChange: (value: string) => void;
}

/** Credential entry shared by first-run setup and ordinary Prime creation. */
export const ProviderSetupFields = (props: ProviderSetupFieldsProps) => {
  const { t } = useTranslation('chat');
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        {t('onboarding.api.endpoint')}
        <Input
          required
          disabled={props.configDisabled}
          type="url"
          value={props.endpoint}
          onChange={(event) => props.onEndpointChange(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('onboarding.api.model')}
        <Input
          required
          disabled={props.configDisabled}
          value={props.model}
          onChange={(event) => props.onModelChange(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('onboarding.api.key')}
        <Input
          autoComplete="new-password"
          disabled={props.keyDisabled}
          required={props.keyRequired ?? true}
          type="password"
          value={props.apiKey}
          onChange={(event) => props.onApiKeyChange(event.target.value)}
        />
      </label>
    </>
  );
};
