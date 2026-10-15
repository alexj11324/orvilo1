import type Avatar from './components/Avatar';
import type Mono from './components/Mono';
import type Text from './components/Text';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Text: typeof Text;
  colorPrimary: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
