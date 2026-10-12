import isEqual from 'fast-deep-equal';
import { CircleAlert, XIcon } from 'lucide-react';
import { type FormEventHandler, type ReactNode, useEffect, useId, useState } from 'react';
import {
  Controller,
  type ControllerProps,
  type ControllerRenderProps,
  type FieldPath,
  useWatch,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import KeyValueEditor from '@/components/KeyValueEditor';
import MCPStdioCommandInput from '@/components/MCPStdioCommandInput';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import ErrorDetails from '@/features/MCP/MCPInstallProgress/InstallError/ErrorDetails';
import { lambdaClient } from '@/libs/trpc/client';
import { useToolStore } from '@/store/tool';
import { mcpStoreSelectors, pluginSelectors } from '@/store/tool/selectors';
import { type MCPErrorInfoMetadata } from '@/types/plugins';

import ArgsInput from './ArgsInput';
import CollapsibleSection from './CollapsibleSection';
import MCPTypeSelect from './MCPTypeSelect';
import QuickImportSection from './QuickImportSection';
import {
  getMcpDevPayload,
  getMcpDevTestFields,
  isMcpRequiredValuePresent,
  type McpDevForm,
  type McpDevFormValues,
  setMcpDevValues,
  validateMcpIdentifier,
  validateMcpUrl,
} from './utils';

interface MCPManifestFormProps {
  /** Only custom connectors expose connector-backed OAuth, not plain custom plugins. */
  enableOAuth?: boolean;
  form: McpDevForm;
  getMountedFields: () => FieldPath<McpDevFormValues>[];
  isEditMode?: boolean;
  onAuthorizeOAuth?: () => void;
  onFieldMount: (name: FieldPath<McpDevFormValues>, mounted: boolean) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

interface McpFieldProps<TName extends FieldPath<McpDevFormValues>> {
  children: (
    field: ControllerRenderProps<McpDevFormValues, TName>,
    inputProps: {
      'aria-describedby'?: string;
      'aria-invalid'?: true;
      'id': string;
    },
  ) => ReactNode;
  compound?: boolean;
  desc?: ReactNode;
  extra?: ReactNode;
  form: McpDevForm;
  label: ReactNode;
  name: TName;
  onMountChange: (name: TName, mounted: boolean) => void;
  rules?: ControllerProps<McpDevFormValues, TName>['rules'];
  tag?: ReactNode;
}

function McpField<TName extends FieldPath<McpDevFormValues>>({
  children,
  desc,
  extra,
  compound,
  form,
  label,
  name,
  onMountChange,
  rules,
  tag,
}: McpFieldProps<TName>) {
  const id = useId();
  // Keep hidden drafts but clear unmounted field errors, as the old preserved Form.Item did.
  useEffect(() => {
    onMountChange(name, true);
    return () => {
      onMountChange(name, false);
      form.clearErrors(name);
    };
  }, [form, name, onMountChange]);
  return (
    <Controller
      control={form.control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <Field
          className="mbe-6"
          data-invalid={fieldState.invalid || undefined}
          onBlur={compound ? field.onBlur : undefined}
        >
          <FieldLabel className="text-sm leading-5.5" htmlFor={id}>
            <span>{label}</span>
            {tag}
          </FieldLabel>
          {desc ? (
            <FieldDescription className="text-xs leading-5" id={`${id}-description`}>
              {desc}
            </FieldDescription>
          ) : null}
          {children(field, {
            'aria-describedby':
              [
                desc && `${id}-description`,
                extra && `${id}-extra`,
                fieldState.error && `${id}-error`,
              ]
                .filter(Boolean)
                .join(' ') || undefined,
            'aria-invalid': fieldState.invalid || undefined,
            id,
          })}
          {extra ? (
            <FieldDescription className="text-xs leading-5" id={`${id}-extra`}>
              {extra}
            </FieldDescription>
          ) : null}
          {fieldState.error ? (
            <FieldError id={`${id}-error`}>{fieldState.error.message}</FieldError>
          ) : null}
        </Field>
      )}
    />
  );
}

const MCPManifestForm = ({
  form,
  isEditMode,
  enableOAuth,
  onAuthorizeOAuth,
  onSubmit,
  onFieldMount,
  getMountedFields,
}: MCPManifestFormProps) => {
  const { t } = useTranslation('plugin');
  const mcpType = useWatch({ control: form.control, name: 'customParams.mcp.type' });
  const authType = useWatch({ control: form.control, name: 'customParams.mcp.auth.type' });
  useEffect(() => {
    form.register('manifest');
    onFieldMount('manifest', true);
    return () => {
      onFieldMount('manifest', false);
      form.unregister('manifest', { keepValue: true, keepDefaultValue: true });
    };
  }, [form, onFieldMount]);
  // For OAuth servers there is no token to test with — "testing" the connection
  // means running the authorize flow instead.
  const isOAuth = enableOAuth && mcpType === 'http' && authType === 'oauth2';

  // The redirect URI the server will use at authorize time (APP_URL-based), shown
  // so the user registers a matching URI on their OAuth app. Fetched lazily once
  // the OAuth auth type is in play.
  const [redirectUri, setRedirectUri] = useState('');
  useEffect(() => {
    if (!enableOAuth || authType !== 'oauth2' || redirectUri) return;
    lambdaClient.connector.getRedirectUri
      .query()
      .then((r) => setRedirectUri(r.redirectUri))
      .catch(() => {
        if (typeof window !== 'undefined') {
          setRedirectUri(`${window.location.origin}/oauth/connector/callback`);
        }
      });
  }, [enableOAuth, authType, redirectUri]);

  const pluginIds = useToolStore(pluginSelectors.storeAndInstallPluginsIdList);
  const [isTesting, setIsTesting] = useState(false);
  const testMcpConnection = useToolStore((s) => s.testMcpConnection);

  // Use identifier to track test state (if present in the form)
  const identifier = useWatch({ control: form.control, name: 'identifier' }) || 'temp-test-id';
  const testState = useToolStore(mcpStoreSelectors.getMCPConnectionTestState(identifier), isEqual);

  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [errorMetadata, setErrorMetadata] = useState<MCPErrorInfoMetadata | null>(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionError(null);
    setErrorMetadata(null);

    // Connection tests deliberately validate only the current transport/auth fields.
    const isValid = await form.trigger(getMcpDevTestFields(form.getValues()));

    if (!isValid) {
      setIsTesting(false);
      return;
    }

    try {
      const values = getMcpDevPayload(form.getValues(), enableOAuth, getMountedFields());
      const id = values.identifier;
      const mcp = values.customParams?.mcp;
      const description = values.customParams?.description;
      const avatar = values.customParams?.avatar;

      // Use mcpStore's testMcpConnection method
      const result = await testMcpConnection({
        connection: mcp,
        identifier: id,
        metadata: { avatar, description },
      } as Parameters<typeof testMcpConnection>[0]);

      if (result.success && result.manifest) {
        // Optionally update form if manifest ID differs or to store the fetched manifest
        // Be careful about overwriting user input if not desired
        setMcpDevValues(form, { manifest: result.manifest });
        setConnectionError(null); // Clear local error state
        setErrorMetadata(null);
      } else if (result.error) {
        // Store has already handled the error state; optionally show additional user-friendly messages here
        const errorMessage = t('error.testConnectionFailed', {
          error: result.error,
        });
        setConnectionError(errorMessage);

        // Build error metadata for detailed display
        if (result.errorLog || mcpType === 'stdio') {
          setErrorMetadata({
            errorLog: result.errorLog,
            params:
              mcpType === 'stdio'
                ? {
                    args: mcp?.args,
                    command: mcp?.command,
                    type: 'stdio',
                  }
                : undefined,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      // Handle unexpected errors
      const err = error as Error;
      const errorMessage = t('error.testConnectionFailed', {
        error: err.message || t('unknownError'),
      });
      setConnectionError(errorMessage);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      <QuickImportSection
        form={form}
        isEditMode={isEditMode}
        onClearConnectionError={() => {
          setConnectionError(null);
          setErrorMetadata(null);
        }}
      />
      <form noValidate className="text-sm leading-5.5" onSubmit={onSubmit}>
        <div className="flex flex-col">
          <McpField
            compound
            form={form}
            label={t('dev.mcp.type.title')}
            name="customParams.mcp.type"
            rules={{
              validate: (value) =>
                isMcpRequiredValuePresent(value) || t('dev.meta.formFieldRequired'),
            }}
            onMountChange={onFieldMount}
          >
            {(field, inputProps) => (
              <div {...inputProps}>
                <MCPTypeSelect value={field.value} onChange={field.onChange} />
              </div>
            )}
          </McpField>
          <McpField
            desc={t('dev.mcp.identifier.desc')}
            form={form}
            label={t('dev.mcp.identifier.label')}
            name="identifier"
            tag="identifier"
            rules={{
              validate: (value) => {
                const issue = validateMcpIdentifier(value, pluginIds, isEditMode);
                return issue ? t(issue) : true;
              },
            }}
            onMountChange={onFieldMount}
          >
            {(field, inputProps) => (
              <Input
                {...inputProps}
                {...field}
                placeholder={t('dev.mcp.identifier.placeholder')}
                value={field.value ?? ''}
                visualSize="normal"
              />
            )}
          </McpField>
          {mcpType === 'http' && (
            <>
              <McpField
                desc={t('dev.mcp.url.desc')}
                form={form}
                label={t('dev.mcp.url.label')}
                name="customParams.mcp.url"
                tag="url"
                rules={{
                  validate: (value) => {
                    const issue = validateMcpUrl(value);
                    return issue ? t(issue) : true;
                  },
                }}
                onMountChange={onFieldMount}
              >
                {(field, inputProps) => (
                  <Input
                    {...inputProps}
                    {...field}
                    placeholder="https://mcp.higress.ai/mcp-github/xxxxx"
                    value={field.value ?? ''}
                    visualSize="normal"
                  />
                )}
              </McpField>
              <McpField
                desc={t('dev.mcp.auth.desc')}
                form={form}
                label={t('dev.mcp.auth.label')}
                name="customParams.mcp.auth.type"
                onMountChange={onFieldMount}
              >
                {(field, inputProps) => (
                  <RadioGroup
                    {...inputProps}
                    className="flex w-full flex-col gap-2"
                    value={field.value}
                    onBlur={field.onBlur}
                    onValueChange={field.onChange}
                  >
                    {[
                      { label: t('dev.mcp.auth.none'), value: 'none' },
                      { label: t('dev.mcp.auth.bear'), value: 'bearer' },
                      ...(enableOAuth ? [{ label: t('dev.mcp.auth.oauth'), value: 'oauth2' }] : []),
                    ].map((option) => (
                      <label className="flex items-center gap-2" key={option.value}>
                        <RadioGroupItem value={option.value} />
                        {option.label}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </McpField>
              {authType === 'bearer' && (
                <McpField
                  desc={t('dev.mcp.auth.token.desc')}
                  form={form}
                  label={t('dev.mcp.auth.token.label')}
                  name="customParams.mcp.auth.token"
                  rules={{
                    validate: (value) =>
                      isMcpRequiredValuePresent(value) || t('dev.mcp.auth.token.required'),
                  }}
                  onMountChange={onFieldMount}
                >
                  {(field, inputProps) => (
                    <Input
                      {...inputProps}
                      {...field}
                      autoComplete="new-password"
                      placeholder={t('dev.mcp.auth.token.placeholder')}
                      type="password"
                      value={field.value ?? ''}
                      visualSize="normal"
                    />
                  )}
                </McpField>
              )}
              {enableOAuth && authType === 'oauth2' && (
                <>
                  <McpField
                    desc={t('dev.mcp.auth.oauth.clientId.desc')}
                    form={form}
                    label={t('dev.mcp.auth.oauth.clientId.label')}
                    name="customParams.mcp.auth.clientId"
                    onMountChange={onFieldMount}
                  >
                    {(field, inputProps) => (
                      <Input
                        {...inputProps}
                        {...field}
                        placeholder={t('dev.mcp.auth.oauth.clientId.placeholder')}
                        value={field.value ?? ''}
                        visualSize="normal"
                      />
                    )}
                  </McpField>
                  <McpField
                    desc={t('dev.mcp.auth.oauth.clientSecret.desc')}
                    form={form}
                    label={t('dev.mcp.auth.oauth.clientSecret.label')}
                    name="customParams.mcp.auth.clientSecret"
                    onMountChange={onFieldMount}
                  >
                    {(field, inputProps) => (
                      <Input
                        {...inputProps}
                        {...field}
                        autoComplete="new-password"
                        placeholder={t('dev.mcp.auth.oauth.clientSecret.placeholder')}
                        type="password"
                        value={field.value ?? ''}
                        visualSize="normal"
                      />
                    )}
                  </McpField>
                  <div className="mbe-2 text-xs leading-5 text-foreground-description">
                    {t('dev.mcp.auth.oauth.redirectHint')}
                    <br />
                    <code className="break-all">{redirectUri}</code>
                  </div>
                </>
              )}
              <CollapsibleSection title={t('dev.mcp.advanced.title')}>
                <McpField
                  compound
                  desc={t('dev.mcp.headers.desc')}
                  form={form}
                  label={t('dev.mcp.headers.label')}
                  name="customParams.mcp.headers"
                  onMountChange={onFieldMount}
                >
                  {(field, inputProps) => (
                    <div {...inputProps}>
                      <KeyValueEditor
                        addButtonText={t('dev.mcp.headers.add')}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </div>
                  )}
                </McpField>
              </CollapsibleSection>
            </>
          )}
          {mcpType === 'stdio' && (
            <>
              <McpField
                desc={t('dev.mcp.command.desc')}
                form={form}
                label={t('dev.mcp.command.label')}
                name="customParams.mcp.command"
                tag="command"
                rules={{
                  validate: (value) =>
                    isMcpRequiredValuePresent(value) || t('dev.mcp.command.required'),
                }}
                onMountChange={onFieldMount}
              >
                {(field, inputProps) => (
                  <MCPStdioCommandInput
                    {...inputProps}
                    {...field}
                    className="rounded-(--radius-input)"
                    placeholder={t('dev.mcp.command.placeholder')}
                    size="lg"
                    value={field.value ?? ''}
                    onParsedArgs={(args) => {
                      const existing: string[] = form.getValues('customParams.mcp.args') ?? [];
                      setMcpDevValues(form, {
                        customParams: { mcp: { args: [...args, ...existing.filter(Boolean)] } },
                      });
                    }}
                  />
                )}
              </McpField>
              <McpField
                desc={t('dev.mcp.args.desc')}
                form={form}
                label={t('dev.mcp.args.label')}
                name="customParams.mcp.args"
                tag="args"
                rules={{
                  validate: (value) =>
                    isMcpRequiredValuePresent(value) || t('dev.mcp.args.required'),
                }}
                onMountChange={onFieldMount}
              >
                {(field, inputProps) => (
                  <ArgsInput
                    {...inputProps}
                    {...field}
                    placeholder={t('dev.mcp.args.placeholder')}
                    value={field.value}
                  />
                )}
              </McpField>
              <McpField
                compound
                extra={t('dev.mcp.env.desc')}
                form={form}
                label={t('dev.mcp.env.label')}
                name="customParams.mcp.env"
                tag="env"
                onMountChange={onFieldMount}
              >
                {(field, inputProps) => (
                  <div {...inputProps}>
                    <KeyValueEditor
                      addButtonText={t('dev.mcp.env.add')}
                      keyPlaceholder="VARIABLE_NAME"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </div>
                )}
              </McpField>
            </>
          )}
          <Field className="mbe-6">
            <FieldLabel className="text-sm leading-5.5">
              {t('dev.mcp.testConnectionTip')}
            </FieldLabel>
            <div className="flex flex-row items-center justify-end gap-2">
              <Button
                loading={isTesting}
                size="normal"
                type="button"
                variant="outline"
                onClick={isOAuth ? onAuthorizeOAuth : handleTestConnection}
              >
                {isOAuth ? t('dev.mcp.auth.oauth.authorize') : t('dev.mcp.testConnection')}
              </Button>
            </div>
          </Field>
          {(connectionError || testState.error) && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{connectionError || testState.error}</AlertTitle>
              {errorMetadata && (
                <AlertDescription>
                  <ErrorDetails errorInfo={errorMetadata} />
                </AlertDescription>
              )}
              <AlertAction>
                <Button
                  aria-label={t('close', { ns: 'common' })}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setConnectionError(null);
                    setErrorMetadata(null);
                  }}
                >
                  <XIcon />
                </Button>
              </AlertAction>
            </Alert>
          )}
          <Separator />
          <McpField
            desc={t('dev.mcp.desc.desc')}
            form={form}
            label={t('dev.mcp.desc.label')}
            name="customParams.description"
            tag="description"
            onMountChange={onFieldMount}
          >
            {(field, inputProps) => (
              <Input
                {...inputProps}
                {...field}
                placeholder={t('dev.mcp.desc.placeholder')}
                value={field.value ?? ''}
                visualSize="normal"
              />
            )}
          </McpField>
          <McpField
            form={form}
            label={t('dev.mcp.avatar.label')}
            name="customParams.avatar"
            tag="avatar"
            onMountChange={onFieldMount}
          >
            {(field, inputProps) => (
              <Input
                {...inputProps}
                {...field}
                placeholder="https://plugin-avatar.com"
                value={field.value ?? ''}
                visualSize="normal"
              />
            )}
          </McpField>
        </div>
      </form>
    </>
  );
};

export default MCPManifestForm;
