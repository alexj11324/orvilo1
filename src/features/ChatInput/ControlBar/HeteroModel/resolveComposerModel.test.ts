import type { HeterogeneousProviderConfig } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { getStaticModelOptions } from './modelOptions';
import { resolveComposerModelView, withDefaultModelOption } from './resolveComposerModel';

const claudeCode: HeterogeneousProviderConfig = { type: 'claude-code' };
const claudeCodeOptions = getStaticModelOptions('claude-code').map((option) => ({
  title: option.label,
  value: option.value,
}));

const view = (params: {
  composerSelection?: { model: string; provider: string };
  options?: { title: string; value: string }[];
  provider?: HeterogeneousProviderConfig;
  topicPin?: { model?: string; provider?: string };
}) =>
  resolveComposerModelView({
    composerSelection: params.composerSelection,
    options: params.options ?? claudeCodeOptions,
    provider: params.provider ?? claudeCode,
    topicPin: params.topicPin,
  });

describe('resolveComposerModelView', () => {
  it('stays inside the harness vocabulary when nothing is pinned or picked', () => {
    // The generic agent config falls back to the client `DEFAULT_MODEL` (a
    // model-bank LLM the CLI cannot run); the chip must never inherit it.
    expect(view({})).toEqual({
      current: 'default',
      isDefault: true,
      title: 'default',
    });
  });

  it('never names a value the harness list does not contain', () => {
    const { current, isDefault, title } = view({});
    const known = claudeCodeOptions.map((option) => option.value);

    expect(known).not.toContain(current);
    // `default` is the one sentinel outside the list, and it is rendered by the
    // caller's own label rather than by either name.
    expect(isDefault).toBe(true);
    expect(title).toBe('default');
  });

  it('shows a pick made in the blank composer', () => {
    expect(view({ composerSelection: { model: 'opus', provider: 'claude-code' } })).toMatchObject({
      current: 'opus',
      isDefault: false,
      title: 'Opus',
    });
  });

  it('follows the pick after the topic exists, through the topic pin', () => {
    expect(view({ topicPin: { model: 'sonnet', provider: 'claude-code' } })).toMatchObject({
      current: 'sonnet',
      isDefault: false,
      title: 'Sonnet',
    });
  });

  it('lets the topic pin outrank a stale composer pick', () => {
    expect(
      view({
        composerSelection: { model: 'opus', provider: 'claude-code' },
        topicPin: { model: 'haiku', provider: 'claude-code' },
      }),
    ).toMatchObject({ current: 'haiku', title: 'Haiku' });
  });

  it('ignores a pick or pin minted for another provider', () => {
    // A value another harness accepted would put the chip back outside this
    // harness's vocabulary.
    expect(
      view({
        composerSelection: { model: 'gpt-5.6-terra', provider: 'codex' },
        topicPin: { model: 'gpt-5.6-terra', provider: 'codex' },
      }),
    ).toMatchObject({ current: 'default', isDefault: true });
  });

  it('shows the agent-configured selector model when the conversation chose nothing', () => {
    expect(
      view({
        provider: { model: 'opus', type: 'claude-code' },
      }),
    ).toMatchObject({ current: 'opus', isDefault: false, title: 'Opus' });
  });

  it('falls back to the raw selector value while the harness list is unavailable', () => {
    // A catalog probe that failed (or has not returned) leaves `options` empty —
    // the value is still the harness's own, so it is shown verbatim.
    expect(view({ options: [], topicPin: { model: 'sonnet', provider: 'claude-code' } })).toEqual({
      current: 'sonnet',
      isDefault: false,
      title: 'sonnet',
    });
  });

  it('puts the harness default back at the top of the list, keeping the order', () => {
    expect(withDefaultModelOption(claudeCodeOptions, 'Default')).toEqual([
      { title: 'Default', value: 'default' },
      { title: 'Fable', value: 'fable' },
      { title: 'Opus', value: 'opus' },
      { title: 'Sonnet', value: 'sonnet' },
      { title: 'Haiku', value: 'haiku' },
    ]);
  });

  it('names the sentinel with the picker row’s own wording, not a second name', () => {
    // The row (`withDefaultModelOption`) and the chip both take the label from
    // `COMPOSER_DEFAULT_MODEL_LABEL_KEY`, so "let the CLI decide" has one name.
    const options = withDefaultModelOption(claudeCodeOptions, 'Default');

    expect(view({ options })).toEqual({ current: 'default', isDefault: true, title: 'Default' });
  });

  it('reports the neutral default for a harness with no model dimension', () => {
    expect(view({ provider: { type: 'amp' } })).toEqual({
      current: 'default',
      isDefault: true,
      title: 'default',
    });
  });
});
