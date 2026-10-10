import SkeletonBar from '@/components/Skeleton/Bar';
import { SidebarMenuItem } from '@/components/ui/sidebar';

export default function TeamListSkeleton({ collapsed }: { collapsed: boolean }) {
  return Array.from({ length: 2 }).map((_, index) => (
    <SidebarMenuItem key={index}>
      <div className="flex h-8 items-center gap-2 px-2">
        <SkeletonBar height={16} width={16} />
        {!collapsed && <SkeletonBar height={16} width="60%" />}
      </div>
    </SidebarMenuItem>
  ));
}
