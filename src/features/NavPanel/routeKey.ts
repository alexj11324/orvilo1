export const resolveNavPanelKey = (
  pathname: string,
  activeWorkspaceSlug: string | null,
): string => {
  const segments = pathname.split('/').filter(Boolean);
  const isWorkspaceRoute =
    !!activeWorkspaceSlug && segments.length > 0 && segments[0] === activeWorkspaceSlug;
  const routeSegments = isWorkspaceRoute ? segments.slice(1) : segments;
  const [rootSegment, childSegment, grandchildSegment] = routeSegments;

  // Personal and workspace settings share one sidebar, so they share one key.
  if (rootSegment === 'settings') return 'settings';

  switch (rootSegment) {
    case 'agent': {
      // A conversation keeps the global navigation: its topic history lives in
      // the header title menu, not in a panel that replaces the nav. Only the
      // agent's docs have their own route panel.
      return grandchildSegment === 'docs' ? 'agent-docs' : 'home';
    }

    case 'chat': {
      // `/chat/:topicId` is the canonical conversation surface and shares the
      // legacy `/agent/:aid` route's navigation.
      return 'home';
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
