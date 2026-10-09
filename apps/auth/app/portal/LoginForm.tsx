import { type FormEvent, type PropsWithChildren, type ReactNode, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EntryHeading, EntryPanel } from '@/features/AuthShell/EntryShell';

import type { PortalMessages } from './messages';
import { useAccountsSignIn } from './useAccountsSignIn';

type AccountsLoginFormProps = {
  messages: PortalMessages;
  onGoogleLogin: () => Promise<void> | void;
};

const GoogleMark = () => (
  <svg aria-hidden="true" className="size-4" data-testid="google-mark" viewBox="0 0 24 24">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

interface StepProps extends PropsWithChildren {
  description?: ReactNode;
  title: ReactNode;
}

const Step = ({ children, description, title }: StepProps) => (
  <EntryPanel data-testid="accounts-login-form">
    <EntryHeading description={description} title={title} />
    {children}
  </EntryPanel>
);

const FormError = ({ children }: PropsWithChildren) => (
  <Alert variant="destructive">
    <AlertDescription>{children}</AlertDescription>
  </Alert>
);

const LinkRow = ({ children }: PropsWithChildren) => (
  <div className="flex items-center justify-center gap-4">{children}</div>
);

export const AccountsLoginForm = ({ messages, onGoogleLogin }: AccountsLoginFormProps) => {
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [emailChosen, setEmailChosen] = useState(false);
  const {
    code,
    email,
    error,
    loading,
    password,
    resendCode,
    reset,
    runGoogle,
    setCode,
    setEmail,
    setPassword,
    signIn,
    step,
    submitCode,
    submitEmail,
    submitPassword,
    submitRequirements,
    supportsEmailCode,
    switchToCode,
  } = useAccountsSignIn(messages);

  const handleEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitEmail(email);
  };

  const handlePasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitPassword();
  };

  const handleVerificationSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitCode();
  };

  const handleRequirementsSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitRequirements(legalAccepted);
  };

  if (step === 'password') {
    return (
      <Step
        description={messages.passwordDescription.replace('{{email}}', email)}
        title={messages.passwordTitle}
      >
        <form className="flex flex-col gap-3" onSubmit={handlePasswordSubmit}>
          <Field>
            <FieldLabel htmlFor="accounts-password">{messages.password}</FieldLabel>
            <Input
              required
              autoComplete="current-password"
              className="h-9"
              disabled={loading}
              id="accounts-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button aria-busy={loading} disabled={loading || !password} size="lg" type="submit">
            {messages.passwordButton}
          </Button>
        </form>
        <LinkRow>
          {supportsEmailCode && (
            <Button
              disabled={loading}
              type="button"
              variant="link"
              onClick={() => void switchToCode()}
            >
              {messages.useCode}
            </Button>
          )}
          <Button disabled={loading} type="button" variant="link" onClick={reset}>
            {messages.back}
          </Button>
        </LinkRow>
        <div className="mx-auto w-fit" id="clerk-captcha" />
      </Step>
    );
  }

  if (step === 'code') {
    return (
      <Step
        description={messages.verifyDescription.replace('{{email}}', email)}
        title={messages.verifyTitle}
      >
        <form className="flex flex-col gap-3" onSubmit={handleVerificationSubmit}>
          <Field>
            <FieldLabel htmlFor="accounts-verification-code">
              {messages.verificationCode}
            </FieldLabel>
            <Input
              required
              autoComplete="one-time-code"
              className="h-9"
              disabled={loading}
              id="accounts-verification-code"
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button aria-busy={loading} disabled={loading || !code.trim()} size="lg" type="submit">
            {messages.verifyButton}
          </Button>
        </form>
        <LinkRow>
          <Button disabled={loading} type="button" variant="link" onClick={() => void resendCode()}>
            {messages.resend}
          </Button>
          <Button disabled={loading} type="button" variant="link" onClick={reset}>
            {messages.back}
          </Button>
        </LinkRow>
        <div className="mx-auto w-fit" id="clerk-captcha" />
      </Step>
    );
  }

  if (step === 'requirements') {
    return (
      <Step description={messages.completeAccountDescription} title={messages.completeAccount}>
        <form className="flex flex-col gap-3" onSubmit={handleRequirementsSubmit}>
          <Field orientation="horizontal">
            <Checkbox
              required
              checked={legalAccepted}
              disabled={loading}
              id="accounts-legal"
              onCheckedChange={(checked) => setLegalAccepted(checked)}
            />
            <FieldLabel className="font-normal" htmlFor="accounts-legal">
              {messages.legal}
            </FieldLabel>
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button aria-busy={loading} disabled={loading || !legalAccepted} size="lg" type="submit">
            {messages.createAccountButton}
          </Button>
        </form>
        <LinkRow>
          <Button disabled={loading} type="button" variant="link" onClick={reset}>
            {messages.startOver}
          </Button>
        </LinkRow>
      </Step>
    );
  }

  // The first screen only lists the ways in; email asks for its address on the next one.
  if (!emailChosen) {
    return (
      <Step title={messages.login}>
        {error && <FormError>{error}</FormError>}
        <Button
          aria-busy={loading}
          disabled={loading || !signIn}
          size="lg"
          type="button"
          onClick={() => void runGoogle(onGoogleLogin)}
        >
          <GoogleMark />
          {messages.google}
        </Button>
        <Button
          disabled={loading || !signIn}
          size="lg"
          type="button"
          variant="outline"
          onClick={() => setEmailChosen(true)}
        >
          {messages.emailButton}
        </Button>
        <div className="mx-auto w-fit" id="clerk-captcha" />
      </Step>
    );
  }

  return (
    <Step title={messages.emailTitle}>
      <form className="flex flex-col gap-3" onSubmit={handleEmailSubmit}>
        <Field>
          <FieldLabel className="sr-only" htmlFor="accounts-email">
            {messages.email}
          </FieldLabel>
          <Input
            autoFocus
            required
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            className="h-9"
            disabled={loading || !signIn}
            id="accounts-email"
            placeholder={messages.emailPlaceholder}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        {error && <FormError>{error}</FormError>}
        <Button
          aria-busy={loading}
          disabled={loading || !signIn || !email.trim()}
          size="lg"
          type="submit"
        >
          {messages.emailButton}
        </Button>
      </form>
      <LinkRow>
        <Button
          disabled={loading}
          type="button"
          variant="link"
          onClick={() => {
            reset();
            setEmailChosen(false);
          }}
        >
          {messages.back}
        </Button>
      </LinkRow>
      <div className="mx-auto w-fit" id="clerk-captcha" />
    </Step>
  );
};
