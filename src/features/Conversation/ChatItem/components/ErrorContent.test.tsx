/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as errorAlertModule from '../../components/ErrorAlert';
import ErrorContent from './ErrorContent';

const deleteMessageMock = vi.fn();
const updateMessageErrorMock = vi.fn();
let messageContent: string | undefined = '';
let isRegenerating = false;
let realAlert = false;

// Drive the Alert's `afterClose` directly via a click, so we exercise
// ErrorContent's dismiss branching without the real close animation.
vi.mock('../../components/ErrorAlert', async (importOriginal) => {
  const actual = await importOriginal<typeof errorAlertModule>();
  const RealAlert = actual.default;
  return {
    ...actual,
    default: (props: ComponentProps<typeof RealAlert>) => {
      if (realAlert) return <RealAlert {...props} />;
      const { action, afterClose } = props;
      return (
        <div>
          <button type="button" onClick={() => afterClose?.()}>
            close
          </button>
          {action}
        </div>
      );
    },
  };
});

vi.mock('@/features/Conversation/store', () => ({
  dataSelectors: {
    getDisplayMessageById: (id: string) => () => ({ content: messageContent, id }),
  },
  messageStateSelectors: {
    isMessageRegenerating: () => () => isRegenerating,
  },
  useConversationStore: (selector: (s: unknown) => unknown) =>
    selector({
      deleteMessage: deleteMessageMock,
      updateMessageError: updateMessageErrorMock,
    }),
}));

describe('ErrorContent dismiss behavior', () => {
  beforeEach(() => {
    deleteMessageMock.mockClear();
    updateMessageErrorMock.mockClear();
    isRegenerating = false;
    realAlert = false;
  });

  it('keeps technical details collapsed until explicitly requested', () => {
    realAlert = true;
    const view = render(
      <ErrorContent
        error={{ message: 'Configure a device', extra: <pre>DEVICE_REQUIRED detail</pre> }}
        id="msg-details"
      />,
    );
    expect(view.queryByText('DEVICE_REQUIRED detail')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: /View details|appLoading.showDetail/i }));
    expect(view.getByText('DEVICE_REQUIRED detail')).toBeTruthy();
  });

  it('clears only the error (keeps the message) when the turn already streamed content', () => {
    messageContent = 'already streamed text';
    render(<ErrorContent error={{ message: 'boom' } as any} id="msg-1" />);

    fireEvent.click(screen.getByText('close'));

    expect(updateMessageErrorMock).toHaveBeenCalledWith('msg-1', null);
    expect(deleteMessageMock).not.toHaveBeenCalled();
  });

  it('deletes the message when it is just an empty error', () => {
    messageContent = '';
    render(<ErrorContent error={{ message: 'boom' } as any} id="msg-1" />);

    fireEvent.click(screen.getByText('close'));

    expect(deleteMessageMock).toHaveBeenCalledWith('msg-1');
    expect(updateMessageErrorMock).not.toHaveBeenCalled();
  });

  // Regression: `regenerate` sits outside AI_RUNTIME_OPERATION_TYPES, so nothing
  // else on the message reacts while a retry is in flight. Verified live: with a
  // regenerate op genuinely running, the message showed zero loading affordance
  // — the click read as "nothing happened" and invited a second one.
  it('puts the retry button in a pending state while this message is regenerating', () => {
    messageContent = '';
    isRegenerating = true;
    render(<ErrorContent error={{ message: 'boom' } as any} id="msg-1" onRegenerate={vi.fn()} />);

    const button = screen.getByRole('button', { name: /regenerate/i });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('leaves the retry button idle when nothing is regenerating', () => {
    messageContent = '';
    render(<ErrorContent error={{ message: 'boom' } as any} id="msg-1" onRegenerate={vi.fn()} />);

    const button = screen.getByRole('button', { name: /regenerate/i });

    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });
});
