import {
  memo,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';

import { type TopicItemDropdownMenuProps, useTopicItemDropdownMenu } from './useDropdownMenu';

/**
 * Hosts the row's menu hook outside the row's memo boundary.
 *
 * `useTopicItemDropdownMenu` reaches `useNavigate`, which subscribes to
 * react-router's contexts — so wherever it is called re-renders on every
 * navigation. Calling it here keeps that re-render to this shell: `children`
 * arrives as an already-built element, so React bails out on the row subtree.
 *
 * The items thunk is pinned to a stable identity for the same reason — a fresh
 * one would flow into `cloneElement` below and break the row's memo anyway.
 */
const TopicItemContextMenu = memo<
  Omit<PropsWithChildren<TopicItemDropdownMenuProps>, 'children'> & {
    children: ReactElement;
  }
>(({ children, fav, id, status, title }) => {
  const { dropdownMenu } = useTopicItemDropdownMenu({ fav, id, status, title });

  const menuRef = useRef(dropdownMenu);
  useEffect(() => {
    menuRef.current = dropdownMenu;
  }, [dropdownMenu]);

  const items = useCallback(() => {
    const dropdownMenu = menuRef.current;

    return typeof dropdownMenu === 'function' ? dropdownMenu() : dropdownMenu;
  }, []);

  return <SidebarContextMenu items={items}>{children}</SidebarContextMenu>;
});

TopicItemContextMenu.displayName = 'TopicItemContextMenu';

export default TopicItemContextMenu;
