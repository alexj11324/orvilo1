'use client';

// MIT Copyright (c) 2023 LobeHub; full notice in packages/brand-icons/LICENSE.
import IconCombine, { type IconCombineProps } from '../../features/IconCombine';
import { COMBINE_SPACE_MULTIPLE, COMBINE_TEXT_MULTIPLE, TITLE } from '../style';
import Color from './Color';
import Mono from './Mono';
import Text from './Text';

export interface CombineProps extends Omit<IconCombineProps, 'Icon' | 'Text'> {
  type?: 'color' | 'mono';
}
const Combine = ({ type = 'mono', ...rest }: CombineProps) => (
  <IconCombine
    Icon={type === 'color' ? Color : Mono}
    Text={Text}
    aria-label={TITLE}
    spaceMultiple={COMBINE_SPACE_MULTIPLE}
    textMultiple={COMBINE_TEXT_MULTIPLE}
    {...rest}
  />
);
export default Combine;
