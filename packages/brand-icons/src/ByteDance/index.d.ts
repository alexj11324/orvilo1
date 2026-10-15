import type Avatar from './components/Avatar';
import type BrandColor from './components/BrandColor';
import type BrandMono from './components/BrandMono';
import type Color from './components/Color';
import type Mono from './components/Mono';
import type Text from './components/Text';
import type TextCn from './components/TextCn';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Brand: typeof BrandMono;
  BrandColor: typeof BrandColor;
  Color: typeof Color;
  Text: typeof Text;
  TextCn: typeof TextCn;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
