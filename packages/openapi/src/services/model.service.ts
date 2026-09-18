import { and, asc, count, eq, ilike, or } from 'drizzle-orm';

import { aiModels } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { BaseService } from '../common/base.service';
import { processPaginationConditions } from '../helpers/pagination';
import { projectPublicModel } from '../helpers/public-fields';
import type { ServiceResult } from '../types';
import type { GetModelsResponse, ModelDetailResponse, ModelsListQuery } from '../types/model.type';

// `stt` was renamed to the standard `asr`. Old rows / deprecated API inputs are
// normalized at the service boundary instead of running a bulk data migration —
// responses always emit `asr`, and `stt` is never persisted for new writes.
const normalizeModelType = <T>(type: T): T => (type === 'stt' ? ('asr' as T) : type);

/**
 * Model service implementation class (dedicated to Hono API)
 * Provides model query and grouping functionality
 */
export class ModelService extends BaseService {
  constructor(db: OrviloDatabase, userId: string | null, workspaceId?: string) {
    super(db, userId, workspaceId);
  }

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

      // Build query conditions
      const conditions = [];

      // Add permission condition directly to the main conditions array
      const permissionWhere = this.buildPermissionWhere(aiModels, permissionResult.condition);
      if (permissionWhere) conditions.push(permissionWhere);

      // Handle ModelsListQuery-specific parameters
      const { page, pageSize, keyword, provider, type, enabled } = request;

      // If a keyword is provided, add it to the query conditions
      if (keyword) {
        conditions.push(
          or(
            ilike(aiModels.id, `%${keyword}%`),
            ilike(aiModels.displayName, `%${keyword}%`),
            ilike(aiModels.description, `%${keyword}%`),
          ),
        );
      }

      if (provider) {
        conditions.push(eq(aiModels.providerId, provider));
      }

      if (type) {
        const normalizedType = normalizeModelType(type);
        // Match both the new `asr` and the legacy `stt` so un-migrated rows
        // still surface when a client filters by the standard type.
        conditions.push(
          normalizedType === 'asr'
            ? or(eq(aiModels.type, 'asr'), eq(aiModels.type, 'stt'))
            : eq(aiModels.type, normalizedType),
        );
      }

      if (typeof enabled === 'boolean') {
        conditions.push(eq(aiModels.enabled, enabled));
      }

      const finalWhereCondition = conditions.length > 0 ? and(...conditions) : undefined;

      // Calculate offset
      const { limit, offset } = processPaginationConditions({ page, pageSize });

      // Execute query and count in parallel
      const [result, totalResult] = await Promise.all([
        this.db.query.aiModels.findMany({
          limit,
          offset,
          orderBy: asc(aiModels.sort),
          where: finalWhereCondition,
        }),
        this.db.select({ count: count() }).from(aiModels).where(finalWhereCondition),
      ]);

      return {
        models: result.map((model) =>
          projectPublicModel({ ...model, type: normalizeModelType(model.type) }),
        ),
        total: totalResult[0]?.count ?? 0,
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
      const permissionResult = await this.resolveOperationPermission('AI_MODEL_READ', {
        targetModelId: modelId,
      });

      if (!permissionResult.isPermitted) {
        throw this.createAuthorizationError(permissionResult.message || '无权访问模型详情');
      }

      const conditions = [eq(aiModels.providerId, providerId), eq(aiModels.id, modelId)];

      const permissionWhere = this.buildPermissionWhere(aiModels, permissionResult.condition);
      if (permissionWhere) conditions.push(permissionWhere);

      const model = await this.db.query.aiModels.findFirst({ where: and(...conditions) });

      if (!model) {
        throw this.createNotFoundError(`模型 ${providerId}/${modelId} 不存在`);
      }

      return projectPublicModel({ ...model, type: normalizeModelType(model.type) });
    } catch (error) {
      this.handleServiceError(error, '获取模型详情');
    }
  }
}
