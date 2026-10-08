import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@orvilo/ui';

export const Fallbacks = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <Avatar size="sm">
      <AvatarFallback>AJ</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>MK</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>RS</AvatarFallback>
    </Avatar>
  </div>
);

export const Group = () => (
  <AvatarGroup>
    <Avatar>
      <AvatarFallback>AJ</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>MK</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>RS</AvatarFallback>
    </Avatar>
    <AvatarGroupCount>+4</AvatarGroupCount>
  </AvatarGroup>
);
