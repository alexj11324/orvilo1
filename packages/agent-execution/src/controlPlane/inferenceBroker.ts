import { isRecord } from '@orvilo/utils/object';

import type {
  ControlError,
  ControlResult,
  ExecutionFence,
  InferenceBroker,
  InferenceEvent,
  InferenceRequest,
  ProviderBinding,
  ProviderBindingCheck,
  ProviderBindingRequest,
  ProviderConfigurationBroker,
  ProviderConfigurationScope,
  ProviderModelCapability,
} from './contracts';
import { CONTROL_PLANE_VERSION } from './contracts';

export interface InferenceAuthoritySnapshot {
  binding: ProviderBinding;
  /** Server-derived binding owner authorized by the task grant (may differ from agent principal). */
  bindingOwnerId: string;
  capability: ProviderModelCapability;
  fence: ExecutionFence;
  grantExpiresAt: number;
  grantRevoked: boolean;
  leaseExpiresAt: number;
}

/** Resolve route, current owner/revisions and grants from the control DB, never request payload. */
export interface InferenceAuthority {
  resolve: (request: InferenceRequest) => Promise<InferenceAuthoritySnapshot>;
}

export interface ConfigurationAuthoritySnapshot {
  binding: ProviderBinding;
  canCheck: boolean;
  revoked: boolean;
  scope: ProviderConfigurationScope;
}

export interface ConfigurationAuthority {
  resolve: (request: ProviderBindingRequest) => Promise<ConfigurationAuthoritySnapshot>;
}

/** Trusted implementation resolves vault references in scope. No raw credentials cross this port.
 * It must enforce endpoint/network policy and strip provider error bodies and headers.
 * check must make a real provider request; persisted configuration is insufficient. */
export interface TrustedProviderBackend {
  capabilities: (binding: ProviderBinding) => Promise<ProviderModelCapability[]>;
  check: (binding: ProviderBinding) => Promise<boolean>;
  infer: (
    binding: ProviderBinding,
    request: InferenceRequest,
    options?: { signal?: AbortSignal },
  ) => AsyncIterable<InferenceEvent>;
}

const error = (code: ControlError['code'], message: string): ControlError => ({
  code,
  message,
  retryable: false,
});
const failure = (value: ControlError): ControlResult<never> => ({ ok: false, error: value });
const validRevision = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const fenceStrings = [
  'tenantId',
  'principalId',
  'taskId',
  'grantId',
  'ownerId',
  'leaseId',
] as const;
const fenceRevisions = ['epoch', 'policyRevision', 'stateRevision'] as const;
const scopeStrings = ['tenantId', 'principalId', 'ownerId'] as const;
const validFence = (value: unknown): value is ExecutionFence =>
  isRecord(value) &&
  fenceStrings.every((key) => nonempty(value[key])) &&
  fenceRevisions.every((key) => validRevision(value[key]));
const validScope = (value: unknown): value is ProviderConfigurationScope =>
  isRecord(value) &&
  scopeStrings.every((key) => nonempty(value[key])) &&
  validRevision(value.authorityRevision);
const validBinding = (value: unknown): value is ProviderBinding =>
  isRecord(value) &&
  value.schemaVersion === CONTROL_PLANE_VERSION &&
  ['bindingId', 'tenantId', 'ownerId', 'providerId', 'secretReference'].every((key) =>
    nonempty(value[key]),
  ) &&
  validRevision(value.revision) &&
  Array.isArray(value.modelRoutes) &&
  value.modelRoutes.every(nonempty);

