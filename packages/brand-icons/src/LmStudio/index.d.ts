import type Avatar from './components/Avatar';
import type Combine from './components/Combine';
import type Mono from './components/Mono';
import type Text from './components/Text';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Combine: typeof Combine;
  Text: typeof Text;
  colorGradient: string;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
