import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@orvilo/ui';

export const Open = () => (
  <div style={{ height: 260 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<Button variant="outline">Issue actions</Button>} />
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>ORV-142</DropdownMenuLabel>
          <DropdownMenuItem>
            Assign to me <DropdownMenuShortcut>A</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Change status <DropdownMenuShortcut>S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>Copy link</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Delete issue</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
