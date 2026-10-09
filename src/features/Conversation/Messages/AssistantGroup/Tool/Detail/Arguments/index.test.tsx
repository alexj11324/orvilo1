/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FallbackArgumentRender } from '../Render/FallbacktArgumentRender';
import Arguments from './index';

vi.mock('@/components/ActionIcon', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: ({
    active,
    onClick,
    title,
  }: {
    active?: boolean;
    onClick?: () => void;
    title?: string;
  }) => (
    <button aria-pressed={active} type="button" onClick={onClick}>
      {title}
    </button>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { ns?: string }) =>
      (
        ({
          'components.aiElements.tool.parameters': 'Parameters',
          'components.aiElements.tool.result': 'Result',
          'components.aiElements.tool.error': 'Error',
          'workingPanel.review.wordWrap.disable': 'Disable word wrap',
          'workingPanel.review.wordWrap.enable': 'Enable word wrap',
        }) as Record<string, string>
      )[options?.ns === 'chat' ? key : key] || key,
  }),
}));

describe('Arguments', () => {
  it.each(['', '{}'])('keeps empty parameters and the actual result readable (%s)', (args) => {
    render(
      <FallbackArgumentRender
        content={'"Tool finished"'}
        requestArgs={args}
        toolCallId="tool-result"
      />,
    );

    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText('Tool finished')).toBeInTheDocument();
  });

  it('keeps argument values collapsed by default and toggles wrapping', () => {
    const { container } = render(
      <Arguments arguments={JSON.stringify({ file_path: '/very/long/path/to/file.ts' })} />,
    );

    expect(container.querySelector('[data-wrap]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /enable word wrap/i }));

    expect(container.querySelector('[data-wrap]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable word wrap/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it.each(['0', 'false', 'null'])('preserves legitimate primitive tool result %s', (content) => {
    render(<FallbackArgumentRender content={content} requestArgs="{}" toolCallId="primitive" />);
    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('surfaces error text even when the tool returned no output body', () => {
    render(
      <FallbackArgumentRender
        content=""
        errorText="Connection timed out"
        requestArgs="{}"
        toolCallId="error"
      />,
    );
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Connection timed out')).toBeInTheDocument();
  });

  it('keeps partial streaming parameters visible', () => {
    render(<Arguments loading arguments={'{"path":"/tmp/example"'} />);
    expect(screen.getByText(/\/tmp\/example/)).toBeInTheDocument();
  });
});
