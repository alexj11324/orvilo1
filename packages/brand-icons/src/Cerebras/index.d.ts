import type Avatar from './components/Avatar';
import type BrandColor from './components/BrandColor';
import type BrandMono from './components/BrandMono';
import type Color from './components/Color';
import type Combine from './components/Combine';
import type Mono from './components/Mono';
import type Text from './components/Text';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Brand: typeof BrandMono;
  BrandColor: typeof BrandColor;
  Color: typeof Color;
  Combine: typeof Combine;
  Text: typeof Text;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
