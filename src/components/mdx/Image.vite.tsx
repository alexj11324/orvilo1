import { cn } from 'cn';
import { type FC, type ImgHTMLAttributes } from 'react';

const ImageWrapper: FC<ImgHTMLAttributes<HTMLImageElement> & { alt: string; src: string }> = ({
  alt,
  className,
  src,
  ...rest
}) => (
  <img
    alt={alt}
    className={cn('my-4 h-auto max-w-full rounded-(--radius-card)', className)}
    loading="lazy"
    src={src}
    {...rest}
  />
);

export default ImageWrapper;
