import type { EmojiReaction } from '@orvilo/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Issue-level emoji reactions. The schema has no `task_reactions` table yet —
 * this is the local stand-in the Linear-parity UI writes to, so the feature
 * behaves exactly like the real one. When the backend lands, swap this store
 * for the server endpoints; the components take their data through
 * `reactions`/`addReaction`/`removeReaction` and do not change.
 */
interface TaskReactionsState {
  addReaction: (taskId: string, emoji: string, userId: string) => void;
  reactions: Record<string, EmojiReaction[]>;
  removeReaction: (taskId: string, emoji: string, userId: string) => void;
}

export const useTaskReactionStore = create<TaskReactionsState>()(
  persist(
    (set) => ({
      addReaction: (taskId, emoji, userId) =>
        set((state) => {
          const current = state.reactions[taskId] ?? [];
          const existing = current.find((r) => r.emoji === emoji);
          const next = existing
            ? current.map((r) =>
                r.emoji === emoji && !r.users.includes(userId)
                  ? { ...r, count: r.count + 1, users: [...r.users, userId] }
                  : r,
              )
            : [...current, { count: 1, emoji, users: [userId] }];
          return { reactions: { ...state.reactions, [taskId]: next } };
        }),
      reactions: {},
      removeReaction: (taskId, emoji, userId) =>
        set((state) => {
          const current = state.reactions[taskId] ?? [];
          const next = current
            .map((r) => {
              if (r.emoji !== emoji) return r;
              const users = r.users.filter((u) => u !== userId);
              return { ...r, count: users.length, users };
            })
            .filter((r) => r.count > 0);
          return { reactions: { ...state.reactions, [taskId]: next } };
        }),
    }),
    { name: 'orvilo-task-reactions', partialize: (s) => ({ reactions: s.reactions }) },
  ),
);

export const taskReactionSelectors = {
  reactionsForTask: (taskId: string) => (state: TaskReactionsState) =>
    state.reactions[taskId] ?? [],
};
