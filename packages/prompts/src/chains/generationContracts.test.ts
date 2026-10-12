import { describe, expect, it } from 'vitest';

import {
  AGENT_SIGNAL_FEEDBACK_DOMAIN_JSON_SCHEMA,
  AGENT_SIGNAL_FEEDBACK_DOMAIN_PROMPT_VERSION,
  AGENT_SIGNAL_FEEDBACK_SATISFACTION_JSON_SCHEMA,
  AGENT_SIGNAL_FEEDBACK_SATISFACTION_PROMPT_VERSION,
  chainAgentSignalAnalyzeIntentFeedbackSatisfaction,
  chainAgentSignalAnalyzeIntentRoute,
} from './index';

describe('application generation chains', () => {
  it('keeps Agent Signal satisfaction messages, schema, and version together', () => {
    const { messages } = chainAgentSignalAnalyzeIntentFeedbackSatisfaction({
      message: 'This works better.',
      serializedContext: 'topic=review',
    });

    expect(AGENT_SIGNAL_FEEDBACK_SATISFACTION_PROMPT_VERSION).toBe('v1');
    expect(AGENT_SIGNAL_FEEDBACK_SATISFACTION_JSON_SCHEMA.name).toBe(
      'agent_signal_feedback_satisfaction',
    );
    expect(messages[1].content).toContain('This works better.');
  });

  it('keeps Agent Signal domain-routing messages, schema, and version together', () => {
    const { messages } = chainAgentSignalAnalyzeIntentRoute({
      evidence: [{ cue: 'future', excerpt: 'Remember this workflow.' }],
      message: 'Remember this workflow.',
      reason: 'Reusable instruction',
      result: 'satisfied',
    });

    expect(AGENT_SIGNAL_FEEDBACK_DOMAIN_PROMPT_VERSION).toBe('v1');
    expect(AGENT_SIGNAL_FEEDBACK_DOMAIN_JSON_SCHEMA.name).toBe(
      'agent_signal_feedback_domain_route',
    );
    expect(messages[1].content).toContain('Remember this workflow.');
  });
});
