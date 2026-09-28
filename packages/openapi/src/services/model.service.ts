import type { ProviderConfig } from '@orvilo/types';

import { AiInfraRepos } from '@/database/repositories/aiInfra';
import { getServerGlobalConfig } from '@/server/globalConfig';

import { BaseService } from '../common/base.service';
import { processPaginationConditions } from '../helpers/pagination';
import { projectPublicModel } from '../helpers/public-fields';
import type { ServiceResult } from '../types';
import type { GetModelsResponse, ModelDetailResponse, ModelsListQuery } from '../types/model.type';

// `stt` was renamed to the standard `asr`. Deprecated API inputs are normalized
// at the service boundary; responses always emit `asr`.
const normalizeModelType = <T>(type: T): T => (type === 'stt' ? ('asr' as T) : type);

const matchesKeyword = (
  model: { description?: string; displayName?: string; id: string },
  keyword: string,
) =>
  [model.id, model.displayName, model.description].some((field) =>
    field?.toLowerCase().includes(keyword.toLowerCase()),
  );

/**
 * Model service implementation class (dedicated to Hono API)
 * Serves the deployment-owned model catalog — per-user `ai_models` rows are
 * retired with provider management, so reads never touch the database.
 */
export class ModelService extends BaseService {
  private catalog = async () => {
    const { aiProvider } = await getServerGlobalConfig();
    const providerConfigs: Record<string, ProviderConfig> = Object.fromEntries(
      Object.entries(aiProvider).map<[string, ProviderConfig]>(([id, config]) => [
        id,
        { ...config, enabled: config?.enabled ?? false },
      ]),
    );
    return new AiInfraRepos(providerConfigs);
  };

  /**
   * Get model list
   * @param request Query request parameters
   */
  async getModels(request: ModelsListQuery = {}): ServiceResult<GetModelsResponse> {
    this.log('info', '获取模型列表', {
      ...request,
      userId: this.userId,
    });

    try {
      // Permission validation
      const permissionResult = await this.resolveOperationPermission('AI_MODEL_READ');

      if (!permissionResult.isPermitted) {
        throw this.createAuthorizationError(permissionResult.message || '无权访问模型列表');
      }

      const { page, pageSize, keyword, provider, type, enabled } = request;
      const normalizedType = type ? normalizeModelType(type) : undefined;

      const repos = await this.catalog();
      let models = await repos.getEnabledModels(false);

      if (keyword) models = models.filter((model) => matchesKeyword(model, keyword));
      if (provider) models = models.filter((model) => model.providerId === provider);
      if (normalizedType) models = models.filter((model) => model.type === normalizedType);
      if (typeof enabled === 'boolean')
        models = models.filter((model) => model.enabled === enabled);

      const { limit = 20, offset = 0 } = processPaginationConditions({ page, pageSize });

      return {
        models: models.slice(offset, offset + limit).map(projectPublicModel),
        total: models.length,
      };
    } catch (error) {
      this.handleServiceError(error, '获取模型列表失败');
    }
  }

  /**
   * Get model details
   */
  async getModelDetail(providerId: string, modelId: string): ServiceResult<ModelDetailResponse> {
    this.log('info', '获取模型详情', { modelId, providerId, userId: this.userId });

    try {
      const permissionResult = await this.resolveOperationPermission('AI_MODEL_READ');

      if (!permissionResult.isPermitted) {
        throw this.createAuthorizationError(permissionResult.message || '无权访问模型详情');
      }

      const repos = await this.catalog();
      const model = (await repos.getAiProviderModelList(providerId)).find((m) => m.id === modelId);

      if (!model) {
        throw this.createNotFoundError(`模型 ${providerId}/${modelId} 不存在`);
      }

      return projectPublicModel({ ...model, providerId });
    } catch (error) {
      this.handleServiceError(error, '获取模型详情');
    }
  }
}
