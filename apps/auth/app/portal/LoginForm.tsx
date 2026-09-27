import { type FormEvent, useState } from 'react';

import type { PortalMessages } from './messages';
import { useAccountsSignIn } from './useAccountsSignIn';

type AccountsLoginFormProps = {
  messages: PortalMessages;
  onGoogleLogin: () => Promise<void> | void;
};

const GoogleMark = () => (
  <svg
    aria-hidden="true"
    className="accounts-login-form__provider-glyph"
    data-testid="google-mark"
    viewBox="0 0 24 24"
  >
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

export const AccountsLoginForm = ({ messages, onGoogleLogin }: AccountsLoginFormProps) => {
  const [legalAccepted, setLegalAccepted] = useState(false);
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
      <div className="accounts-login-form" data-testid="accounts-login-form">
        <div className="accounts-login-form__heading">
          <h1>{messages.passwordTitle}</h1>
          <p>{messages.passwordDescription.replace('{{email}}', email)}</p>
        </div>
        <form className="accounts-login-form__fields" onSubmit={handlePasswordSubmit}>
          <div className="accounts-login-form__field">
            <label htmlFor="accounts-password">{messages.password}</label>
            <input
              required
              autoComplete="current-password"
              disabled={loading}
              id="accounts-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <p className="accounts-login-form__error" role="alert">
              {error}
            </p>
          )}
          <button
            aria-busy={loading}
            className="accounts-login-form__button accounts-login-form__button--primary"
            disabled={loading || !password}
            type="submit"
          >
            {messages.passwordButton}
          </button>
        </form>
        <div className="accounts-login-form__footer">
          {supportsEmailCode && (
            <button
              className="accounts-login-form__link"
              disabled={loading}
              type="button"
              onClick={() => void switchToCode()}
            >
              {messages.useCode}
            </button>
          )}
          <button
            className="accounts-login-form__link"
            disabled={loading}
            type="button"
            onClick={reset}
          >
            {messages.back}
          </button>
        </div>
        <div id="clerk-captcha" />
      </div>
    );
  }

  if (step === 'code') {
    return (
      <div className="accounts-login-form" data-testid="accounts-login-form">
        <div className="accounts-login-form__heading">
          <h1>{messages.verifyTitle}</h1>
          <p>{messages.verifyDescription.replace('{{email}}', email)}</p>
        </div>
        <form className="accounts-login-form__fields" onSubmit={handleVerificationSubmit}>
          <div className="accounts-login-form__field">
            <label htmlFor="accounts-verification-code">{messages.verificationCode}</label>
            <input
              required
              autoComplete="one-time-code"
              disabled={loading}
              id="accounts-verification-code"
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          {error && (
            <p className="accounts-login-form__error" role="alert">
              {error}
            </p>
          )}
          <button
            aria-busy={loading}
            className="accounts-login-form__button accounts-login-form__button--primary"
            disabled={loading || !code.trim()}
            type="submit"
          >
            {messages.verifyButton}
          </button>
        </form>
        <div className="accounts-login-form__footer">
          <button
            className="accounts-login-form__link"
            disabled={loading}
            type="button"
            onClick={() => void resendCode()}
          >
            {messages.resend}
          </button>
          <button
            className="accounts-login-form__link"
            disabled={loading}
            type="button"
            onClick={reset}
          >
            {messages.back}
          </button>
        </div>
        <div id="clerk-captcha" />
      </div>
    );
  }

  if (step === 'requirements') {
    return (
      <div className="accounts-login-form" data-testid="accounts-login-form">
        <div className="accounts-login-form__heading">
          <h1>{messages.completeAccount}</h1>
          <p>{messages.completeAccountDescription}</p>
        </div>
        <form className="accounts-login-form__requirements" onSubmit={handleRequirementsSubmit}>
          <label className="accounts-login-form__legal-check">
            <input
              required
              checked={legalAccepted}
              disabled={loading}
              type="checkbox"
              onChange={(event) => setLegalAccepted(event.target.checked)}
            />
            <span>{messages.legal}</span>
          </label>
          {error && (
            <p className="accounts-login-form__error" role="alert">
              {error}
            </p>
          )}
          <button
            aria-busy={loading}
            className="accounts-login-form__button accounts-login-form__button--primary"
            disabled={loading || !legalAccepted}
            type="submit"
          >
            {messages.createAccountButton}
          </button>
        </form>
        <button
          className="accounts-login-form__link"
          disabled={loading}
          type="button"
          onClick={reset}
        >
          {messages.startOver}
        </button>
      </div>
    );
  }

  return (
    <div className="accounts-login-form" data-testid="accounts-login-form">
      <div className="accounts-login-form__heading">
        <h1>{messages.login}</h1>
        <p>{messages.emailDescription}</p>
      </div>
      <form className="accounts-login-form__fields" onSubmit={handleEmailSubmit}>
        <div className="accounts-login-form__field">
          <label className="sr-only" htmlFor="accounts-email">
            {messages.email}
          </label>
          <input
            required
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            disabled={loading || !signIn}
            id="accounts-email"
            placeholder={messages.emailPlaceholder}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {error && (
          <p className="accounts-login-form__error" role="alert">
            {error}
          </p>
        )}
        <button
          aria-busy={loading}
          className="accounts-login-form__button accounts-login-form__button--primary"
          disabled={loading || !signIn || !email.trim()}
          type="submit"
        >
          {messages.emailButton}
        </button>
      </form>
      <div className="accounts-login-form__separator" role="separator">
        <span>{messages.continueWith}</span>
      </div>
      <button
        aria-busy={loading}
        className="accounts-login-form__button accounts-login-form__button--secondary"
        disabled={loading || !signIn}
        type="button"
        onClick={() => void runGoogle(onGoogleLogin)}
      >
        <GoogleMark />
        {messages.google}
      </button>
      <p className="accounts-login-form__legal">{messages.terms}</p>
      <div id="clerk-captcha" />
    </div>
  );
};
