import { isDeepStrictEqual } from 'node:util';

const composerNames = [
  'Write a project update…',
  'Write first project update…',
  'Write a project update',
  'Write first project update',
];

// This registry is the execution boundary, not documentation. New entries require
// review that every click is known read-only on both exact starting surfaces.
export const AUTHORIZED_SCENARIOS = {
  'composer-entry-example-v1': {
    actions: [{ names: composerNames, selector: null, type: 'click' }],
    candidate: {
      cdp: 'http://localhost:9223',
      mappings: [
        ['/orvilo-dev', '/:workspace'],
        ['wave-2-verify-project', ':project'],
      ],
      match: 'app://renderer/',
      readinessScope:
        "[data-insp-path^='src/features/Projects/Layout/index.tsx:']:not([data-insp-path^='src/features/Projects/Layout/index.tsx:'] [data-insp-path^='src/features/Projects/Layout/index.tsx:'])",
      start: 'app://renderer/orvilo-dev/project/wave-2-verify-project/overview',
    },
    reference: {
      cdp: 'http://localhost:9222',
      mappings: [
        ['/bdiverifier', '/:workspace'],
        [
          'acp-harness-%E9%80%80%E5%BD%B9-caid-%E5%B7%A5%E7%A8%8B%E5%8C%96-0b1d5e6029a2',
          ':project',
        ],
      ],
      match:
        'https://linear.app/bdiverifier/project/acp-harness-%E9%80%80%E5%BD%B9-caid-%E5%B7%A5%E7%A8%8B%E5%8C%96-0b1d5e6029a2/',
      readinessScope: null,
      start:
        'https://linear.app/bdiverifier/project/acp-harness-%E9%80%80%E5%BD%B9-caid-%E5%B7%A5%E7%A8%8B%E5%8C%96-0b1d5e6029a2/overview',
    },
  },
};

const surfacePlan = (surface) => ({
  cdp: surface.cdp,
  mappings: surface.mappings || [],
  match: surface.match,
  readinessScope: surface.readinessScope || null,
  start: surface.start,
});

export function authorizationPlan(config, actions) {
  return {
    actions: actions.map((action) => ({
      ...(action.type === 'click'
        ? { names: action.names, selector: action.selector || null }
        : {}),
      type: action.type,
    })),
    candidate: surfacePlan(config.candidate),
    reference: surfacePlan(config.reference),
  };
}

export function assertAuthorizedScenario(config, actions, registry = AUTHORIZED_SCENARIOS) {
  if (typeof config.authorization !== 'string' || !registry[config.authorization]) {
    throw new Error(
      'Execution denied: scenario is not registered in the reviewed authorization registry.',
    );
  }
  if (!isDeepStrictEqual(authorizationPlan(config, actions), registry[config.authorization])) {
    throw new Error(
      `Execution denied: ${config.authorization} does not match its registered execution plan.`,
    );
  }
}
