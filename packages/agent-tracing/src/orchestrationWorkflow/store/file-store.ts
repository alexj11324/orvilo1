import fs from 'node:fs/promises';
import path from 'node:path';

import type { OrchestrationWorkflowTraceSummary, OrchestrationWorkflowTrajectory } from '../types';
import { migrateOrchestrationWorkflowTraceData } from './migrateTraceData';
import type { IOrchestrationWorkflowTraceStore } from './types';

const DEFAULT_DIR = '.orchestration-workflow-tracing';
const PARTIAL_DIR = '_partial';

/**
 * Local-disk orchestration workflow trajectories, the dev counterpart of `FileSnapshotStore`.
 *
 * Files are keyed by orchestration workflow id rather than by timestamp: a orchestration workflow id is stable for
 * the whole run, so there is exactly one object per orchestration workflow and no name to
 * reconcile when it is finalized.
 */
export class FileOrchestrationWorkflowTraceStore implements IOrchestrationWorkflowTraceStore {
  private dir: string;
  private ready: Promise<void>;

  constructor(rootDir?: string) {
    this.dir = path.resolve(rootDir ?? process.cwd(), DEFAULT_DIR);
    this.ready = migrateOrchestrationWorkflowTraceDirectory(rootDir ?? process.cwd());
  }

  private filePath(orchestrationWorkflowId: string): string {
    return path.join(this.dir, `${safeName(orchestrationWorkflowId)}.json`);
  }

  private partialDir(): string {
    return path.join(this.dir, PARTIAL_DIR);
  }

  private partialPath(orchestrationWorkflowId: string): string {
    return path.join(this.partialDir(), `${safeName(orchestrationWorkflowId)}.json`);
  }

  async save(trajectory: OrchestrationWorkflowTrajectory): Promise<void> {
    await this.ready;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(
      this.filePath(trajectory.orchestrationWorkflowId),
      JSON.stringify(trajectory, null, 2),
      'utf8',
    );
  }

  async get(orchestrationWorkflowId: string): Promise<OrchestrationWorkflowTrajectory | null> {
    await this.ready;
    const finalized = await readJson<OrchestrationWorkflowTrajectory>(
      this.filePath(orchestrationWorkflowId),
    );
    if (finalized) return finalized;

    // An in-flight orchestration workflow is the common case for a tool used while debugging, so
    // fall through to the partial instead of reporting "no trace".
    const partial = await this.loadPartial(orchestrationWorkflowId);
    return partial ? partialToTrajectory(orchestrationWorkflowId, partial) : null;
  }

  /**
   * Finalized and in-progress trajectories together, newest first.
   *
   * A long-horizon orchestration workflow spends nearly all of its life as a partial, so a
   * listing that showed only finalized objects would report "nothing here" on
   * a machine that is actively running orchestration workflows — while inspecting any one of
   * them by id worked fine.
   */
  async list(options?: { limit?: number }): Promise<OrchestrationWorkflowTraceSummary[]> {
    await this.ready;
    const limit = options?.limit ?? 10;

    const finalized = await Promise.all(
      (await this.listFiles()).map(async (file) => ({
        mtime: await mtimeOf(path.join(this.dir, file)),
        trajectory: await readJson<OrchestrationWorkflowTrajectory>(path.join(this.dir, file)),
      })),
    );
    const partials = await Promise.all(
      (await this.listPartials()).map(async (file) => {
        const filePath = path.join(this.partialDir(), file);
        const partial = await readJson<Partial<OrchestrationWorkflowTrajectory>>(filePath);
        return {
          mtime: await mtimeOf(filePath),
          trajectory: partial
            ? partialToTrajectory(
                partial.orchestrationWorkflowId ?? file.replace(/\.json$/, ''),
                partial,
              )
            : null,
        };
      }),
    );

    // A orchestration workflow that finalized while a stale partial lingered would otherwise show
    // twice; the finalized object wins because it is the complete one.
    const seen = new Set<string>();
    return [...finalized, ...partials]
      .flatMap((entry) => (entry.trajectory ? [{ ...entry, trajectory: entry.trajectory }] : []))
      .sort((a, b) => b.mtime - a.mtime)
      .filter(({ trajectory }) => {
        if (seen.has(trajectory.orchestrationWorkflowId)) return false;
        seen.add(trajectory.orchestrationWorkflowId);
        return true;
      })
      .slice(0, limit)
      .map(({ trajectory }) => toSummary(trajectory));
  }

