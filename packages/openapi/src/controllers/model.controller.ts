import type { Context } from 'hono';

import { BaseController } from '../common/base.controller';
import { ModelService } from '../services/model.service';
import type { ModelsListQuery } from '../types/model.type';

export class ModelController extends BaseController {
  /**
   * Retrieves the model list endpoint
   * GET /api/v1/models
   * Query: { page?, pageSize?, keyword? }
   */
  async handleGetModels(c: Context) {
    try {
      const query = this.getQuery<ModelsListQuery>(c);

      const db = await this.getDatabase();
      const modelService = new ModelService(db, this.getUserId(c), this.getWorkspaceId(c));

      const result = await modelService.getModels(query);

      return this.success(c, result, 'Model list retrieved successfully');
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * Retrieves model details
   * GET /api/v1/models/:providerId/:modelId
   */
  async handleGetModel(c: Context) {
    try {
      const { providerId, modelId } = this.getParams<{ modelId: string; providerId: string }>(c);

      const db = await this.getDatabase();
      const modelService = new ModelService(db, this.getUserId(c), this.getWorkspaceId(c));
      const result = await modelService.getModelDetail(providerId, modelId);

      return this.success(c, result, 'Model details retrieved successfully');
    } catch (error) {
      return this.handleError(c, error);
    }
  }
}
