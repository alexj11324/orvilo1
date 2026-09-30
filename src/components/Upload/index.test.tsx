import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Upload, { UploadDragger } from './index';

describe('Upload', () => {
  it('calls beforeUpload per selected file', () => {
    const beforeUpload = vi.fn();
    const { container } = render(
      <Upload multiple beforeUpload={beforeUpload}>
        <button>Pick</button>
      </Upload>,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];
    fireEvent.change(input, { target: { files } });

    expect(beforeUpload).toHaveBeenCalledTimes(2);
    expect(beforeUpload).toHaveBeenCalledWith(files[0], files);
    expect(beforeUpload).toHaveBeenCalledWith(files[1], files);
  });

  it('respects maxCount', () => {
    const beforeUpload = vi.fn();
    const { container } = render(
      <Upload multiple beforeUpload={beforeUpload} maxCount={1}>
        <button>Pick</button>
      </Upload>,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];
    fireEvent.change(input, { target: { files } });

    expect(beforeUpload).toHaveBeenCalledTimes(1);
    expect(beforeUpload).toHaveBeenCalledWith(files[0], [files[0]]);
  });

  it('does not open the picker when disabled', () => {
    const { container } = render(
      <Upload disabled>
        <button>Pick</button>
      </Upload>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByText('Pick'));
    expect(clickSpy).not.toHaveBeenCalled();
    expect(input).toBeDisabled();
  });
});

describe('UploadDragger', () => {
  it('accepts dropped files', () => {
    const beforeUpload = vi.fn();
    const { container } = render(
      <UploadDragger beforeUpload={beforeUpload}>Drop here</UploadDragger>,
    );

    const zone = container.firstElementChild as HTMLElement;
    const files = [new File(['a'], 'a.txt')];
    fireEvent.drop(zone, { dataTransfer: { files } });

    expect(beforeUpload).toHaveBeenCalledWith(files[0], files);
  });
});
