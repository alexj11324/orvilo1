import { Flexbox } from '@lobehub/ui';
import {
  BookOpen,
  BrainCircuit,
  CalendarClock,
  HeartPulse,
  Home,
  Layers,
  Search,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import NavItem from '@/features/NavPanel/components/NavItem';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { isModifierClick } from '@/utils/navigation';

const tabs = [
  { key: 'home', icon: Home },
  { key: 'identities', icon: User },
  { key: 'contexts', icon: Layers },
  { key: 'preferences', icon: HeartPulse },
  { key: 'experiences', icon: BookOpen },
  { key: 'activities', icon: CalendarClock },
  { key: 'search', icon: Search },
  { key: 'prime', icon: BrainCircuit },
] as const;

export default function MemoryNavigation() {
  const { t } = useTranslation('memory');
  const navigate = useWorkspaceAwareNavigate();
  const { pathname } = useActiveLocation();
  return (
    <Flexbox gap={1} paddingInline={4}>
      {tabs.map(({ key, icon }) => {
        const url = `/memory/${key}`;
        const active = pathname.endsWith(url) || (key === 'home' && pathname.endsWith('/memory'));
        return (
          <Link
            key={key}
            to={url}
            onClick={(event) => {
              if (isModifierClick(event)) return;
              event.preventDefault();
              navigate(url);
            }}
          >
            <NavItem active={active} icon={icon} title={t(`tab.${key}`)} />
          </Link>
        );
      })}
    </Flexbox>
  );
}