function checkInference(
  request: InferenceRequest,
  snapshot: InferenceAuthoritySnapshot,
  now: number,
): ControlError | undefined {
  if (
    snapshot.grantRevoked !== false ||
    !Number.isFinite(now) ||
    !Number.isFinite(snapshot.grantExpiresAt) ||
    snapshot.grantExpiresAt <= now
  )
    return error('revoked', 'Inference grant revoked or expired');
  if (!Number.isFinite(snapshot.leaseExpiresAt) || snapshot.leaseExpiresAt <= now)
    return error('lease_expired', 'Inference owner lease expired');
  if (
    !validFence(snapshot.fence) ||
    [...fenceStrings, ...fenceRevisions].some((key) => request.fence[key] !== snapshot.fence[key])
  ) {
    return error('stale_fence', 'Inference authority changed');
  }
  const binding = snapshot.binding;
  if (
    !validBinding(binding) ||
    !nonempty(snapshot.bindingOwnerId) ||
    binding.tenantId !== request.fence.tenantId ||
    binding.ownerId !== snapshot.bindingOwnerId ||
    binding.revision !== request.bindingRevision ||
    !binding.modelRoutes.includes(request.modelRoute)
  )
    return error('unauthorized', 'Provider route binding unavailable in scope');
  if (
    snapshot.capability.text !== true ||
    !validRevision(snapshot.capability.maxOutputTokens) ||
    snapshot.capability.maxOutputTokens < 1 ||
    snapshot.capability.modelRoute !== request.modelRoute ||
    request.maxOutputTokens > snapshot.capability.maxOutputTokens
  )
    return error('unsupported_capability', 'Inference capability or budget unavailable');
}

/** Every streaming event rechecks live authority. Backend must independently fence billing/network
 * admission and honor iterator cancellation; this guard cannot undo an already sent provider call. */
export function createInferenceBroker(deps: {
  authority: InferenceAuthority;
  backend: TrustedProviderBackend;
  now?: () => number;
}): InferenceBroker {
  const now = deps.now ?? Date.now;
  return {
    async *infer(input, options?: { signal?: AbortSignal }) {
      try {
        const request: InferenceRequest = structuredClone(input);
        if (request.schemaVersion !== CONTROL_PLANE_VERSION) {
          yield {
            type: 'error',
            error: error('unsupported_version', 'Unsupported inference schema'),
          };
          return;
        }
        if (
          !validFence(request.fence) ||
          !nonempty(request.requestId) ||
          !nonempty(request.modelRoute) ||
          !validRevision(request.bindingRevision) ||
          !Number.isSafeInteger(request.maxOutputTokens) ||
          request.maxOutputTokens <= 0 ||
          !Array.isArray(request.messages) ||
          request.messages.some(
            (message) =>
              !message ||
              !['system', 'user', 'assistant'].includes(message.role) ||
              typeof message.content !== 'string',
          )
        ) {
          yield { type: 'error', error: error('invalid_request', 'Invalid inference request') };
          return;
        }
        const snapshot = structuredClone(await deps.authority.resolve(structuredClone(request)));
        const denied = checkInference(request, snapshot, now());
        if (denied) {
          yield { type: 'error', error: denied };
          return;
        }
        // `for await` close does not reach a backend suspended on a pending
        // provider read (return() queues behind it), so the caller's signal is
        // threaded through to the backend's own abort path instead.
        for await (const event of deps.backend.infer(
          structuredClone(snapshot.binding),
          structuredClone(request),
          options,
        )) {
          const fresh = structuredClone(await deps.authority.resolve(structuredClone(request)));
          const revoked = checkInference(request, fresh, now());
          if (
            revoked ||
            fresh.binding.bindingId !== snapshot.binding.bindingId ||
            fresh.binding.secretReference !== snapshot.binding.secretReference
          ) {
            yield {
              type: 'error',
              error: revoked ?? error('stale_fence', 'Provider binding changed'),
            };
            return;
          }
          // Provider exceptions/error text can include endpoint, headers or credentials.
          if (event.type === 'error') {
            yield { type: 'error', error: error('runtime_failed', 'Provider inference failed') };
            return;
          }
          if (event.type === 'text' && typeof event.text === 'string')
            yield { type: 'text', text: event.text };
          else if (
            event.type === 'usage' &&
            validRevision(event.inputTokens) &&
            validRevision(event.outputTokens)
          ) {
            yield {
              type: 'usage',
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
            };
          } else {
            yield { type: 'error', error: error('runtime_failed', 'Invalid provider event') };
            return;
          }
        }
      } catch {
        yield { type: 'error', error: error('runtime_failed', 'Trusted inference unavailable') };
      }
    },
  };
}

