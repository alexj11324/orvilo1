'use client';

import { ListChecks, MessagesSquare, Paperclip, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type AcceptanceTabKey = 'checks' | 'discussion' | 'resources' | 'flow';

const styles = {
  list: 'shadow-none',
};

interface AcceptanceTabsProps {
  active: AcceptanceTabKey;
  checkCount: number;
  /** Open discussion threads on this delivery. */
  discussionCount: number;
  flowCount?: number;
  onChange: (key: AcceptanceTabKey) => void;
  resourceCount: number;
}

/**
 * The delivery's faces: the conversation about it, the checks a person judges,
 * and the artefacts the rounds produced. They close the identity band; the
 * active tab's underline is the boundary between "what this delivery is" and
 * "what you are looking at".
 *
 * Discussion leads, as GitHub's Conversation does — it is the delivery's
 * shared thread, and it was unfindable while it sat below the checklist.
 */
const AcceptanceTabs = ({
  active,
  checkCount,
  discussionCount,
  flowCount = 0,
  onChange,
  resourceCount,
}: AcceptanceTabsProps) => {
  const { t } = useTranslation('verify');
  const tabs = [
    {
      count: discussionCount,
      icon: MessagesSquare,
      key: 'discussion' as const,
      label: t('acceptance.comments.title'),
    },
    {
      count: checkCount,
      icon: ListChecks,
      key: 'checks' as const,
      label: t('acceptance.tabs.checks'),
    },
    { count: flowCount, icon: Route, key: 'flow' as const, label: t('flow.title') },
    {
      count: resourceCount,
      icon: Paperclip,
      key: 'resources' as const,
      label: t('acceptance.tabs.resources'),
    },
  ];

  return (
    <Tabs value={active} onValueChange={(key) => onChange(key as AcceptanceTabKey)}>
      <TabsList className={styles.list} style={{ minWidth: 0, overflowX: 'auto' }}>
        {tabs
          .filter((tab) => tab.key !== 'flow' || flowCount > 0)
          .map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              <tab.icon size={16} />
              <div className="flex items-center gap-1.5">
                {tab.label}
                <Badge radius="full" variant="secondary">
                  {tab.count}
                </Badge>
              </div>
            </TabsTrigger>
          ))}
      </TabsList>
    </Tabs>
  );
};

export default AcceptanceTabs;
