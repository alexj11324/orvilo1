import { type DropdownMenuPlacement } from '@lobehub/ui';
import { type AiModelForSelect } from 'model-bank';
import { type ComponentType } from 'react';

import { type EnabledProviderWithModels } from '@/types/aiProvider';

export type GroupMode = 'byModel' | 'byProvider';

export type PricingMode = 'image' | 'video';

export interface ModelWithProviders {
  displayName: string;
  model: AiModelForSelect;
  providers: Array<{
    id: string;
    logo?: string;
    name: string;
    source?: EnabledProviderWithModels['source'];
  }>;
}

export type ListItem =
  | {
      data: ModelWithProviders;
      type: 'model-item-single';
    }
  | {
      data: ModelWithProviders;
      type: 'model-item-multiple';
    }
  | {
      provider: EnabledProviderWithModels;
      type: 'group-header';
    }
  | {
      model: AiModelForSelect;
      provider: EnabledProviderWithModels;
      type: 'provider-model-item';
    }
  | {
      provider: EnabledProviderWithModels;
      type: 'empty-model';
    }
  | {
      type: 'no-provider';
    };

export type DropdownPlacement = DropdownMenuPlacement;

/**
 * One row of a flat, non-model-bank model list (Prime's provider-binding routes
 * or a CLI harness's alias/catalog list).
 */
export interface SimpleModelOption {
  /** Row text; also drives the list search and the active-row check. */
  title: string;
  /** Value committed to the conversation. */
  value: string;
}

/**
 * A flat model list rendered by the panel in place of `enabledList`. The panel
 * adapts it into a single-provider list, so search, the active row and the
 * detail submenu behave exactly like a model-bank source.
 */
export interface SimpleModelSource {
  /** Shown instead of the list when `options` is empty. */
  emptyText?: React.ReactNode;
  /** Provider id reported back through `onModelChange`. */
  id: string;
  /** Provider name shown in the group header. */
  name: string;
  /** Rendered in the given order — a CLI's own order, not model-bank newness. */
  options: SimpleModelOption[];
}

export interface ModelSwitchPanelProps {
  children?: React.ReactNode;
  /**
   * When set (e.g. image/video generation), uses this list instead of enabled chat models.
   */
  enabledList?: EnabledProviderWithModels[];
  /**
   * Current model ID. If not provided, uses currentAgentModel from store.
   */
  model?: string;
  /**
   * Optional row component for generation UIs (e.g. ImageModelItem). Requires `enabledList` + `pricingMode`.
   */
  ModelItemComponent?: ComponentType<any>;
  /**
   * Callback when model changes. If not provided, uses updateAgentConfig from store.
   */
  onModelChange?: (params: { model: string; provider: string }) => Promise<void>;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  /**
   * Whether to open the panel on hover. Defaults to true.
   */
  openOnHover?: boolean;
  /**
   * Dropdown placement. Defaults to 'topLeft'.
   */
  placement?: DropdownPlacement;
  /**
   * Pass-through to ModelDetailPanel for image/video approximate pricing.
   */
  pricingMode?: PricingMode;
  /**
   * Current provider ID. If not provided, uses currentAgentModelProvider from store.
   */
  provider?: string;
  /**
   * Flat option list for sources that are not model-bank chat models. When set
   * it replaces `enabledList`; `emptyText` replaces the model-bank empty state
   * when the source has nothing to show.
   */
  simpleSource?: SimpleModelSource;
}
