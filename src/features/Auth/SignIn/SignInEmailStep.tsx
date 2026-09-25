import { Alert, Text } from '@lobehub/ui/base-ui';
import { BRANDING_NAME } from '@orvilo/business-const';
import { Badge, Form, type FormInstance } from 'antd';
import { createStaticStyles } from 'antd-style';
import { ArrowRightIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import AuthIcons from '@/components/AuthIcons';
import { Button as ReuiButton } from '@/components/ui/button';
import { Input as ReuiInput } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import AuthCard from '@/features/AuthCard';
import AuthAgreement, { useAuthAgreement } from '@/features/AuthShell/AuthAgreement';

const styles = createStaticStyles(({ css, cssVar }) => ({
  divider: css`
    display: flex;
    gap: 12px;
    align-items: center;
    width: 100%;
  `,

  fieldLabel: css`
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    color: ${cssVar.colorTextSecondary};
  `,

  form: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
  `,

  formItem: css`
    margin-block-end: 0;

    .ant-form-item-label {
      padding-block: 0 8px;
    }

    .ant-form-item-label > label {
      height: auto;
    }
  `,

  inlineLink: css`
    cursor: pointer;
    color: ${cssVar.colorPrimary};
    text-decoration: underline;
  `,
}));

export const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
export const USERNAME_REGEX = /^\w+$/;

// Turn a provider id into a display name, e.g. "google" -> "Google".
const getProviderName = (provider: string) =>
  provider.toLowerCase().replaceAll(/(^|[_-])([a-z])/g, (_, __, c) => c.toUpperCase());

export interface SignInEmailStepProps {
  disableEmailPassword?: boolean;
  form: FormInstance<{ email: string }>;
  isSocialOnly: boolean;
  lastAuthProvider?: string | null;
  loading: boolean;
  oAuthSSOProviders: string[];
  onCheckUser: (values: { email: string }) => Promise<void>;
  onGoToSignup: () => void;
  onResetEmail: () => void;
  onSetPassword: () => void;
  onSocialSignIn: (provider: string) => void;
  serverConfigInit: boolean;
  sessionExpired?: boolean;
  socialLoading: string | null;
}

export const SignInEmailStep = ({
  disableEmailPassword,
  form,
  isSocialOnly,
  lastAuthProvider,
  loading,
  oAuthSSOProviders,
  serverConfigInit,
  sessionExpired,
  socialLoading,
  onCheckUser,
  onGoToSignup,
  onResetEmail,
  onSetPassword,
  onSocialSignIn,
}: SignInEmailStepProps) => {
  const { t } = useTranslation('auth');
  const { agreementChecked, continueWithAgreement, setAgreementChecked } = useAuthAgreement();
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  const divider = (
    <div className={styles.divider}>
      <Separator />
      <Text as={'span'} fontSize={12} type={'secondary'}>
        {t('betterAuth.signin.orContinueWith')}
      </Text>
      <Separator />
    </div>
  );

  const getProviderLabel = (provider: string) => {
    const normalized = getProviderName(provider);
    const normalizedKey = normalized.replaceAll(/[^\da-z]/gi, '');
    const key = `betterAuth.signin.continueWith${normalizedKey}`;
    return t(key, { defaultValue: `Continue with ${normalized}` });
  };

  // Config is injected synchronously via window.__SERVER_CONFIG__, so the email
  // form is the primary path unless the account is social-only.
  const showEmailForm = !disableEmailPassword && !isSocialOnly;

  return (
    <AuthCard
      subtitle={t('betterAuth.signin.description', { appName: BRANDING_NAME })}
      title={t('betterAuth.signin.heading')}
      variant={'auth16'}
    >
      {sessionExpired && (
        <Alert
          showIcon
          message={t('betterAuth.signin.sessionExpired')}
          style={{ marginBlockEnd: 12 }}
          type="warning"
          variant="filled"
        />
      )}
      {serverConfigInit && oAuthSSOProviders.length > 0 && (
        <div className="grid gap-2.5">
          {oAuthSSOProviders.map((provider) => {
            const button = (
              <ReuiButton
                className="h-10 w-full justify-center px-4"
                disabled={socialLoading === provider}
                key={provider}
                type="button"
                variant="outline"
                onClick={() =>
                  continueWithAgreement(() => {
                    onSocialSignIn(provider);
                  })
                }
              >
                <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
                  {socialLoading === provider ? <Spinner /> : AuthIcons(provider, 18)}
                </span>
                {getProviderLabel(provider)}
              </ReuiButton>
            );
            const showLastUsed =
              provider === lastAuthProvider &&
              (oAuthSSOProviders.length > 1 ||
                (oAuthSSOProviders.length === 1 && !disableEmailPassword));
            return showLastUsed ? (
              <Badge
                color="var(--ant-color-info)"
                count={t('betterAuth.signin.lastUsed')}
                key={provider}
                styles={{ root: { display: 'block', width: '100%' } }}
              >
                {button}
              </Badge>
            ) : (
              button
            );
          })}
          {showEmailForm && divider}
        </div>
      )}
      {serverConfigInit && disableEmailPassword && oAuthSSOProviders.length === 0 && (
        <Alert showIcon description={t('betterAuth.signin.ssoOnlyNoProviders')} type="warning" />
      )}
      {showEmailForm && (
        <Form
          className={styles.form}
          form={form}
          layout="vertical"
          onFinish={(values) =>
            continueWithAgreement(() => {
              void onCheckUser(values as { email: string });
            })
          }
        >
          <Form.Item
            className={styles.formItem}
            htmlFor="auth-signin-email"
            label={<span className={styles.fieldLabel}>{t('betterAuth.signin.emailLabel')}</span>}
            name="email"
            rules={[
              { message: t('betterAuth.errors.emailRequired'), required: true },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const trimmedValue = (value as string).trim();
                  if (EMAIL_REGEX.test(trimmedValue) || USERNAME_REGEX.test(trimmedValue)) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('betterAuth.errors.emailInvalid')));
                },
              },
            ]}
          >
            <ReuiInput
              autoComplete="username"
              className="h-10"
              id="auth-signin-email"
              inputMode="email"
              placeholder={t('betterAuth.signin.emailPlaceholder')}
              ref={emailInputRef}
              type="text"
            />
          </Form.Item>
          <ReuiButton className="h-10 w-full gap-2" disabled={loading} type="submit">
            {loading ? <Spinner /> : null}
            {t('betterAuth.signin.nextStep')}
            {!loading && <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />}
          </ReuiButton>
          <AuthAgreement checked={agreementChecked} onChange={setAgreementChecked} />
        </Form>
      )}
      {isSocialOnly && (
        <Alert
          showIcon
          style={{ marginTop: 12 }}
          type="info"
          description={
            <>
              {t('betterAuth.signin.socialOnlyHint')}{' '}
              <a
                className={styles.inlineLink}
                role="button"
                tabIndex={0}
                onClick={onSetPassword}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSetPassword();
                  }
                }}
              >
                {t('betterAuth.signin.setPassword')}
              </a>
            </>
          }
        />
      )}
      {isSocialOnly && (
        <Text align={'center'} fontSize={13} style={{ marginTop: 12 }} type={'secondary'}>
          <a
            className={styles.inlineLink}
            role="button"
            tabIndex={0}
            onClick={onResetEmail}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onResetEmail();
              }
            }}
          >
            {t('betterAuth.signin.emailSent.changeEmail')}
          </a>
        </Text>
      )}
      {!showEmailForm && <AuthAgreement />}
      {showEmailForm && (
        <Text align={'center'} fontSize={13} style={{ marginTop: 16 }} type={'secondary'}>
          {t('betterAuth.signin.noAccount')}{' '}
          <a
            className={styles.inlineLink}
            role="button"
            tabIndex={0}
            onClick={onGoToSignup}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onGoToSignup();
              }
            }}
          >
            {t('betterAuth.signin.signupLink')}
          </a>
        </Text>
      )}
    </AuthCard>
  );
};
