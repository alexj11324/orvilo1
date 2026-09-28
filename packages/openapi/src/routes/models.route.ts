import { Hono } from 'hono';

import { getAllScopePermissions } from '@/utils/rbac';

import { zValidator } from '../common/validator';
import { ModelController } from '../controllers';
import { requireAuth } from '../middleware';
import { requireAnyPermission } from '../middleware/permission-check';
import { ModelIdParamSchema, ModelsListQuerySchema } from '../types/model.type';

// Deployment-owned model catalog — provider/model management is retired, so
// only the read endpoints remain for API consumers picking `model`/`provider`.
const ModelRoutes = new Hono();

// GET /api/v1/models - Get model list (supports pagination, filtering, and grouping)
ModelRoutes.get(
  '/',
  requireAuth,
  requireAnyPermission(
    getAllScopePermissions('AI_MODEL_READ'),
    'You do not have permission to view model list',
  ),
  zValidator('query', ModelsListQuerySchema),
  (c) => {
    const controller = new ModelController();
    return controller.handleGetModels(c);
  },
);

// GET /api/v1/models/:providerId/:modelId - Get model details
ModelRoutes.get(
  '/:providerId/:modelId',
  requireAuth,
  requireAnyPermission(
    getAllScopePermissions('AI_MODEL_READ'),
    'You do not have permission to view model details',
  ),
  zValidator('param', ModelIdParamSchema),
  (c) => {
    const controller = new ModelController();
    return controller.handleGetModel(c);
  },
);

export default ModelRoutes;
