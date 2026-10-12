import { act, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { confirmModal, createModal, Modal, ModalHost, useModalContext } from '.';

const originalAnimate = Element.prototype.animate;
beforeAll(() => {
  Element.prototype.animate = function (this: Element, ...args) {
    const animation = originalAnimate.apply(this, args);
    animation.finished.catch(() => {});
    return animation;
  } as typeof originalAnimate;
});
afterAll(() => {
  Element.prototype.animate = originalAnimate;
});

const renderHost = () => render(<ModalHost />);

describe('createModal', () => {
  it('renders title and content through the host', async () => {
    renderHost();

    act(() => {
      createModal({ content: <div>body-here</div>, title: 'my title' });
    });

    expect(await screen.findByText('my title')).toBeInTheDocument();
    expect(screen.getByText('body-here')).toBeInTheDocument();
  });

  it('update() merges props on the mounted entry', async () => {
    renderHost();

    const instance = createModal({ content: <div>v1</div>, title: 'before' });
    expect(await screen.findByText('v1')).toBeInTheDocument();

    act(() => {
      instance.update({ content: <div>v2</div>, title: 'after' });
    });

    expect(await screen.findByText('v2')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
    act(() => instance.destroy());
  });

  it('close() dismisses the modal and fires onOpenChangeComplete', async () => {
    renderHost();
    const onComplete = vi.fn();

    const instance = createModal({
      content: <div>bye</div>,
      onOpenChangeComplete: onComplete,
      title: 't',
    });
    expect(await screen.findByText('bye')).toBeInTheDocument();

    act(() => instance.close());

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.queryByText('bye')).not.toBeInTheDocument());
  });

  it('useModalContext().close closes from inside the content', async () => {
    const Content = () => {
      const { close } = useModalContext();
      return <button onClick={close}>close-me</button>;
    };
    renderHost();

    createModal({ content: <Content />, title: 't' });
    const btn = await screen.findByText('close-me');

    act(() => btn.click());

    await waitFor(() => expect(screen.queryByText('close-me')).not.toBeInTheDocument());
  });

  it('renders a labelled close control', async () => {
    renderHost();
    createModal({ content: <div>body</div>, title: 't' });
    expect(await screen.findByText('body')).toBeInTheDocument();

    const labelled = screen.getAllByRole('button').find((el) => el.getAttribute('aria-label'));
    expect(labelled?.getAttribute('aria-label')).toBeTruthy();
    // Pin to the close chrome (top-right icon button), not just any labelled control.
    expect(labelled?.className).toContain('absolute top-2');
  });

  it('maskClosable: false ignores outside presses but keeps Escape dismiss', async () => {
    renderHost();

    createModal({ content: <div>stay</div>, maskClosable: false, title: 't' });
    expect(await screen.findByText('stay')).toBeInTheDocument();

    const backdrop = document.querySelector('[data-slot="dialog-overlay"], .fixed.inset-0');
    if (backdrop) {
      act(() => {
        backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        backdrop.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(screen.getByText('stay')).toBeInTheDocument();
    }
  });
});

describe('confirmModal', () => {
  it('async onOk closes on resolve', async () => {
    renderHost();
    let resolve!: () => void;
    const done = new Promise<void>((r) => {
      resolve = r;
    });

    confirmModal({ content: 'sure?', onOk: () => done, title: 'confirm' });
    const okBtn = (await screen.findByText('OK')) as HTMLButtonElement;

    act(() => okBtn.click());
    await waitFor(() => expect(okBtn.disabled || screen.queryByRole('status')).toBeTruthy());

    await act(async () => resolve());
    await waitFor(() => expect(screen.queryByText('sure?')).not.toBeInTheDocument());
  });

  it('async onOk stays open on reject', async () => {
    renderHost();

    confirmModal({
      content: 'still-here',
      onOk: () => Promise.reject(new Error('nope')),
      title: 'confirm',
    });
    const okBtn = await screen.findByText('OK');

    await act(async () => {
      okBtn.click();
      await Promise.resolve();
    });

    expect(screen.getByText('still-here')).toBeInTheDocument();
  });
});

describe('Modal button size forwarding', () => {
  it('forwards declarative OK and Cancel sizes without dropping either callback', async () => {
    const onOk = vi.fn();
    const onCancel = vi.fn();
    const okClick = vi.fn();
    const cancelClick = vi.fn();
    render(
      <Modal
        open
        cancelButtonProps={{ size: 'compact', onClick: cancelClick }}
        cancelText="Cancel sized"
        okButtonProps={{ size: 'lg', onClick: okClick }}
        okText="Save sized"
        title="Sized dialog"
        onCancel={onCancel}
        onOk={onOk}
      />,
    );
    const ok = await screen.findByRole('button', { name: 'Save sized' });
    const cancel = screen.getByRole('button', { name: 'Cancel sized' });
    expect(ok).toHaveClass('h-9');
    expect(cancel).toHaveClass('h-8');
    act(() => ok.click());
    act(() => cancel.click());
    expect(onOk).toHaveBeenCalledOnce();
    expect(okClick).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(cancelClick).toHaveBeenCalledOnce();
  });

  it('forwards imperative OK size and retains async completion behavior', async () => {
    renderHost();
    const onOk = vi.fn().mockResolvedValue(undefined);
    const onClick = vi.fn();
    act(() => {
      confirmModal({
        title: 'Sized confirm',
        okText: 'Confirm sized',
        okButtonProps: { size: 'lg', onClick },
        onOk,
      });
    });
    const ok = await screen.findByRole('button', { name: 'Confirm sized' });
    expect(ok).toHaveClass('h-9');
    await act(async () => {
      ok.click();
    });
    expect(onClick).toHaveBeenCalledOnce();
    expect(onOk).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText('Sized confirm')).not.toBeInTheDocument());
  });
});
