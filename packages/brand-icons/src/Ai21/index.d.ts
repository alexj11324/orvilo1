import type Avatar from './components/Avatar';
import type Brand from './components/Brand';
import type BrandColor from './components/BrandColor';
import type Combine from './components/Combine';
import type Mono from './components/Mono';
import type Text from './components/Text';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Brand: typeof Brand;
  BrandColor: typeof BrandColor;
  Combine: typeof Combine;
  Text: typeof Text;
  colorGradient: string;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
