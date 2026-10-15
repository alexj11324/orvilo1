import type Avatar from './components/Avatar';
import type Color from './components/Color';
import type Combine from './components/Combine';
import type Mono from './components/Mono';
import type Text from './components/Text';
import type TextCn from './components/TextCn';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Color: typeof Color;
  Combine: typeof Combine;
  Text: typeof Text;
  TextCn: typeof TextCn;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
