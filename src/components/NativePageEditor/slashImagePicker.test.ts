import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNativeSlashImagePicker } from './slashImagePicker';

function fixture() {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  const callbacks = { onFile: vi.fn(), onCancel: vi.fn(), onError: vi.fn() };
  const picker = createNativeSlashImagePicker({ doc: document, ...callbacks });
  picker.open();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Actual hidden native picker was not attached');
  return { picker, input, ...callbacks };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('native slash picker lifecycle', () => {
  it('cancel detaches the input and ignores any delayed change/cancel events', () => {
    const { input, onCancel, onFile } = fixture();
    input.dispatchEvent(new Event('cancel'));
    expect(input.isConnected).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('change delivers the exact image once and detaches both listeners', () => {
    const { input, onCancel, onFile } = fixture();
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    expect(input.isConnected).toBe(false);
    expect(onFile).toHaveBeenCalledExactlyOnceWith(file);
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('cancel'));
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('owner disposal prevents delayed picker callbacks without cancelling or consuming a query', () => {
    const { picker, input, onCancel, onFile, onError } = fixture();
    picker.dispose();
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('cancel'));
    picker.open();
    expect(input.isConnected).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onFile).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('a synchronous native picker failure cleans up and reports exactly once', () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      throw new Error('native picker unavailable');
    });
    const onError = vi.fn();
    const onFile = vi.fn();
    const onCancel = vi.fn();
    const picker = createNativeSlashImagePicker({ doc: document, onError, onFile, onCancel });
    picker.open();
    picker.open();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(onFile).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
