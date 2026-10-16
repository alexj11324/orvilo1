import { DiscordIcon, GithubIcon } from '@lobehub/ui/icons';
import { SOCIAL_URL } from '@orvilo/business-const';
import { Command } from 'cmdk';
import { LayersIcon, ListTodo, MessageSquarePlusIcon, Monitor, Star } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { getNavigableRoutes, getRouteById } from '@/config/routes';
import { FEEDBACK } from '@/const/url';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { usePermission } from '@/hooks/usePermission';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import { useCommandMenuContext } from './CommandMenuContext';
import { CommandItem } from './components';
import ContextCommands from './ContextCommands';
import RecentsCommands from './RecentsCommands';
import { useCommandMenu } from './useCommandMenu';
import { routeSearchKeywords } from './utils/routeKeywords';

const MainMenu = memo(() => {
  const { pathname, menuContext, setPages, pages, onCreateView } = useCommandMenuContext();
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const { allowed: canCreate } = usePermission('create_content');
  // While the first send from the new-topic view is still creating the real
  // topic, openNewTopicOrSaveTopic is a no-op — disable the command instead of
  // letting it close the palette as a false success (same as the sidebar entry).
  const isNewTopicSendInFlight = useChatStore(topicSelectors.isNewTopicSendInFlight);

  const {
    handleCreateConversation,
    handleCreateTopic,
    handleCreateProject,
    handleCreateTask,
    handleNavigate,
    handleExternalLink,
  } = useCommandMenu();
  const navigableRoutes = getNavigableRoutes().filter(
    (route) => route.id !== 'teams' || workspaceId,
  );

  return (
    <>
      <ContextCommands />

      <Command.Group heading={t('cmdk.actions')}>
        <CommandItem
          disabled={!canCreate || isNewTopicSendInFlight}
          icon={<MessageSquarePlusIcon />}
          value="create new conversation"
          onSelect={handleCreateConversation}
        >
          {t('cmdk.newConversation')}
        </CommandItem>
        <CommandItem
          disabled={!canCreate}
          icon={<ListTodo />}
          keywords={['task', 'todo', 'new']}
          value="create new task"
          onSelect={handleCreateTask}
        >
          {t('cmdk.newTask')}
        </CommandItem>
        <CommandItem
          disabled={!canCreate}
          icon={<PROJECT_ENTITY_ICON />}
          value="create new project"
          onSelect={handleCreateProject}
        >
          {t('cmdk.newProject')}
        </CommandItem>
        <CommandItem
          disabled={!canCreate}
          icon={<LayersIcon />}
          value="create new view"
          onSelect={onCreateView}
        >
          {t('savedViews.newView')}
        </CommandItem>
        {menuContext === 'agent' && (
          <CommandItem
            unpinned
            disabled={!canCreate || isNewTopicSendInFlight}
            icon={<MessageSquarePlusIcon />}
            value="create new topic"
            onSelect={handleCreateTopic}
          >
            {t('cmdk.newTopic')}
          </CommandItem>
        )}

        {menuContext !== 'settings' &&
          (() => {
            const settingsRoute = getRouteById('settings');
            const SettingsIcon = settingsRoute?.icon;
            const keywords = settingsRoute?.keywordsKey
              ? t(settingsRoute.keywordsKey as any).split(' ')
              : settingsRoute?.keywords;
            return (
              <CommandItem
                icon={SettingsIcon && <SettingsIcon />}
                keywords={keywords}
                value="settings"
                onSelect={() => handleNavigate(settingsRoute?.path || '/settings')}
              >
                {t('cmdk.settings')}
              </CommandItem>
            );
          })()}

        <CommandItem
          icon={<Monitor />}
          value="theme"
          onSelect={() => setPages([...pages, 'theme'])}
        >
          {t('cmdk.theme')}
        </CommandItem>
      </Command.Group>

      <RecentsCommands />

      <Command.Group heading={t('cmdk.navigate')}>
        {navigableRoutes.map((route) => {
          const RouteIcon = route.icon;
          const label = t(route.cmdkKey as any);
          const aliases = route.keywordsKey
            ? t(route.keywordsKey as any).split(' ')
            : route.keywords;
          const keywords = routeSearchKeywords(label, aliases);
          return (
            !pathname?.startsWith(route.pathPrefix) && (
              <CommandItem
                icon={<RouteIcon />}
                key={route.id}
                keywords={keywords}
                value={route.id}
                onSelect={() => handleNavigate(route.path)}
              >
                {label}
              </CommandItem>
            )
          );
        })}
      </Command.Group>

      <Command.Group heading={t('cmdk.about')}>
        <CommandItem
          icon={<GithubIcon />}
          keywords={t('cmdk.keywords.submitIssue').split(' ')}
          value="submit-issue"
          onSelect={() => handleExternalLink(FEEDBACK)}
        >
          {t('cmdk.submitIssue')}
        </CommandItem>
        <CommandItem
          icon={<Star />}
          keywords={t('cmdk.keywords.starGitHub').split(' ')}
          value="star-github"
          onSelect={() => handleExternalLink(SOCIAL_URL.github)}
        >
          {t('cmdk.starOnGitHub')}
        </CommandItem>
        {/* A deployment without a Discord server leaves this URL unset; drop the
            command rather than offering one that goes nowhere. */}
        {SOCIAL_URL.discord && (
          <CommandItem
            icon={<DiscordIcon />}
            keywords={t('cmdk.keywords.discord').split(' ')}
            value="discord"
            onSelect={() => handleExternalLink(SOCIAL_URL.discord!)}
          >
            {t('cmdk.communitySupport')}
          </CommandItem>
        )}
      </Command.Group>
    </>
  );
});

MainMenu.displayName = 'MainMenu';

export default MainMenu;
