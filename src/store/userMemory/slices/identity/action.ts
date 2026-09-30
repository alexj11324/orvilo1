import {
  type IdentityListResult,
  type NewUserMemoryIdentity,
  type UpdateUserMemoryIdentity,
} from '@orvilo/types';
import { uniqBy } from 'es-toolkit/compat';
import { produce } from 'immer';
import { type SWRResponse } from 'swr';
import useSWR from 'swr';

import { type AddIdentityEntryResult } from '@/database/models/userMemory';
import { userMemoryKeys } from '@/libs/swr/keys';
import { memoryCRUDService, userMemoryService } from '@/services/userMemory';
import { type StoreSetter } from '@/store/types';
import { setNamespace } from '@/utils/storeDebug';

import { type UserMemoryStore } from '../../store';
import { invalidateMemoryCaches } from '../../utils/invalidate';
import { getMemorySession, memorySessionKey, useMemorySession } from '../../utils/session';

const n = setNamespace('userMemory/identity');

export interface IdentityQueryParams {
  page?: number;
  pageSize?: number;
  q?: string;
  relationships?: string[];
  sort?: 'capturedAt' | 'type';
  types?: string[];
}

type Setter = StoreSetter<UserMemoryStore>;
export const createIdentitySlice = (set: Setter, get: () => UserMemoryStore, _api?: unknown) =>
  new IdentityActionImpl(set, get, _api);

export class IdentityActionImpl {
  readonly #get: () => UserMemoryStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => UserMemoryStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  createIdentity = async (data: NewUserMemoryIdentity): Promise<AddIdentityEntryResult> => {
    const session = getMemorySession();
    const result = await memoryCRUDService.createIdentity(data);
    if (session !== getMemorySession()) return result;
    // Reset list to refresh
    this.#get().resetIdentitiesList({
      q: this.#get().identitiesQuery,
      relationships: this.#get().identitiesRelationships,
      sort: this.#get().identitiesSort,
      types: this.#get().identitiesTypes,
    });
    await invalidateMemoryCaches(session);
    return result;
  };

  deleteIdentity = async (id: string): Promise<void> => {
    const session = getMemorySession();
    await memoryCRUDService.deleteIdentity(id);
    if (session !== getMemorySession()) return;
    // Reset list to refresh
    this.#get().resetIdentitiesList({
      q: this.#get().identitiesQuery,
      relationships: this.#get().identitiesRelationships,
      sort: this.#get().identitiesSort,
      types: this.#get().identitiesTypes,
    });
    await invalidateMemoryCaches(session);
  };

  loadMoreIdentities = (): void => {
    const { identitiesPage, identitiesTotal, identities } = this.#get();
    if (identities.length < (identitiesTotal || 0)) {
      this.#set(
        produce((draft) => {
          draft.identitiesPage = identitiesPage + 1;
        }),
        false,
        n('loadMoreIdentities'),
      );
    }
  };

  resetIdentitiesList = (params?: Omit<IdentityQueryParams, 'page' | 'pageSize'>): void => {
    this.#set(
      produce((draft) => {
        draft.identities = [];
        draft.identitiesPage = 1;
        draft.identitiesQuery = params?.q;
        draft.identitiesRelationships = params?.relationships;
        draft.identitiesSearchLoading = true;
        draft.identitiesSort = params?.sort;
        draft.identitiesTypes = params?.types;
      }),
      false,
      n('resetIdentitiesList'),
    );
  };

  updateIdentity = async (id: string, data: UpdateUserMemoryIdentity): Promise<boolean> => {
    const session = getMemorySession();
    const result = await memoryCRUDService.updateIdentity(id, data);
    if (session !== getMemorySession()) return result;
    // Reset list to refresh
    this.#get().resetIdentitiesList({
      q: this.#get().identitiesQuery,
      relationships: this.#get().identitiesRelationships,
      sort: this.#get().identitiesSort,
      types: this.#get().identitiesTypes,
    });
    await invalidateMemoryCaches(session);
    return result;
  };

  useFetchIdentities = (params: IdentityQueryParams): SWRResponse<IdentityListResult> => {
    const page = params.page ?? 1;
    const session = useMemorySession();

    return useSWR(
      memorySessionKey(userMemoryKeys.identityList(params), session),
      async () => {
        // Use the new dedicated queryIdentities API
        return userMemoryService.queryIdentities({
          page: params.page,
          pageSize: params.pageSize,
          q: params.q,
          relationships: params.relationships,
          sort: params.sort,
          types: params.types,
        });
      },
      {
        onSuccess: (data: IdentityListResult) => {
          if (session !== getMemorySession()) return;
          this.#set(
            produce((draft) => {
              draft.identitiesSearchLoading = false;
              draft.identitiesTotal = data.total;

              if (!draft.identitiesInit) {
                draft.identitiesInit = true;
              }

              // Backend now returns flat structure directly, no transformation needed
              if (page === 1) {
                draft.identities = uniqBy(data.items, 'id');
              } else {
                draft.identities = uniqBy([...draft.identities, ...data.items], 'id');
              }

              draft.identitiesHasMore = data.items.length >= (params.pageSize || 20);
            }),
            false,
            n('useFetchIdentities/onSuccess'),
          );
        },
        keepPreviousData: false,
        revalidateOnFocus: false,
      },
    );
  };
}

export type IdentityAction = Pick<IdentityActionImpl, keyof IdentityActionImpl>;
