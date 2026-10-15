import type { IconAvatarProps } from '../../types';
import IconAvatar from '../IconAvatar';
import DefaultIcon from './DefaultIcon';

const DefaultAvatar = ({
  iconMultiple = 0.6,
  background = 'var(--selected)',
  ...props
}: IconAvatarProps) => (
  <IconAvatar {...props} Icon={DefaultIcon} background={background} iconMultiple={iconMultiple} />
);
export default DefaultAvatar;
