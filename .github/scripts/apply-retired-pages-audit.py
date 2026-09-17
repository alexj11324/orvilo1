from pathlib import Path
r=Path.cwd()
def rep(path,old,new):
 p=r/path;s=p.read_text();assert s.count(old)==1,(path,s.count(old),old[:100]);p.write_text(s.replace(old,new))

# Keep retired names personal/reserved until tombstones finish onboarding redirects.
p='src/layout/GlobalProvider/useUserStateRedirect.ts'
rep(p,"  'apps',", "  'apps',\n  'community',")
rep(p,"  'onboarding',", "  'onboarding',\n  'page',")

# Legacy Discover was Next-only; retain explicit tombstones instead of 404s.
p='src/libs/next/config/define-config.ts'
rep(p,"      // Redirect old Clerk login route to Better Auth signin", "      { destination: '/', permanent: true, source: '/discover' },\n      { destination: '/', permanent: true, source: '/discover/:path*' },\n      // Redirect old Clerk login route to Better Auth signin")

# Search remains capable of paging retained Resource Documents.
p='src/features/CommandMenu/utils/queryParser.ts'
rep(p,"  'memory',\n  'knowledgeBase',", "  'memory',\n  'knowledgeBase',\n  'page',")
p='src/features/CommandMenu/SearchResults.tsx'
rep(p,"""        {pageResults.length > 0 && (\n          <Command.Group forceMount>\n            {pageResults.map((result) => renderResultItem(result))}\n          </Command.Group>\n        )}""", """        {pageResults.length > 0 && (\n          <Command.Group forceMount>\n            {pageResults.map((result) => renderResultItem(result))}\n            {renderSearchMore('page', pageResults.length)}\n          </Command.Group>\n        )}""")

# Restore the document permission affordance under Resource Documents.
p='src/features/PageEditor/Header/useMenu.tsx'
rep(p,"import VisibilityConfirmContent from '@/features/VisibilityConfirmContent';", "import { useResourcePermission } from '@/features/ResourcePermission/useResourcePermission';\nimport VisibilityConfirmContent from '@/features/VisibilityConfirmContent';\nimport { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';")
rep(p,"  const canMakePrivate = Boolean(\n    activeWorkspaceId && isOwnPage && pageDocument?.visibility === 'public' && canEditPage,\n  );", "  const canMakePrivate = Boolean(\n    activeWorkspaceId && isOwnPage && pageDocument?.visibility === 'public' && canEditPage,\n  );\n  const wsNavigate = useWorkspaceAwareNavigate();\n  const { data: pagePermission } = useResourcePermission(\n    'document',\n    activeWorkspaceId ? documentId : undefined,\n  );\n  const memberPermissionMenuItem: DropdownItem | null =\n    activeWorkspaceId && pagePermission?.canManage && documentId\n      ? {\n          icon: <Icon icon={UsersIcon} />,\n          key: 'member-permissions',\n          label: t('permission.page.entry', { ns: 'setting' }),\n          onClick: () => wsNavigate(`/resource/documents/${documentId}/permission`),\n        }\n      : null;")
rep(p,"      ...(canMakePrivate\n        ? [", "      ...(memberPermissionMenuItem || canMakePrivate\n        ? [\n            ...(memberPermissionMenuItem ? [memberPermissionMenuItem] : []),")

# Route retired page IDs to the retained Resource Document and permission surfaces.
for p in ['src/spa/router/desktopRouter.shared.tsx','src/spa/router/mobileRouter.config.tsx']:
 rep(p,"import type { RouteObject } from 'react-router';", "import type { RouteObject } from 'react-router';\n\nimport LegacyPageRedirect from './LegacyPageRedirect';")
 rep(p,"    'page',\n    'page/:id',\n    'page/:id/permission',", "    'page',")
 rep(p,"  ].map((path): RouteObject => ({ element: redirectElement('..'), path })),", "  ].map((path): RouteObject => ({ element: redirectElement('..'), path })),\n  { element: <LegacyPageRedirect />, path: 'page/:id' },\n  { element: <LegacyPageRedirect permission />, path: 'page/:id/permission' },",)

# Desktop Resource owns the permission page; place the specific route before :category.
p='src/spa/router/desktopRouter.shared.tsx'
rep(p,"          ...resourceCategoryRoutes,\n          // Category views share the home page", "          ...resourceCategoryRoutes,\n          {\n            element: dynamicElement(\n              () => import('@/routes/(main)/resource/documents/[id]/permission'),\n              'Desktop > Resource > Documents > Permission',\n            ),\n            handle: { meta: routeMeta({ icon: FileText, Skeleton: createSurfaceSkeleton('form'), titleKey: 'navigation.resources' }) },\n            path: 'documents/:id/permission',\n          },\n          // Category views share the home page")

# Replace mandatory route guidance that points to deleted architecture.
p='.agents/skills/spa-routes/SKILL.md';s=(r/p).read_text();start=s.index('**Examples**\n');end=s.index('\nRouter config continues to point',start);end=s.index('\n',end)+1
new='''**Examples**\n\n- **Route (thin):** `src/routes/(main)/resource/(home)/index.tsx` delegates to Resource features.\n- **Feature (real implementation):** retained document/resource UI lives under `src/features/ResourceHome`, `src/features/PageEditor`, and `src/features/ResourcePermission`.\n- Standalone `/page` and `src/features/Pages` were retired. Legacy `/page/:id` links are compatibility tombstones that preserve the id and open the retained Resource Document surface. Do not add new product routes under `/page`.\n- Agent-owned documents remain under their Agent/Document feature surface; Resource Documents use `/resource` routes.\n\n---\n\n## 5. Progressive Migration (existing code)\n\nThe former Pages migration is retired. When touching an old route that still has logic or `features/` inside `src/routes/`, keep route entries thin and put domain behavior under the retained feature (`ResourceHome`, `PageEditor`, `ResourcePermission`, Agent documents, etc.). Use `git mv` when moving files so history is preserved.\n\n---\n\n## 6. Reference Structure\n\n`src/routes/(main)/resource/` contains thin Resource route entries. Their implementation belongs under the Resource/PageEditor permission features above. Router config must point to real route entries; retired `/page/*` entries exist only as redirects and must never be used as implementation targets.\n'''
(r/p).write_text(s[:start]+new+s[end:])
