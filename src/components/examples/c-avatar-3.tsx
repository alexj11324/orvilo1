import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function Pattern() {
  return (
    <div className="flex items-center gap-2">
      <Avatar size="sm">
        <AvatarImage
          alt="Alex Johnson"
          src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&dpr=2&q=80"
        />
        <AvatarFallback>AJ</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage
          alt="Alex Johnson"
          src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&dpr=2&q=80"
        />
        <AvatarFallback>AJ</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarImage
          alt="Alex Johnson"
          src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&dpr=2&q=80"
        />
        <AvatarFallback>AJ</AvatarFallback>
      </Avatar>
    </div>
  );
}