function configurationDenied(
  request: ProviderBindingRequest,
  snapshot: ConfigurationAuthoritySnapshot,
): ControlError | undefined {
  if (snapshot.revoked !== false) return error('revoked', 'Configuration authority revoked');
  if (
    snapshot.canCheck !== true ||
    !validScope(snapshot.scope) ||
    [...scopeStrings, 'authorityRevision' as const].some(
      (key) => request.scope[key] !== snapshot.scope[key],
    )
  ) {
    return error('unauthorized', 'Configuration scope unauthorized');
  }
  const binding = snapshot.binding;
  if (
    !validBinding(binding) ||
    binding.tenantId !== request.scope.tenantId ||
    binding.ownerId !== request.scope.ownerId ||
    binding.bindingId !== request.bindingId ||
    binding.revision !== request.bindingRevision
  )
    return error('stale_fence', 'Configuration binding changed');
}

export function createProviderConfigurationBroker(deps: {
  authority: ConfigurationAuthority;
  backend: TrustedProviderBackend;
  now?: () => number;
}): ProviderConfigurationBroker {
  const now = deps.now ?? Date.now;
  const run = async <T>(
    input: ProviderBindingRequest,
    operation: (binding: ProviderBinding) => Promise<T>,
  ): Promise<ControlResult<T>> => {
    try {
      const request: ProviderBindingRequest = structuredClone(input);
      if (request.schemaVersion !== CONTROL_PLANE_VERSION)
        return failure(error('unsupported_version', 'Unsupported configuration schema'));
      if (
        !request.scope ||
        !nonempty(request.scope.tenantId) ||
        !nonempty(request.scope.ownerId) ||
        !nonempty(request.scope.principalId) ||
        !validRevision(request.scope.authorityRevision) ||
        !nonempty(request.bindingId) ||
        !validRevision(request.bindingRevision)
      )
        return failure(error('invalid_request', 'Invalid configuration request'));
      const snapshot = structuredClone(await deps.authority.resolve(structuredClone(request)));
      const denied = configurationDenied(request, snapshot);
      if (denied) return failure(denied);
      const value = await operation(structuredClone(snapshot.binding));
      const fresh = structuredClone(await deps.authority.resolve(structuredClone(request)));
      const recheck = configurationDenied(request, fresh);
      if (recheck) return failure(recheck);
      if (fresh.binding.secretReference !== snapshot.binding.secretReference)
        return failure(error('stale_fence', 'Configuration secret binding changed'));
      return { ok: true, value };
    } catch {
      return failure(error('runtime_failed', 'Trusted provider configuration unavailable'));
    }
  };
  return {
    capabilities: (request) =>
      run(request, async (binding) => {
        const capabilities = await deps.backend.capabilities(binding);
        return capabilities
          .filter(
            (item) =>
              binding.modelRoutes.includes(item.modelRoute) &&
              validRevision(item.maxOutputTokens) &&
              item.maxOutputTokens > 0,
          )
          .map((item) => ({
            modelRoute: item.modelRoute,
            text: item.text === true,
            images: item.images === true,
            tools: item.tools === true,
            maxOutputTokens: item.maxOutputTokens,
          }));
      }),
    checkBinding: (request) =>
      run<ProviderBindingCheck>(request, async (binding) => ({
        bindingId: binding.bindingId,
        bindingRevision: binding.revision,
        checkedAt: now(),
        status: (await deps.backend.check(binding)) === true ? 'ready' : 'unavailable',
      })),
  };
}
