'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { Checkbox } from '@/components/ui/checkbox';
import { PRIVACY_URL, TERMS_URL } from '@/const/url';

/**
 * Remembers that the user already accepted the terms & privacy policy on this
 * browser, so returning users are not asked to confirm again on every sign-in.
 */
const AGREEMENT_ACCEPTED_KEY = 'orvilo:auth:agreement-accepted:v1';

const readStoredAgreement = () => {
  try {
    return localStorage.getItem(AGREEMENT_ACCEPTED_KEY) === 'true';
  } catch {
    return false;
  }
};

const persistAgreement = (accepted: boolean) => {
  try {
    if (accepted) {
      localStorage.setItem(AGREEMENT_ACCEPTED_KEY, 'true');
    } else {
      localStorage.removeItem(AGREEMENT_ACCEPTED_KEY);
    }
  } catch {
    // Ignore localStorage errors (e.g., quota exceeded, private mode)
  }
};

const styles = {
  link: 'cursor-pointer text-inherit underline active:underline focus:underline hover:underline visited:underline visited:text-link-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
};

type AuthAgreementProps =
  | {
      checked: boolean;
      onChange: (checked: boolean) => void;
    }
  | {
      checked?: undefined;
      onChange?: undefined;
    };

interface AgreementTextProps {
  i18nKey: 'agreement.checkbox' | 'agreement.confirm.content' | 'footer.agreement';
}

type ContinueWithAgreement = () => void;
type RequestAgreementConfirmation = (onConfirm: ContinueWithAgreement) => void;

const AgreementText = memo<AgreementTextProps>(({ i18nKey }) => {
  const { t: translate } = useTranslation('auth');

  return (
    <Trans
      i18nKey={i18nKey}
      ns={'auth'}
      components={{
        privacy: (
          <a className={styles.link} href={PRIVACY_URL} rel="noopener noreferrer" target="_blank">
            {translate('footer.privacy')}
          </a>
        ),
        terms: (
          <a className={styles.link} href={TERMS_URL} rel="noopener noreferrer" target="_blank">
            {translate('footer.terms')}
          </a>
        ),
      }}
    />
  );
});

export const useAuthAgreement = (requestConfirmation?: RequestAgreementConfirmation) => {
  const { t } = useTranslation(['auth', 'common']);
  // Read after mount, not during render — the sign-in page is prerendered and a
  // remembered acceptance would not match the document's unchecked box.
  const [agreementChecked, setAgreementCheckedState] = useState(false);

  useEffect(() => {
    setAgreementCheckedState(readStoredAgreement());
  }, []);

  const setAgreementChecked = useCallback((checked: boolean) => {
    setAgreementCheckedState(checked);
    persistAgreement(checked);
  }, []);

  const showConfirmation = useCallback(
    (onConfirm: ContinueWithAgreement) => {
      if (requestConfirmation) {
        requestConfirmation(onConfirm);
        return;
      }

      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: <AgreementText i18nKey={'agreement.confirm.content'} />,
        okButtonProps: { autoFocus: true },
        okText: t('agreement.confirm.ok', { ns: 'auth' }),
        onOk: onConfirm,
        title: t('agreement.confirm.title', { ns: 'auth' }),
      });
    },
    [requestConfirmation, t],
  );

  const continueWithAgreement = useCallback(
    (continueAction: ContinueWithAgreement) => {
      if (agreementChecked) {
        continueAction();
        return;
      }

      showConfirmation(() => {
        setAgreementChecked(true);
        continueAction();
      });
    },
    [agreementChecked, setAgreementChecked, showConfirmation],
  );

  return { agreementChecked, continueWithAgreement, setAgreementChecked };
};

const AuthAgreement = memo<AuthAgreementProps>(({ checked, onChange }) => {
  if (checked === undefined || onChange === undefined) {
    return (
      <div className="mbs-2 block text-xs leading-5 text-muted-foreground">
        <AgreementText i18nKey={'footer.agreement'} />
      </div>
    );
  }

  return (
    <label className="mbe-3 flex min-h-9 w-full items-start gap-2 [@media(pointer:coarse)]:min-h-11">
      <Checkbox checked={checked} className="mbs-0.5" onCheckedChange={onChange} />
      <span className="text-sm leading-5.5 text-muted-foreground">
        <AgreementText i18nKey={'agreement.checkbox'} />
      </span>
    </label>
  );
});

export default AuthAgreement;
