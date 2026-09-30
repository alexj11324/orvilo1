import { memo, type PropsWithChildren } from 'react';

const WorkspaceSettingsTitle = memo<PropsWithChildren>(({ children }) => (
  <h2 style={{ fontWeight: 600, fontSize: 20, margin: 0 }}>{children}</h2>
));

WorkspaceSettingsTitle.displayName = 'WorkspaceSettingsTitle';

export default WorkspaceSettingsTitle;
