export interface StorageFormItem {
  children: React.ReactNode;
  desc?: React.ReactNode;
  label?: React.ReactNode;
}

export type StorageFormItems = StorageFormItem[];

export const useTransferAgentsFormItem = (): StorageFormItems | null => null;
