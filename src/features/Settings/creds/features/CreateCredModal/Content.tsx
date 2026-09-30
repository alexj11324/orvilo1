'use client';

import { useModalContext } from '@lobehub/ui/base-ui';
import { type CredType } from '@orvilo/types';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/reui/stepper';

import { type CredsApi } from '../useCredsApi';
import CredTypeSelector from './CredTypeSelector';
import FileCredForm from './FileCredForm';
import KVCredForm from './KVCredForm';
import OAuthCredForm from './OAuthCredForm';

export interface CreateCredModalContentProps {
  /**
   * Bound explicitly by the caller (rendered inline, inside CredsApiProvider)
   * instead of read via useCredsApi() here — this content tree is portaled by
   * createModal() to a global ModalHost that sits outside CredsApiProvider,
   * so a local useCredsApi() call would silently fall back to the personal
   * (creds) API even on the workspace creds page.
   */
  credsApi: CredsApi;
  onSuccess?: () => void;
}

const CreateCredModalContent: FC<CreateCredModalContentProps> = ({ credsApi, onSuccess }) => {
  const { t } = useTranslation('setting');
  const { close } = useModalContext();
  const [step, setStep] = useState(0);
  const [credType, setCredType] = useState<CredType | null>(null);

  const handleTypeSelect = (type: CredType) => {
    setCredType(type);
    setStep(1);
  };

  const handleBack = () => {
    setStep(0);
    setCredType(null);
  };

  const handleSuccess = () => {
    onSuccess?.();
    close();
  };

  const renderForm = () => {
    switch (credType) {
      case 'kv-env':
      case 'kv-header': {
        return (
          <KVCredForm
            credsApi={credsApi}
            type={credType}
            onBack={handleBack}
            onSuccess={handleSuccess}
          />
        );
      }
      case 'oauth': {
        return <OAuthCredForm credsApi={credsApi} onBack={handleBack} onSuccess={handleSuccess} />;
      }
      case 'file': {
        return <FileCredForm credsApi={credsApi} onBack={handleBack} onSuccess={handleSuccess} />;
      }
      default: {
        return null;
      }
    }
  };

  return (
    <>
      <Stepper className="mb-6" value={step + 1}>
        <StepperNav>
          <StepperItem disabled step={1}>
            <StepperTrigger>
              <StepperIndicator>{1}</StepperIndicator>
              <StepperTitle>{t('creds.createModal.selectType')}</StepperTitle>
            </StepperTrigger>
            <StepperSeparator />
          </StepperItem>
          <StepperItem disabled step={2}>
            <StepperTrigger>
              <StepperIndicator>{2}</StepperIndicator>
              <StepperTitle>{t('creds.createModal.fillForm')}</StepperTitle>
            </StepperTrigger>
          </StepperItem>
        </StepperNav>
      </Stepper>

      {step === 0 ? <CredTypeSelector onSelect={handleTypeSelect} /> : renderForm()}
    </>
  );
};

export default CreateCredModalContent;
