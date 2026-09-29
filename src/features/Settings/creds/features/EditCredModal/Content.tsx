'use client';

import { useModalContext } from '@lobehub/ui/base-ui';
import { type OwnCredSummary } from '@orvilo/types';
import { type FC } from 'react';

import { type CredsApi } from '../useCredsApi';
import EditKVForm from './EditKVForm';
import EditMetaForm from './EditMetaForm';

export interface EditCredModalContentProps {
  cred: OwnCredSummary;
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

const EditCredModalContent: FC<EditCredModalContentProps> = ({ cred, credsApi, onSuccess }) => {
  const { close } = useModalContext();

  const isKVType = cred.type === 'kv-env' || cred.type === 'kv-header';

  const handleSuccess = () => {
    onSuccess?.();
    close();
  };

  return isKVType ? (
    <EditKVForm cred={cred} credsApi={credsApi} onCancel={close} onSuccess={handleSuccess} />
  ) : (
    <EditMetaForm cred={cred} credsApi={credsApi} onCancel={close} onSuccess={handleSuccess} />
  );
};

export default EditCredModalContent;
