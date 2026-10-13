import type { OpenAIChatMessage } from '@orvilo/types';

/** Bump when the goal decomposition planning prompt meaningfully changes. */
export const GOAL_DECOMPOSE_PROMPT_VERSION = 'v5';

export const GOAL_DECOMPOSE_JSON_SCHEMA = {
  name: 'goal_decomposition',
  schema: {
    additionalProperties: false,
    properties: {
      problemStatement: { maxLength: 280, minLength: 1, type: 'string' },
      tasks: {
        items: {
          additionalProperties: false,
          properties: {
            dependsOn: { items: { minimum: 0, type: 'integer' }, type: 'array' },
            hypothesis: { maxLength: 280, type: ['string', 'null'] },
            instruction: { minLength: 1, type: 'string' },
            title: { maxLength: 80, minLength: 1, type: 'string' },
          },
          required: ['title', 'instruction', 'dependsOn', 'hypothesis'],
          type: 'object',
        },
        maxItems: 5,
        minItems: 1,
        type: 'array',
      },
    },
    required: ['problemStatement', 'tasks'],
    type: 'object' as const,
  },
  strict: true,
};

interface GoalDecomposeInput {
  requirement: string;
}

/**
 * Plan the opening exploration structure of a goal graph: the core question it
 * answers plus the independent task directions to pursue, before anything runs.
 */
export const chainGoalDecompose = ({
  requirement,
}: GoalDecomposeInput): {
  messages: OpenAIChatMessage[];
} => ({
  messages: [
    {
      content: [
        'You plan executable tasks for a persistent autonomous goal.',
        'Decompose the goal into the outcome it must achieve and the tasks that together deliver it. Preserve the requested action: a request to build, fix, or upgrade requires implementation, not just investigation or verification.',
        'Guidelines:',
        '- problemStatement is 1–2 sentences naming the core question or outcome of the goal, in your own words. Never copy the acceptance-criteria list into it.',
        '- Return 1–5 tasks. A complex goal (analysis, research, multi-stage delivery) must be split into several directions that can be explored independently or in sequence — e.g. gather the raw material, analyze it from distinct angles, then synthesize. A genuinely small single-step goal may stay as one task.',
        '- Each task.title names its direction concisely; titles must be distinct from each other and from the goal name.',
        '- Each task.instruction is a complete, self-contained brief for an autonomous agent working on that direction only: what to do, the concrete deliverable, and how that deliverable will be judged. Include only the requirements relevant to this direction — never paste the full goal acceptance list into every task.',
        '- Align each task\'s actions, deliverable, and pass conditions. Explicitly state whether its responsibility is investigation, implementation, or verification; avoid ambiguous briefs such as "establish a baseline" without naming the expected deliverable.',
        '- An investigation task delivers evidence-backed current state, gaps, and actionable recommendations. It may pass when it proves a capability is missing; never require an investigation-only task to prove that the missing capability already works.',
        '- For build, fix, or upgrade goals, assign explicit implementation ownership for every requested capability. Implementation tasks must inspect what exists, implement or repair missing behavior within their scope, establish a runnable environment, and demonstrate the resulting behavior. A capability matrix, blocker report, or repeated checks of an unchanged product cannot substitute for working changes.',
        '- A verification task consumes an implemented deliverable and judges its behavior. Put successful product behavior criteria on the implementation and verification tasks that own them, not on preliminary investigation. If investigation is needed first, include dependent implementation tasks that consume its findings; do not produce an investigation-and-verification-only plan for a delivery goal.',
        '- Describe known prerequisite outputs and genuine external dependencies. Do not assume the user will supply an already implemented feature that the goal asks the agent to build. Preserve explicit read-only or other authorization constraints; an investigation-only goal must not become an implementation task.',
        "- Before returning, check that executing the listed actions can satisfy each task's pass conditions and that the tasks collectively deliver the requested outcome. For example, an editor upgrade may start with a gap report, then implement editing and persistence, then verify save/reopen; the gap report does not require successful editing, and discovering a read-only viewer triggers implementation rather than repeated inspection.",
        '- Preserve every concrete URL, scope, constraint, and numeric threshold from the goal in whichever task it belongs to.',
        '- Order tasks so that earlier ones produce what later ones consume.',
        '- For each task, set dependsOn to the 0-based indices of the earlier tasks whose outputs it consumes; use [] for a task that can start immediately. A pipeline-shaped goal (gather → analyze → synthesize) must express those edges — do not mark every task independent — but never invent a dependency the task does not actually need.',
        '- hypothesis marks a task as a candidate answer under test: one sentence stating what the direction bets on, which its result may confirm or refute, and from which later branches may be derived. Set it only for genuinely uncertain approaches that compete with or may replace an alternative. Certain delivery steps — gathering material, implementing a requested change, verifying a deliverable, writing a report — take null. Most goals have no hypothesis at all; never invent one to decorate an ordinary step.',
        '- Write all fields in the language used by the goal.',
      ].join('\n'),
      role: 'system',
    },
    { content: `## Goal\n${requirement}`, role: 'user' },
  ],
});
