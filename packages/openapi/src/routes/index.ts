import AgentGroupsRoutes from './agent-groups.route';
import AgentsRoutes from './agents.route';
import ApiKeysRoutes from './api-keys.route';
import EvalRoutes from './eval.route';
import FileRoutes from './files.route';
import KnowledgeBasesRoutes from './knowledge-bases.route';
import McpServersRoutes from './mcp-servers.route';
import MessageTranslationsRoutes from './message-translations.route';
import MessagesRoutes from './messages.route';
import ModelsRoutes from './models.route';
import PermissionsRoutes from './permissions.route';
import { PluginsRoutes } from './plugins.route';
import ResponsesRoutes from './responses.route';
import RolesRoutes from './roles.route';
import TopicsRoutes from './topics.route';
import UsageRoutes from './usage.route';
import UsersRoutes from './users.route';

export default {
  'agent-groups': AgentGroupsRoutes,
  'agents': AgentsRoutes,
  'api-keys': ApiKeysRoutes,
  'eval': EvalRoutes,
  'plugins': PluginsRoutes,
  'files': FileRoutes,
  'knowledge-bases': KnowledgeBasesRoutes,
  'mcp-servers': McpServersRoutes,
  'message-translations': MessageTranslationsRoutes,
  'messages': MessagesRoutes,
  'models': ModelsRoutes,
  'permissions': PermissionsRoutes,
  'responses': ResponsesRoutes,
  'roles': RolesRoutes,
  'topics': TopicsRoutes,
  'users': UsersRoutes,
  'usage': UsageRoutes,
};