  async listPartials(): Promise<string[]> {
    await this.ready;
    try {
      const entries = await fs.readdir(this.partialDir());
      return entries.filter((file) => file.endsWith('.json')).sort();
    } catch {
      return [];
    }
  }

  async loadPartial(
    orchestrationWorkflowId: string,
  ): Promise<Partial<OrchestrationWorkflowTrajectory> | null> {
    await this.ready;
    return readJson<Partial<OrchestrationWorkflowTrajectory>>(
      this.partialPath(orchestrationWorkflowId),
    );
  }

  async savePartial(
    orchestrationWorkflowId: string,
    partial: Partial<OrchestrationWorkflowTrajectory>,
  ): Promise<void> {
    await this.ready;
    await fs.mkdir(this.partialDir(), { recursive: true });
    await fs.writeFile(this.partialPath(orchestrationWorkflowId), JSON.stringify(partial), 'utf8');
  }

  async removePartial(orchestrationWorkflowId: string): Promise<void> {
    await this.ready;
    try {
      await fs.unlink(this.partialPath(orchestrationWorkflowId));
    } catch {
      // already gone
    }
  }

  private async listFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.dir);
      return entries.filter((file) => file.endsWith('.json'));
    } catch {
      return [];
    }
  }
}

const safeName = (orchestrationWorkflowId: string): string =>
  orchestrationWorkflowId.replaceAll(/[^\w-]/g, '_');

/** The file name is an id, so ordering has to come from the filesystem. */
const mtimeOf = async (filePath: string): Promise<number> =>
  fs
    .stat(filePath)
    .then((stat) => stat.mtimeMs)
    .catch(() => 0);

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const before = JSON.stringify(data);
    const migrated = migrateOrchestrationWorkflowTraceData(data);
    if (JSON.stringify(migrated) !== before)
      await fs.writeFile(filePath, JSON.stringify(migrated), 'utf8');
    return migrated as T;
  } catch {
    return null;
  }
}

export function partialToTrajectory(
  orchestrationWorkflowId: string,
  partial: Partial<OrchestrationWorkflowTrajectory>,
): OrchestrationWorkflowTrajectory {
  const advances = partial.advances ?? [];
  return {
    ...partial,
    advances,
    orchestrationWorkflowId: partial.orchestrationWorkflowId ?? orchestrationWorkflowId,
    graphBaseline: partial.graphBaseline ?? {
      decisions: [],
      edges: [],
      orchestrationWorkflow: {
        id: orchestrationWorkflowId,
        status: 'unknown',
        title: partial.title ?? orchestrationWorkflowId,
      },
      nodes: [],
    },
    startedAt: partial.startedAt ?? Date.now(),
    title: partial.title ?? orchestrationWorkflowId,
    totalAdvances: advances.length,
    totalTicks: advances.reduce((sum, advance) => sum + advance.ticks.length, 0),
    traceId: partial.traceId ?? orchestrationWorkflowId,
  };
}

export function toSummary(
  trajectory: OrchestrationWorkflowTrajectory,
): OrchestrationWorkflowTraceSummary {
  return {
    advances: trajectory.totalAdvances,
    completionReason: trajectory.completionReason,
    createdAt: trajectory.startedAt,
    durationMs: (trajectory.completedAt ?? Date.now()) - trajectory.startedAt,
    orchestrationWorkflowId: trajectory.orchestrationWorkflowId,
    title: trajectory.title,
  };
}

/** Move the old on-disk store once, retaining newer files when both directories exist. */
export async function migrateOrchestrationWorkflowTraceDirectory(rootDir: string): Promise<void> {
  const legacyDir = path.resolve(rootDir, '.goal-tracing');
  const currentDir = path.resolve(rootDir, '.orchestration-workflow-tracing');
  for (const subdir of ['', '_partial', '_remote']) {
    const source = path.join(legacyDir, subdir);
    let entries: string[];
    try {
      entries = await fs.readdir(source);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const destination = path.join(currentDir, subdir);
    await fs.mkdir(destination, { recursive: true });
    for (const file of entries.filter((entry) => entry.endsWith('.json'))) {
      const oldPath = path.join(source, file);
      try {
        await fs.link(oldPath, path.join(destination, file));
      } catch (error) {
        if (['EEXIST', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) continue;
        throw error;
      }
      await fs.unlink(oldPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    await fs.rmdir(source).catch(() => {});
  }
  await fs.rmdir(legacyDir).catch(() => {});
}
