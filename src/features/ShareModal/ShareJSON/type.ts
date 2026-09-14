import { type TopicExportMode } from '@orvilo/types';

export interface BaseExportOptions {
  includeTool: boolean;
  withSystemRole: boolean;
}

export interface FieldType extends BaseExportOptions {
  exportMode: TopicExportMode;
}
