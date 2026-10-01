import type {
  ControlErrorCode,
  ControlResult,
  InferenceAuthority,
  InferenceAuthoritySnapshot,
  InferenceBroker,
  ProviderBinding,
  TrustedProviderBackend,
} from '@orvilo/agent-execution/controlPlane';
import { CONTROL_PLANE_VERSION, createInferenceBroker } from '@orvilo/agent-execution/controlPlane';
import type { HarnessInitModel } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import type { BuildInferenceRequest } from '@orvilo/agent-execution/controlPlane/server';
import type { OrviloEngineKind, ProviderBindingConfig } from '@orvilo/types';

import type { OrviloDatabase } from '@/database/type';

import { SqlTrustedProviderBackend } from '../providerBinding/controlPlane';
import type {
  BindingExecutionClaim,
  IssueBindingExecutionForClaim,
  ResolveOrviloProviderBindingForTarget,
} from '../providerBinding/execution';
import { issueBindingExecution, resolveOrviloProviderBinding } from '../providerBinding/execution';
import type { CanonicalRunBinding } from './canonicalRun';
import { CanonicalRunAuthority } from './canonicalRun';

export interface EmbeddedInferenceBridge {
  /** Session-pinned admission seam for `PrimeEmbeddedRuntime`. */
  buildInferenceRequest: BuildInferenceRequest;
  /** The revision-fenced issuance pinned at composition. The host re-verifies
   * it under the canonical launch locks so a mid-compose bump fails closed. */
  claim: BindingExecutionClaim;
  /** Trusted broker port the runtime answers `broker.infer` with. */
  inferenceBroker: InferenceBroker;
  /** Model identity pinned into `harness.init` — runner-visible, never secret. */
  initModel: HarnessInitModel;
}

export interface EmbeddedInferenceBridgeDeps {
  backend?: TrustedProviderBackend;
  /** Canonically registered run — the only scope the bridge may serve. */
  binding: CanonicalRunBinding;
  database: OrviloDatabase;
  engine?: OrviloEngineKind | string | null;
  issueExecution?: IssueBindingExecutionForClaim;
  now?: () => number;
  /** Test seams — replace binding resolution and issuance. */
  resolveBinding?: ResolveOrviloProviderBindingForTarget;
  /** Test seam — replaces canonical admission without a live DB. */
  runAuthority?: Pick<CanonicalRunAuthority, 'withRun'>;
  target?: ProviderBindingConfig['selection']['target'];
}

const failure = (code: ControlErrorCode, message: string): ControlResult<never> => ({
  ok: false,
  error: { code, message, retryable: false },
});

/**
 * Binding row vanished or changed underneath a run — a tombstone that every
 * `checkInference` gate denies loudly, never a fabricated substitute.
 */
const unavailableBinding = (): ProviderBinding => ({
  bindingId: '',
  modelRoutes: [],
  ownerId: '',
  providerId: '',
  revision: -1,
  schemaVersion: CONTROL_PLANE_VERSION,
  secretReference: '',
  tenantId: '',
});

/**
 * Compose the phase-3 bridge for one canonically registered embedded run.
 *
 * Admission layout:
 *  - composition resolves `resolveOrviloProviderBinding` → `issueBindingExecution`
 *    → `backend.capabilities` and PINS {bindingId, revision, modelRoute} — the
 *    runner's `broker.infer` handler is synchronous, so nothing async may sit
 *    between it and admission.
 *  - `buildInferenceRequest` attaches the session fence (host-attached at
 *    launch, never payload) and the pinned revision; a route outside the
 *    issued binding is rejected before the broker stream starts.
 *  - `createInferenceBroker` re-resolves per call and per streamed event —
 *    grant/lease/fence plus a fresh `issueBindingExecution` under the
 *    canonical row locks — so a revoked grant, expired lease or bumped binding
 *    revision aborts the stream mid-flight.
 */
export async function createEmbeddedInferenceBridge(
  deps: EmbeddedInferenceBridgeDeps,
): Promise<ControlResult<EmbeddedInferenceBridge>> {
  const target = deps.target ?? 'sandbox';
  const backend = deps.backend ?? new SqlTrustedProviderBackend(deps.database);
  const resolve = deps.resolveBinding ?? resolveOrviloProviderBinding;
  const issue = deps.issueExecution ?? issueBindingExecution;
  const runAuthority = deps.runAuthority ?? new CanonicalRunAuthority(deps.database);

  const row = await resolve(deps.database, deps.binding.userId, deps.engine ?? null, target);
  if (!row) return failure('unauthorized', 'No provider binding resolves in this run scope');

  const claim: BindingExecutionClaim = {
    bindingId: row.id,
    bindingRevision: row.revision,
    ownerId: deps.binding.userId,
    tenantId: deps.binding.workspaceId,
  };
  const issued = await issue(deps.database, claim);
  if (!issued) return failure('unauthorized', 'Provider binding is not issuable in this run scope');

  const pinned = issued.binding;
  const capability = (await backend.capabilities(pinned)).find(
    (item) => item.modelRoute === pinned.modelRoutes[0],
  );
  if (!capability || capability.text !== true)
    return failure(
      'unsupported_capability',
      'Provider capability is not issuable in this run scope',
    );

  const authority: InferenceAuthority = {
    resolve: async (request): Promise<InferenceAuthoritySnapshot> => {
      const result = await runAuthority.withRun(deps.binding, async (snapshot, tx) => {
        const fresh = await issue(tx, claim);
        return { issued: fresh, snapshot };
      });
      if (!result.ok) {
        return {
          binding: pinned,
          bindingOwnerId: pinned.ownerId,
          capability,
          fence: request.fence,
          grantExpiresAt: 0,
          grantRevoked: true,
          leaseExpiresAt: 0,
        };
      }
      const { issued: fresh, snapshot } = result.value;
      return {
        binding: fresh?.binding ?? unavailableBinding(),
        bindingOwnerId: fresh?.binding.ownerId ?? '',
        capability,
        fence: snapshot.fence,
        grantExpiresAt: snapshot.grantExpiresAt,
        grantRevoked: false,
        leaseExpiresAt: snapshot.leaseExpiresAt,
      };
    },
  };

  const buildInferenceRequest: BuildInferenceRequest = ({ request, session }) => {
    if (request.modelRoute !== capability.modelRoute) {
      return {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Inference route outside the issued binding',
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      value: {
        bindingRevision: pinned.revision,
        fence: { ...session.fence },
        maxOutputTokens: request.maxOutputTokens,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        modelRoute: request.modelRoute,
        requestId: request.requestId,
        schemaVersion: CONTROL_PLANE_VERSION,
      },
    };
  };

  return {
    ok: true,
    value: {
      buildInferenceRequest,
      claim,
      inferenceBroker: createInferenceBroker({ authority, backend, now: deps.now }),
      initModel: { id: capability.modelRoute, maxOutputTokens: capability.maxOutputTokens },
    },
  };
}
