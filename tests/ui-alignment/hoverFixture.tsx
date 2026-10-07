import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { Button, buttonHoverFeedback } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { taskDetailLayoutStyles as detail } from '@/features/AgentTasks/AgentTaskDetail/taskDetailLayoutStyles';

export function HoverFixture() {
  const [filter, setFilter] = useState('all');
  const [clicks, setClicks] = useState(0);
  const activate = () => setClicks((value) => value + 1);
  return (
    <section data-testid="hover-fixture" style={{ display: 'grid', gap: 12 }}>
      <h2>Rendered hover contracts</h2>
      <output data-testid="hover-clicks">{clicks}</output>
      <div className="flex flex-wrap gap-2">
        {(['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const).map(
          (variant) => (
            <Button
              data-hover-kind={`button-${variant}`}
              key={variant}
              variant={variant}
              onClick={activate}
            >
              {variant}
            </Button>
          ),
        )}
        {(['borderless', 'outlined', 'filled'] as const).map((variant) => (
          <ActionIcon
            data-hover-kind={`icon-${variant}`}
            icon={PlusIcon}
            key={variant}
            title={`Action ${variant}`}
            variant={variant}
            onClick={activate}
          />
        ))}
      </div>
      <div className={detail.propertyValue}>
        {['status', 'priority'].map((kind) => (
          <DropdownMenu key={kind}>
            <DropdownMenuTrigger
              nativeButton={false}
              render={
                <div className="flex cursor-pointer items-center gap-1.5" data-hover-kind={kind}>
                  {kind}
                </div>
              }
            />
            <DropdownMenuContent>
              <DropdownMenuItem onClick={activate}>Choose {kind}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
        {['assignee', 'labels', 'schedule', 'reviewer'].map((kind) => (
          <Popover key={kind}>
            <PopoverTrigger
              nativeButton={false}
              render={<div data-hover-kind={kind}>{kind}</div>}
            />
            <PopoverContent>
              <Button onClick={activate}>Choose {kind}</Button>
            </PopoverContent>
          </Popover>
        ))}
        <Button
          className={detail.interactiveControl}
          data-hover-kind="due-date"
          size="sm"
          variant="ghost"
          onClick={activate}
        >
          Due date
        </Button>
      </div>
      <div className="flex gap-2">
        {['project', 'milestone'].map((kind) => (
          <DropdownMenu key={kind}>
            <DropdownMenuTrigger
              nativeButton={false}
              render={
                <div
                  className={`flex items-center ${detail.railRow} ${detail.interactiveControl}`}
                  data-hover-kind={kind}
                >
                  {kind}
                </div>
              }
            />
            <DropdownMenuContent>
              <DropdownMenuItem onClick={activate}>Choose {kind}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </div>
      <Button
        className={`${detail.railRow} ${detail.interactiveControl}`}
        data-hover-kind="project-link"
        variant="ghost"
        onClick={activate}
      >
        Open project
      </Button>
      <div className="flex gap-2">
        {['all', 'comments', 'updates'].map((value) => (
          <Button
            aria-pressed={filter === value}
            className={detail.interactiveControl}
            data-hover-kind={`filter-${value}`}
            key={value}
            size="xs"
            variant="ghost"
            onClick={() => {
              setFilter(value);
              activate();
            }}
          >
            {value}
          </Button>
        ))}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button data-hover-kind="tooltip-button" variant="ghost" onClick={activate}>
                Tooltip action
              </Button>
            }
          />
          <TooltipContent>Action hint</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex gap-2">
        <div
          className={`px-2 py-1 ${buttonHoverFeedback}`}
          data-hover-kind="shared-role"
          role="button"
          tabIndex={0}
          onClick={activate}
        >
          Shared role action
        </div>
        <div
          className={`hover-selected px-2 py-1 ${buttonHoverFeedback}`}
          data-active="true"
          data-hover-kind="selected-role"
          role="button"
          tabIndex={0}
          onClick={activate}
        >
          Selected action
        </div>
        <Button
          className={buttonHoverFeedback}
          data-hover-kind="colored-shadow"
          data-hover-paint="shadow"
          style={{ background: 'rgb(220, 50, 50)' }}
          onClick={activate}
        >
          Color-preserving shadow
        </Button>
      </div>
      <div
        className={`hover-thumbnail ${buttonHoverFeedback}`}
        data-hover-kind="opaque-thumbnail"
        data-hover-paint="shadow"
        role="button"
        tabIndex={0}
        onClick={activate}
      >
        <img
          alt="Opaque evidence thumbnail"
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='44'%3E%3Crect width='64' height='44' fill='rgb(200,0,0)'/%3E%3C/svg%3E"
        />
      </div>
      <div className="flex gap-2">
        <Button disabled data-hover-exception="disabled" onClick={activate}>
          Disabled
        </Button>
        <ActionIcon
          loading
          data-hover-exception="loading"
          icon={PlusIcon}
          title="Loading"
          onClick={activate}
        />
        <div aria-disabled="true" data-hover-exception="permission" role="button">
          No permission
        </div>
        <span data-hover-exception="display-only">Execution status</span>
      </div>
      <style>{`
        .hover-selected { background: var(--ant-color-fill-tertiary); }
        .hover-thumbnail { width: 64px; height: 44px; overflow: hidden; border: 2px solid transparent; border-radius: 6px; background: var(--ant-color-fill-tertiary); }
        .hover-thumbnail img { width: 100%; height: 100%; object-fit: cover; }
        .hover-same-pseudo { position: relative; background: rgb(200, 0, 0); }
        .hover-same-pseudo::before { content: ''; position: absolute; inset: 0; background: transparent; pointer-events: none; }
        .hover-same-pseudo:hover::before { background: rgb(200, 0, 0); }
        .hover-pseudo { position: relative; padding: 8px; }
        .hover-pseudo::before { content: ''; position: absolute; inset: 0; border-radius: 8px; background: transparent; pointer-events: none; }
        .hover-pseudo:hover::before { background: rgba(120, 120, 120, .3); }
        .hover-text-only:hover { color: red; }
        .hover-ancestor:hover { background: rgba(120, 120, 120, .3); }
      `}</style>
      <button className="hover-pseudo" data-hover-kind="pseudo-wash" onClick={activate}>
        Owned pseudo wash
      </button>
      <div className="flex gap-2" data-testid="hover-negative-controls">
        <button
          className="hover-same-pseudo"
          data-hover-negative="same-color-pseudo"
          onClick={activate}
        >
          <span className="relative z-10">Same color pseudo</span>
        </button>
        <button data-hover-negative="unstyled" onClick={activate}>
          Unstyled
        </button>
        <button className="hover-text-only" data-hover-negative="text-only" onClick={activate}>
          Text only
        </button>
        <div className="hover-ancestor">
          <button data-hover-negative="ancestor-only" onClick={activate}>
            Ancestor only
          </button>
        </div>
      </div>
    </section>
  );
}
