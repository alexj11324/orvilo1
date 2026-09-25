'use client';

import { Icon, type IconProps } from '@lobehub/ui';
import type { LucideIcon } from 'lucide-react';
import { BoxIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';

/**
 * The single project-entity mark — Linear's isometric box outline (the glyph
 * the reference draws on the sidebar "Projects" row, the team sub-nav, and
 * every project row without a custom avatar; ref:
 * docs/research/linear/runtime-acceptance/e56fd439/linear-ref-projects.png).
 *
 * - `PROJECT_ENTITY_ICON` is the bare glyph for slots typed `LucideIcon` /
 *   `IconProps['icon']` — nav rows, `Empty` covers, route meta, icon maps —
 *   where the host supplies its own size and color.
 * - `ProjectIcon` renders the mark directly in JSX, mirroring
 *   `ProjectStatusIcon`'s one-mark-everywhere contract: surfaces must not
 *   re-pick a folder/kanban glyph for a project.
 */
export const PROJECT_ENTITY_ICON: LucideIcon = BoxIcon;

interface ProjectIconProps {
  className?: string;
  color?: string;
  size?: IconProps['size'];
}

export const ProjectIcon = memo<ProjectIconProps>(({ className, color, size }) => (
  <Icon aria-hidden className={className} color={color} icon={PROJECT_ENTITY_ICON} size={size} />
));

ProjectIcon.displayName = 'ProjectIcon';

/**
 * What a project's avatar slot shows: its custom avatar (emoji or image URL),
 * otherwise the entity mark. Never the project name — `Avatar` renders a
 * non-emoji string verbatim, so a name squeezed into a 28px tile wrapped into
 * clipped fragments ("Voya / ger / Laun"). Linear draws the box glyph there.
 */
export const projectAvatar = (avatar: string | null | undefined, iconSize: number): ReactNode =>
  avatar || <ProjectIcon size={iconSize} />;
