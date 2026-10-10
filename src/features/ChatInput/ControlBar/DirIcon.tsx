import { Github } from '@lobehub/icons';
import { FolderGit2Icon, FolderIcon } from 'lucide-react';
import { createElement, memo } from 'react';

interface DirIconProps {
  /** Detected repo type — drives the glyph: GitHub mark, a git-tracked folder, or
   * a plain folder when the type is unknown. */
  repoType?: 'git' | 'github';
  size?: number;
}

/** Directory icon shared by every cwd surface (local / device / settings pickers,
 * topic rows) so a `github` dir looks the same everywhere.
 *
 * A plain-git dir renders a *folder* glyph, not `GitBranchIcon`: this icon names a
 * directory, and in the ControlBar it sits immediately left of the worktree switcher,
 * which owns the branch glyph. Two identical branch icons side by side read as one
 * control repeated rather than "repo" followed by "branch". */
const DirIcon = memo<DirIconProps>(({ repoType, size = 16 }) => {
  const iconStyle = { color: 'var(--ant-color-text-tertiary)', flex: 'none' as const };
  if (repoType === 'github') return <Github size={size} style={iconStyle} />;
  return (
    <span className="anticon" role="img" style={iconStyle}>
      {createElement(repoType === 'git' ? FolderGit2Icon : FolderIcon, {
        size,
        width: size,
        height: size,
        fill: 'transparent',
      })}
    </span>
  );
});

DirIcon.displayName = 'DirIcon';

export default DirIcon;
