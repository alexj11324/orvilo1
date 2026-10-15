import { type FC } from 'react';

import { Image } from '@/components/ImagePreview';

const ImageWrapper: FC<{ alt: string; src: string }> = ({ alt, src, ...rest }) => {
  return <Image alt={alt} src={src} {...rest} />;
};

export default ImageWrapper;
