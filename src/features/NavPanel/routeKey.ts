export const resolveNavPanelKey = (
  pathname: string,
  activeWorkspaceSlug: string | null,
): string => {
  const segments = pathname.split('/').filter(Boolean);
  const isWorkspaceRoute =
    !!activeWorkspaceSlug && segments.length > 0 && segments[0] === activeWorkspaceSlug;
  const routeSegments = isWorkspaceRoute ? segments.slice(1) : segments;
  const [rootSegment, childSegment, grandchildSegment] = routeSegments;

  if (rootSegment === 'settings') {
    return isWorkspaceRoute ? 'workspace-settings' : 'settings';
  }

  switch (rootSegment) {
    case 'agent': {
      return grandchildSegment === 'docs' ? 'agent-docs' : 'agent';
    }

    case 'community': {
      return 'discover';
    }

    case 'group': {
      // `/group` itself is the Groups index — a destination inside the global
      // navigation, so it keeps the home panel. Only an actual group
      // (`/group/:gid/...`) owns the route panel.
      return childSegment ? 'group' : 'home';
    }

    case 'image': {
      return 'image';
    }

    case 'memory': {
      return 'memory';
    }

    case 'page': {
      return 'page';
    }

    case 'resource': {
      return childSegment === 'library' ? 'resourceLibrary' : 'resource';
    }

    case 'video': {
      return 'video';
    }

    default: {
      return 'home';
    }
  }
};
