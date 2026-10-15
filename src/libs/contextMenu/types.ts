import type { SFSymbol } from '@orvilo/electron-client-ipc';

import type { ContextMenuItem, ShowContextMenuOptions } from '@/components/ContextMenu';

type NativeMenuIcon = {
  sfSymbol?: SFSymbol;
};

type WithSfSymbol<T> = T extends null
  ? null
  : T extends { children: (infer Item)[] }
    ? Omit<T, 'children'> & NativeMenuIcon & { children: WithSfSymbol<Item>[] }
    : T extends { children?: (infer Item)[] }
      ? Omit<T, 'children'> & NativeMenuIcon & { children?: WithSfSymbol<Item>[] }
      : T & NativeMenuIcon;

export type NativeContextMenuItem = WithSfSymbol<ContextMenuItem>;

export type { ShowContextMenuOptions };

type AssertTrue<_T extends true> = never;

export type AssertContextMenuItemArrayAssignable = AssertTrue<
  ContextMenuItem[] extends NativeContextMenuItem[] ? true : false
>;
