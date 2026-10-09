import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldLabel } from '@/components/ui/field';
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
  const id = useId();
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${id}-endpoint`}>{t('onboarding.api.endpoint')}</FieldLabel>
        <Input
          required
          className="h-9"
          disabled={props.configDisabled}
          id={`${id}-endpoint`}
          type="url"
          value={props.endpoint}
          onChange={(event) => props.onEndpointChange(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-model`}>{t('onboarding.api.model')}</FieldLabel>
        <Input
          required
          className="h-9"
          disabled={props.configDisabled}
          id={`${id}-model`}
          value={props.model}
          onChange={(event) => props.onModelChange(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-key`}>{t('onboarding.api.key')}</FieldLabel>
        <Input
          autoComplete="new-password"
          className="h-9"
          disabled={props.keyDisabled}
          id={`${id}-key`}
          required={props.keyRequired ?? true}
          type="password"
          value={props.apiKey}
          onChange={(event) => props.onApiKeyChange(event.target.value)}
        />
      </Field>
    </>
  );
};
