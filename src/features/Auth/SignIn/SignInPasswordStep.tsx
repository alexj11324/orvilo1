import { Text } from '@lobehub/ui/base-ui';
import { type FormInstance } from 'antd';
import { Form } from 'antd';
import { createStaticStyles } from 'antd-style';
import { ArrowRightIcon, Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button as ReuiButton } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import AuthCard from '@/features/AuthCard';

const styles = createStaticStyles(({ css }) => ({
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

  fieldLabel: css`
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
  `,
}));

export interface SignInPasswordStepProps {
  email: string;
  forgotLoading: boolean;
  form: FormInstance<{ password: string }>;
  loading: boolean;
  onBackToEmail: () => void;
  onForgotPassword: () => Promise<void>;
  onSubmit: (values: { password: string }) => Promise<void>;
}

export const SignInPasswordStep = ({
  email,
  form,
  forgotLoading,
  loading,
  onBackToEmail,
  onForgotPassword,
  onSubmit,
}: SignInPasswordStepProps) => {
  const { t } = useTranslation('auth');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  return (
    <AuthCard
      subtitle={email}
      title={t('betterAuth.signin.passwordStep.title')}
      variant={'auth16'}
      footer={
        <Text align={'center'} fontSize={12} type={'secondary'}>
          <a
            role="button"
            style={{ color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
            tabIndex={0}
            onClick={onBackToEmail}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onBackToEmail();
              }
            }}
          >
            {t('betterAuth.signin.backToEmail')}
          </a>
        </Text>
      }
    >
      <Form
        className={styles.form}
        form={form}
        layout="vertical"
        onFinish={(values) => onSubmit(values as { password: string })}
      >
        <Form.Item
          className={styles.formItem}
          htmlFor="auth-signin-password"
          label={<span className={styles.fieldLabel}>{t('betterAuth.signin.passwordLabel')}</span>}
        >
          <InputGroup className="h-10">
            <Form.Item
              noStyle
              name="password"
              rules={[{ message: t('betterAuth.errors.passwordRequired'), required: true }]}
            >
              <InputGroupInput
                autoComplete="current-password"
                id="auth-signin-password"
                placeholder={t('betterAuth.signin.passwordPlaceholder')}
                ref={passwordInputRef}
                type={passwordVisible ? 'text' : 'password'}
              />
            </Form.Item>
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-pressed={passwordVisible}
                size="icon-sm"
                aria-label={
                  passwordVisible
                    ? t('betterAuth.signin.hidePassword')
                    : t('betterAuth.signin.showPassword')
                }
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Form.Item>
        <ReuiButton className="h-10 w-full gap-2" disabled={loading} type="submit">
          {loading ? <Spinner /> : null}
          {t('betterAuth.signin.submit')}
          {!loading && <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />}
        </ReuiButton>
      </Form>
      <Text align={'center'} fontSize={12} type={'secondary'}>
        <a
          aria-disabled={forgotLoading}
          role="button"
          tabIndex={0}
          style={{
            color: 'inherit',
            cursor: forgotLoading ? 'default' : 'pointer',
            opacity: forgotLoading ? 0.5 : 1,
            pointerEvents: forgotLoading ? 'none' : undefined,
            textDecoration: 'underline',
          }}
          onClick={onForgotPassword}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              void onForgotPassword();
            }
          }}
        >
          {t('betterAuth.signin.forgotPassword')}
        </a>
      </Text>
    </AuthCard>
  );
};
