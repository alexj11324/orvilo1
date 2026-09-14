import type {
  BaseFileSearch,
  FileResult,
  GlobFilesParams,
  GlobFilesResult,
  SearchOptions,
} from '@orvilo/local-file-shell/file-search';

import { ServiceModule } from './index';

/**
 * File Search Service
 * Main service class that delegates to platform-specific implementations from
 * `@orvilo/local-file-shell`.
 */
export default class FileSearchService extends ServiceModule {
  private implPromise?: Promise<BaseFileSearch>;

  private getImpl(): Promise<BaseFileSearch> {
    this.implPromise ??= import('@orvilo/local-file-shell/file-search').then(
      ({ createFileSearchModule }) => createFileSearchModule(),
    );
    return this.implPromise;
  }

  async search(
    query: string,
    options: Omit<SearchOptions, 'keywords'> = {},
  ): Promise<FileResult[]> {
    const impl = await this.getImpl();
    if (this.app?.binaryManager) {
      impl.setToolDetector(this.app.binaryManager);
    }
    return impl.search({ ...options, keywords: query });
  }

  async checkSearchServiceStatus(): Promise<boolean> {
    return (await this.getImpl()).checkSearchServiceStatus();
  }

  async updateSearchIndex(path?: string): Promise<boolean> {
    return (await this.getImpl()).updateSearchIndex(path);
  }

  async glob(params: GlobFilesParams): Promise<GlobFilesResult> {
    const impl = await this.getImpl();
    if (this.app?.binaryManager) {
      impl.setToolDetector(this.app.binaryManager);
    }
    return impl.glob(params);
  }
}
