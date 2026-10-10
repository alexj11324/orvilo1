'use client';

import { memo } from 'react';
import { createStoreUpdater } from 'zustand-utils';

import { type State } from './store';
import { useStoreApi } from './store';

export type StoreUpdaterProps = Partial<
  Pick<State, 'onMetaChange' | 'onConfigChange' | 'meta' | 'config' | 'disabled' | 'id' | 'loading'>
>;

const StoreUpdater = memo<StoreUpdaterProps>(
  ({ onConfigChange, id, onMetaChange, meta, config, disabled, loading }) => {
    const storeApi = useStoreApi();
    const useStoreUpdater = createStoreUpdater(storeApi);

    useStoreUpdater('meta', meta!);
    useStoreUpdater('config', config!);
    useStoreUpdater('onConfigChange', onConfigChange);
    useStoreUpdater('onMetaChange', onMetaChange);
    useStoreUpdater('disabled', disabled);
    useStoreUpdater('loading', loading);
    useStoreUpdater('id', id);

    return null;
  },
);

export default StoreUpdater;
