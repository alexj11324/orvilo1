from pathlib import Path
r=Path.cwd()
def rep(path,old,new):
 p=r/path;s=p.read_text();assert s.count(old)==1,(path,s.count(old),old[:100]);p.write_text(s.replace(old,new))

p='src/routes/(main)/agent/profile/features/ProfileEditor/index.tsx'
rep(p,"import WorkspaceAgentDevicePolicy from './WorkspaceAgentDevicePolicy';", "import WorkspaceAgentDevicePolicy from './WorkspaceAgentDevicePolicy';\nimport { shouldShowHeterogeneousCloudConfig, shouldShowPersonaEditor } from './orviloProfilePolicy';")
rep(p,"  const showCloudHeterogeneousTab = heterogeneousProvider?.type === 'claude-code';", "  const showCloudHeterogeneousTab = shouldShowHeterogeneousCloudConfig(heterogeneousProvider);")
rep(p,'''          ) : isBuiltinEngine && heterogeneousProvider ? (\n            // Builtin Orvilo harness: engine-CLI detection + command override,\n            // no cloud/desktop tab split.\n            <HeterogeneousAgentStatusCard\n              provider={heterogeneousProvider}\n              onCommandChange={updateHeterogeneousCommand}\n            />''','''          ) : isBuiltinEngine && heterogeneousProvider ? (\n            // Builtin Orvilo keeps its own identity/persona, but a Claude\n            // engine still needs the same cloud credential surface as the\n            // borrowed claude-code runner. Codex remains desktop-only.\n            showCloudHeterogeneousTab ? (\n              <Tabs\n                defaultActiveKey={isDesktop ? 'desktop' : 'cloud'}\n                items={heterogeneousTabItems}\n                size="small"\n              />\n            ) : (\n              <HeterogeneousAgentStatusCard\n                provider={heterogeneousProvider}\n                onCommandChange={updateHeterogeneousCommand}\n              />\n            )''')
rep(p,'      {!isHeterogeneous && <EditorCanvas />}','      {shouldShowPersonaEditor(isHeterogeneous, isBuiltinEngine) && <EditorCanvas />}')

p='src/routes/(main)/agent/profile/features/ProfileEditor/EngineConfigCard.tsx'
rep(p,'''    if (!selection) return;\n\n    void updateAgentConfigById(agentId, {''','''    if (!selection) return;\n    // Do not persist a local target until the gateway has identified this\n    // device. Otherwise the deep merge leaves a stale remote boundDeviceId\n    // behind and server/web resolution silently executes on that old device.\n    if (selection.target === 'local' && !currentDeviceId) return;\n\n    void updateAgentConfigById(agentId, {''')
