import { registerBuiltinToolSurfaces } from '@orvilo/builtin-tools/register';
import { getBuiltinStreaming } from '@orvilo/builtin-tools/streamings';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { deriveFixtureProps } from '../lifecycleMode';
import orviloPageAgent from './orvilo-page-agent';

vi.mock('@/components/StreamingMarkdown', () => ({
  default: ({ children }: { children?: string }) => children || null,
}));

describe('orvilo-page-agent render gallery fixtures', () => {
  beforeAll(() => {
    registerBuiltinToolSurfaces();
  });

  it('exposes a partial initPage markdown payload for streaming previews', () => {
    const variant = orviloPageAgent.fixtures.initPage.variants[0];
    const props = deriveFixtureProps(variant, 'streaming');

    expect(props.isArgumentsStreaming).toBe(true);
    expect(props.pluginState).toBeUndefined();
    expect(props.args.markdown).toContain('Body segments are still streaming');
  });

  it('renders the registered initPage streaming preview from the demo payload', async () => {
    const Streaming = getBuiltinStreaming('orvilo-page-agent', 'initPage');
    const variant = orviloPageAgent.fixtures.initPage.variants[0];
    const props = deriveFixtureProps(variant, 'streaming');

    expect(Streaming).toBeDefined();

    render(
      createElement(Streaming as any, {
        apiName: 'initPage',
        args: props.args,
        identifier: 'orvilo-page-agent',
        messageId: 'demo-message',
        toolCallId: 'demo-tool-call',
      }),
    );

    expect(await screen.findAllByText('Devtools Render Gallery')).not.toHaveLength(0);
    expect(screen.getByText(/Body segments are still streaming/)).toBeInTheDocument();
  });
});
