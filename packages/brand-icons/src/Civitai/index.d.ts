import type Avatar from './components/Avatar';
import type Color from './components/Color';
import type Combine from './components/Combine';
import type Mono from './components/Mono';
import type Text from './components/Text';
import type TextColor from './components/TextColor';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Color: typeof Color;
  Combine: typeof Combine;
  Text: typeof Text;
  TextColor: typeof TextColor;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
