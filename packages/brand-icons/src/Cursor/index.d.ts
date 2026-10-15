import type Avatar from './components/Avatar';
import type Combine from './components/Combine';
import type Mono from './components/Mono';
import type Text from './components/Text';

export type CompoundedIcon = typeof Mono & {
  Avatar: typeof Avatar;
  Combine: typeof Combine;
  Text: typeof Text;
  colorBottom: string;
  colorLeft: string;
  colorPrimary: string;
  colorRight: string;
  colorTopLight: string;
  colorTopWhite: string;
  title: string;
};
declare const Icons: CompoundedIcon;
export default Icons;
