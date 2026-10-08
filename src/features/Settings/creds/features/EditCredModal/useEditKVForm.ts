import { type OwnCredSummary } from '@orvilo/types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { pairsToValues } from '../kvPairs';
import { useCredentialMutation } from '../useCredentialMutation';
import { type CredsApi } from '../useCredsApi';

export interface KVFormValues {
  description?: string;
  kvPairs: Array<{ key: string; value: string }>;
  name: string;
}

export function useEditKVForm(
  cred: OwnCredSummary,
  api: CredsApi,
  allowed: boolean,
  setValues: (values: KVFormValues) => void,
  onSuccess: () => void,
) {
  const { t } = useTranslation('setting');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>();
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setReady(false);
    setLoadError(undefined);
    setIsLoading(allowed);
    if (!allowed) return;
    const load = async () => {
      try {
        const result = await api.client.get.query({ decrypt: true, id: cred.id });
        if (!active) return;
        const plaintext = result?.data?.plaintext;
        if (!plaintext || typeof plaintext !== 'object')
          throw new Error(t('creds.form.loadFailed'));
        const kvPairs = Object.entries(plaintext).map(([key, value]) => ({
          key,
          value: value as string,
        }));
        setValues({
          description: cred.description,
          name: cred.name,
          kvPairs: kvPairs.length ? kvPairs : [{ key: '', value: '' }],
        });
        setReady(true);
      } catch (error) {
        if (active) setLoadError(error ?? new Error(t('creds.form.loadFailed')));
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [allowed, api, attempt, cred.description, cred.id, cred.name, setValues, t]);
  const updateMutation = useCredentialMutation(
    async (values: KVFormValues) => {
      if (!allowed || !ready) throw new Error(t('creds.form.loadFailed'));
      await api.client.update.mutate({
        id: cred.id,
        name: values.name,
        description: values.description,
        values: pairsToValues(values.kvPairs),
      });
    },
    onSuccess,
    t('creds.form.saveFailed'),
  );
  return {
    isLoading,
    loadError,
    ready,
    updateMutation,
    retryLoad: () => {
      setReady(false);
      setLoadError(undefined);
      setIsLoading(true);
      setAttempt((count) => count + 1);
    },
  };
}
