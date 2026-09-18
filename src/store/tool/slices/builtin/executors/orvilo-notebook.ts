/**
 * Orvilo Notebook Executor
 *
 * Creates and exports the NotebookExecutor instance for registration.
 * Injects notebookService as dependency.
 */
import { NotebookExecutor } from '@orvilo/builtin-tool-notebook/executor';

import { notebookService } from '@/services/notebook';

// Create executor instance with client-side service
export const notebookExecutor = new NotebookExecutor(notebookService);
