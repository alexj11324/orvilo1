/** @vitest-environment happy-dom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { I18nextProvider, setI18n } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as Reui from '@/components/reui/code-block/code-block';
import enCommon from '@/locales/default/common';

import zhCommon from '../../../locales/zh-CN/common.json';
import * as Ui from './code-block';

vi.unmock('react-i18next');

beforeEach(async () => {
  const i18n = createInstance();
  await i18n.init({ lng: 'en-US', resources: { 'en-US': { common: enCommon } } });
  setI18n(i18n);
});

afterEach(() => vi.restoreAllMocks());

describe.each([
  ['ui', Ui],
  ['reui', Reui],
] as const)('%s CodeBlock shorthand', (_, components) => {
  const { CodeBlock, CodeBlockContent, CodeBlockHeader, CodeBlockLanguage, CodeBlockCopyButton } =
    components;

  it.each([
    ['en-US', 'Copy', 'Copied'],
    ['zh-CN', '复制', '已复制'],
  ])('localizes copy feedback in %s', async (lng, copy, copied) => {
    const i18n = createInstance();
    await i18n.init({
      lng,
      keySeparator: false,
      resources: { 'en-US': { common: enCommon }, 'zh-CN': { common: zhCommon } },
    });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(
      <I18nextProvider i18n={i18n}>
        <CodeBlock code="const value = 1;" highlight={false} language="typescript" />
      </I18nextProvider>,
    );

    await user.click(screen.getByRole('button', { name: copy }));
    expect(writeText).toHaveBeenCalledWith('const value = 1;');
    expect(await screen.findByRole('button', { name: copied })).toBeVisible();
  });

  it.each(['default', 'ghost'] as const)(
    'shows language and copies code with %s framing',
    async (variant) => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      const { container } = render(
        <CodeBlock
          code={'const value = 1; // [!code highlight]\nconst next = 2;'}
          highlight={false}
          language="typescript"
          variant={variant}
        />,
      );

      expect(screen.getByText('typescript')).toBeVisible();
      expect(container.querySelectorAll('[data-slot="code-block-header"]')).toHaveLength(1);
      expect(container.querySelector('[data-slot="code-block"]')).toHaveAttribute(
        'data-variant',
        variant,
      );
      await user.click(screen.getByRole('button', { name: 'Copy' }));
      expect(writeText).toHaveBeenCalledWith('const value = 1;\nconst next = 2;');
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
    },
  );

  it('keeps an explicit header and content from rendering twice', () => {
    const { container } = render(
      <CodeBlock code="const value = 1;" highlight={false} language="typescript">
        <CodeBlockHeader>
          <CodeBlockLanguage />
          <CodeBlockCopyButton />
        </CodeBlockHeader>
        <CodeBlockContent />
      </CodeBlock>,
    );

    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(1);
    expect(screen.getAllByText('typescript')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="code-block-header"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="code-block-content"]')).toHaveLength(1);
  });

  it('copies with explicit copy-only chrome without adding a language header or another surface', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { container } = render(
      <CodeBlock code="printf 'hello'" highlight={false} language="bash" variant="ghost">
        <CodeBlockCopyButton />
      </CodeBlock>,
    );

    expect(container.querySelector('[data-slot="code-block-header"]')).toBeNull();
    expect(container.querySelector('[data-slot="code-block-language"]')).toBeNull();
    expect(container.querySelectorAll('[data-slot="code-block-content"]')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith("printf 'hello'");
  });

  it('leaves explicit content without copy or language controls', () => {
    render(
      <CodeBlock code="const value = 1;" highlight={false} language="typescript">
        <CodeBlockContent />
      </CodeBlock>,
    );

    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
    expect(screen.queryByText('typescript')).not.toBeInTheDocument();
    expect(screen.getByText('const value = 1;')).toBeInTheDocument();
  });
});
