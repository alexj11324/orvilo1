import type * as OrvilochatConstModule from '@orvilo/const';
import type { ExecAgentResult } from '@orvilo/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentService } from '@/services/agent';
import { aiAgentService } from '@/services/aiAgent';
import { aiChatService } from '@/services/aiChat';
import * as skillPreload from '@/services/chat/mecha/skillPreload';
import { messageService } from '@/services/message';
import * as agentGroupStore from '@/store/agentGroup';
import { setPendingTopicRepos } from '@/store/chat/pendingTopicRepos';
import { operationSelectors } from '@/store/chat/slices/operation/selectors';
import type {
  VoiceMessageSend,
  VoiceMessageSendOptions,
} from '@/store/chat/slices/voiceMessage/action';
import { LOCAL_MESSAGE_SCOPE } from '@/store/chat/utils/localMessages';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { topicMapKey } from '@/store/chat/utils/topicMapKey';
import { useDeviceStore } from '@/store/device';
import { fileChatSelectors, useFileStore } from '@/store/file';
import { getSessionStoreState } from '@/store/session';
import * as toolStoreModule from '@/store/tool';
import { pageAgentRuntime } from '@/store/tool/slices/builtin/executors/pageAgentRuntime';
import { useUserStore } from '@/store/user';

import { useChatStore } from '../../../../store';
import { AGENT_BINDING_REQUIRED_ERROR } from '../dispatch/agentDispatcher';
import { createMockAgentConfig, createMockMessage, TEST_CONTENT, TEST_IDS } from './fixtures';
import { resetTestEnvironment, setupMockSelectors, spyOnMessageService } from './helpers';

const executeHeterogeneousAgentMock = vi.hoisted(() => vi.fn());
const mockConstEnv = vi.hoisted(() => ({ isDesktop: false }));
const mockLocalFileService = vi.hoisted(() => ({
  listLocalFiles: vi.fn(),
  readLocalFile: vi.fn(),
}));

vi.mock('@orvilo/const', async (importOriginal) => {
  const actual = await importOriginal<typeof OrvilochatConstModule>();
  return {
    ...actual,
    get isDesktop() {
      return mockConstEnv.isDesktop;
    },
  };
});

vi.mock('../transports/hetero/heterogeneousAgentExecutor', () => ({
  executeHeterogeneousAgent: (...args: any[]) => executeHeterogeneousAgentMock(...args),
}));

const getGeneralAccessMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/resourcePermission', () => ({
  resourcePermissionService: { getGeneralAccess: getGeneralAccessMock },
}));

vi.mock('@/services/electron/localFileService', () => ({
  localFileService: mockLocalFileService,
}));

vi.mock('@/store/tool/slices/builtin/loadBuiltinSkills', () => ({
  loadBuiltinSkill: async (identifier: string) =>
    toolStoreModule
      .getToolStoreState()
      .builtinSkills.find((skill: any) => skill.identifier === identifier),
  loadBuiltinSkills: async () => toolStoreModule.getToolStoreState().builtinSkills,
}));

// Mock lambdaClient to prevent network requests
vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    session: {
      updateSession: {
        mutate: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

beforeEach(() => {
  resetTestEnvironment();
  setupMockSelectors();
  spyOnMessageService();
  const sessionStore = getSessionStoreState();
  vi.spyOn(sessionStore, 'triggerSessionUpdate').mockResolvedValue(undefined);
  vi.spyOn(agentService, 'getAgentConfigById').mockResolvedValue(createMockAgentConfig() as any);
  useUserStore.setState({ workspaceUserPreference: {} });
  useFileStore.setState({ chatContextSelectionsByContext: {} });

  act(() => {
    useChatStore.setState({
      refreshMessages: vi.fn(),
      refreshTopic: vi.fn(),
      mainInputEditor: null,
    });
  });
});

afterEach(() => {
  executeHeterogeneousAgentMock.mockReset();
  mockConstEnv.isDesktop = false;
  setPendingTopicRepos(TEST_IDS.SESSION_ID, []);
  // Zustand state and the window-backed agent context survive `restoreAllMocks`,
  // so a cwd test that seeds a device (or a desktop path) would otherwise leak
  // a working directory into every later send in this file.
  useDeviceStore.setState({ devices: [] });
  delete window.__ORVILO_GLOBAL_AGENT_CONTEXT__;
  vi.restoreAllMocks();
});

// Helper to create context for testing
const createTestContext = (agentId: string = TEST_IDS.SESSION_ID) => ({
  agentId,
  topicId: null,
  threadId: null,
});

// The store types `executeGatewayAgent` as returning `Promise<ExecAgentResult>`,
// so gateway spies must resolve the full contract — not just the fields a given
// test happens to read.
const makeGatewayResult = (overrides: Partial<ExecAgentResult> = {}): ExecAgentResult =>
  ({
    agentId: TEST_IDS.SESSION_ID,
    assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
    autoStarted: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    message: 'ok',
    operationId: 'op-gateway',
    status: 'processing',
    success: true,
    timestamp: '2026-01-01T00:00:00.000Z',
    topicId: TEST_IDS.TOPIC_ID,
    userMessageId: TEST_IDS.USER_MESSAGE_ID,
    ...overrides,
  }) as ExecAgentResult;

/**
 * Give the default mock agent a desktop-local heterogeneous binding so sends
 * resolve the `hetero` runtime. The in-browser client runtime is retired and
 * `selectRuntimeType` throws AGENT_BINDING_REQUIRED for unbound agents, so any
 * test that exercises the REST-persist + local-execution path needs an explicit
 * binding now. `executeHeterogeneousAgent` is module-mocked above, so the run
 * resolves immediately.
 */
const setupHeteroRuntime = (
  provider: Record<string, any> = { command: 'codex', type: 'codex' },
) => {
  mockConstEnv.isDesktop = true;
  setupMockSelectors({
    agentConfig: {
      // An unset execution target resolves to pending `none` on every client —
      // the in-process `hetero` runtime now requires the explicit `local`
      // selection the device switcher persists (mount default / user pick).
      agencyConfig: { executionTarget: 'local', heterogeneousProvider: provider },
    },
  });
};

/**
 * Gateway + single leading @agent mention is the only path that still runs the
 * REST-persist tail (sendMessageInServer → executeDirectMention →
 * ClientSubAgentTransport). This sets up the gateway flag and mocks the
 * server-backed sub-agent task dispatch + polling so the tail resolves.
 */
const setupDirectMentionTail = () => {
  act(() => {
    useChatStore.setState({ isGatewayModeEnabled: () => true });
  });
  vi.spyOn(aiAgentService, 'execSubAgentTask').mockResolvedValue({
    assistantMessageId: 'sub-assistant',
    operationId: 'sub-op',
    success: true,
    threadId: 'thread-sub',
  } as any);
  vi.spyOn(aiAgentService, 'getSubAgentTaskStatus').mockResolvedValue({
    result: 'sub agent done',
    status: 'completed',
  } as any);
};

/** editorData with a single leading agent mention — triggers the tail path. */
const directMentionEditorData = (text: string = TEST_CONTENT.USER_MESSAGE) =>
  ({
    root: {
      children: [
        {
          children: [
            {
              label: 'Agent A',
              metadata: { id: 'agent-a', type: 'agent' },
              type: 'mention',
            },
            { text: ' ' + text, type: 'text' },
          ],
          type: 'paragraph',
        },
      ],
      type: 'root',
    },
  }) as any;

const DIRECT_MENTION_TEXT = '@Agent A ';

describe('ConversationLifecycle actions', () => {
  describe('sendMessage', () => {
    describe('validation', () => {
      it('should not send when sessionId is empty', async () => {
        const { result } = renderHook(() => useChatStore());
        const sendMessageInServerSpy = vi.spyOn(aiChatService, 'sendMessageInServer');

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: { agentId: '', topicId: null, threadId: null },
          });
        });

        // No runtime or persistence seam is reached without an owner agent id.
        expect(sendMessageInServerSpy).not.toHaveBeenCalled();
        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
      });

      it('should not send when message is empty and no files are provided', async () => {
        // The empty-content check sits AFTER runtime selection, so the send
        // needs a valid binding to reach it at all.
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.EMPTY,
            context: createTestContext(),
          });
        });

        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
      });

      it('should not send when message is empty with empty files array', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.EMPTY,
            files: [],
            context: createTestContext(),
          });
        });

        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
      });
    });

    describe('message creation', () => {
      it('continues from the active conversational tail after a recovered task callback', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicId = TEST_IDS.TOPIC_ID;
        const activeAssistant = createMockMessage({
          id: 'active-assistant',
          role: 'assistant',
          topicId,
        });
        const recoveredCallback = createMockMessage({
          id: 'recovered-task-callback',
          parentId: 'tool-use-shell',
          role: 'taskCallback',
          topicId,
        });
        const key = messageMapKey({ agentId, topicId });
        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: topicId,
            messagesMap: { [key]: [activeAssistant, recoveredCallback] },
          });
        });
        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            messages: [
              createMockMessage({
                id: TEST_IDS.USER_MESSAGE_ID,
                parentId: activeAssistant.id,
                role: 'user',
                topicId,
              }),
              createMockMessage({
                id: TEST_IDS.ASSISTANT_MESSAGE_ID,
                parentId: TEST_IDS.USER_MESSAGE_ID,
                role: 'assistant',
                topicId,
              }),
            ],
            topicId,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);

        await act(async () => {
          await result.current.sendMessage({
            context: { agentId, threadId: null, topicId },
            message: TEST_CONTENT.USER_MESSAGE,
            messages: [activeAssistant, recoveredCallback],
          });
        });

        expect(sendMessageInServerSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            newUserMessage: expect.objectContaining({ parentId: activeAssistant.id }),
          }),
          expect.any(AbortController),
        );
      });

      it('should render pending compressedGroup immediately for /compact', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const topicId = TEST_IDS.TOPIC_ID;
        const agentId = TEST_IDS.SESSION_ID;
        const key = messageMapKey({ agentId, topicId });
        const existingMessages = [
          createMockMessage({ id: 'user-1', role: 'user', topicId }),
          createMockMessage({ id: 'assistant-1', role: 'assistant', topicId }),
        ];

        await act(async () => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: topicId,
            dbMessagesMap: { [key]: existingMessages },
            messagesMap: { [key]: existingMessages },
          });
        });

        const createCompressionGroupSpy = vi
          .spyOn(messageService, 'createCompressionGroup')
          .mockResolvedValue({
            messageGroupId: 'group-1',
            messages: [
              {
                id: 'group-1',
                content: '...',
                role: 'compressedGroup',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              } as any,
            ],
            messagesToSummarize: existingMessages,
          });
        vi.spyOn(aiChatService, 'generateJSON').mockResolvedValue({
          data: { summary: 'summary' },
          tracingId: 'tracing-1',
        } as any);
        vi.spyOn(messageService, 'finalizeCompression').mockResolvedValue({
          messages: [
            {
              id: 'group-1',
              content: 'summary',
              role: 'compressedGroup',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            } as any,
          ],
        });

        const optimisticCreateTmpMessageSpy = vi.spyOn(
          result.current,
          'optimisticCreateTmpMessage',
        );
        const internalDispatchMessageSpy = vi.spyOn(result.current, 'internal_dispatchMessage');

        await act(async () => {
          await result.current.sendMessage({
            context: { agentId, topicId, threadId: null },
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        actionCategory: 'command',
                        actionLabel: 'Compact context',
                        actionType: 'compact',
                        type: 'action-tag',
                      },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            message: '',
          });
        });

        expect(optimisticCreateTmpMessageSpy).not.toHaveBeenCalled();
        expect(internalDispatchMessageSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.stringMatching(/^tmp_compress_/),
            type: 'createMessage',
            value: expect.objectContaining({
              compressedMessages: [],
              content: '...',
              role: 'compressedGroup',
            }),
          }),
          expect.any(Object),
        );
        expect(createCompressionGroupSpy).toHaveBeenCalledWith({
          agentId,
          messageIds: ['user-1', 'assistant-1'],
          topicId,
        });
      });

      it('should not process AI when onlyAddUserMessage is true', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const onMessageAccepted = vi.fn();
        const onMessagePersisted = vi.fn();

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [],
          topics: [],
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            onlyAddUserMessage: true,
            onMessageAccepted,
            onMessagePersisted,
            context: createTestContext(),
          });
        });

        // onlyAddUserMessage persists without dispatching an agent run.
        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
        expect(onMessageAccepted).toHaveBeenCalledOnce();
        expect(onMessagePersisted).toHaveBeenCalledOnce();
      });

      it('should restore the pre-send editor snapshot when server send fails', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const onMessagePersisted = vi.fn();
        const inputEditorState = {
          root: {
            children: [
              {
                children: [{ text: 'Restored rich text', type: 'text', version: 1 }],
                type: 'paragraph',
                version: 1,
              },
            ],
            type: 'root',
            version: 1,
          },
        };
        const clearedEditorState = {
          root: { children: [], type: 'root', version: 1 },
        };
        const setDocument = vi.fn();
        const setJSONState = vi.fn();

        vi.spyOn(aiChatService, 'sendMessageInServer').mockRejectedValue(
          new TRPCClientError('restore failed'),
        );

        act(() => {
          useChatStore.setState({
            mainInputEditor: {
              getJSONState: vi.fn().mockReturnValue(clearedEditorState),
              setDocument,
              setJSONState,
            } as any,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            editorData: inputEditorState as any,
            message: 'Restored rich text',
            onMessagePersisted,
          });
        });

        const sendMessageOperation = Object.values(result.current.operations).find(
          (operation) => operation.type === 'sendMessage',
        );

        expect(sendMessageOperation?.metadata.inputEditorTempState).toEqual(inputEditorState);
        expect(setJSONState).toHaveBeenCalledWith(inputEditorState);
        expect(setDocument).not.toHaveBeenCalled();
        expect(onMessagePersisted).not.toHaveBeenCalled();
      });

      it('should not restore an editor snapshot when a separate voice send fails', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const getJSONState = vi.fn().mockReturnValue({ stale: 'draft' });
        const setDocument = vi.fn();
        const setJSONState = vi.fn();

        vi.spyOn(aiChatService, 'sendMessageInServer').mockRejectedValue(
          new TRPCClientError('voice persistence failed'),
        );

        act(() => {
          useChatStore.setState({
            mainInputEditor: {
              getJSONState,
              setDocument,
              setJSONState,
            } as any,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            files: [{ id: 'voice-file' } as any],
            message: '',
            preserveComposer: true,
          });
        });

        const sendMessageOperation = Object.values(result.current.operations).find(
          (operation) => operation.type === 'sendMessage',
        );

        expect(sendMessageOperation?.metadata.inputEditorTempState).toBeUndefined();
        expect(getJSONState).not.toHaveBeenCalled();
        expect(setJSONState).not.toHaveBeenCalled();
        expect(setDocument).not.toHaveBeenCalled();
      });

      it('should restore the pre-send editor snapshot when a gateway send fails', async () => {
        // Regression: the composer is cleared the instant Enter is pressed, and
        // only the client-runtime branch put the text back. The gateway branch
        // just logged, failed the op and deleted the optimistic pair — so a
        // server-side start refusal (e.g. `Topic <id> remained busy while
        // starting operation ...`, thrown by the reservation gate before the
        // user message is ever persisted) made the message vanish with no trace
        // and no way to recover what was typed.
        const { result } = renderHook(() => useChatStore());
        const inputEditorState = {
          root: {
            children: [
              {
                children: [{ text: 'Swallowed by gateway', type: 'text', version: 1 }],
                type: 'paragraph',
                version: 1,
              },
            ],
            type: 'root',
            version: 1,
          },
        };
        const setDocument = vi.fn();
        const setJSONState = vi.fn();
        const executeGatewayAgentSpy = vi
          .fn()
          .mockRejectedValue(
            new TRPCClientError('Topic tpc_test remained busy while starting operation'),
          );

        act(() => {
          useChatStore.setState({
            isGatewayModeEnabled: () => true,
            executeGatewayAgent: executeGatewayAgentSpy,
            mainInputEditor: {
              getJSONState: vi.fn().mockReturnValue({ root: { children: [], type: 'root' } }),
              setDocument,
              setJSONState,
            } as any,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            editorData: inputEditorState as any,
            message: 'Swallowed by gateway',
          });
        });

        const sendMessageOperation = Object.values(result.current.operations).find(
          (operation) => operation.type === 'sendMessage',
        );

        // Prove the gateway branch actually ran and failed — otherwise a silent
        // early bail would satisfy the restore assertions below by accident.
        expect(executeGatewayAgentSpy).toHaveBeenCalled();
        expect(sendMessageOperation?.status).toBe('failed');

        expect(setJSONState).toHaveBeenCalledWith(inputEditorState);
        expect(sendMessageOperation?.metadata.inputSendErrorMsg).toBeTruthy();
      });

      it('should not restore the composer when gateway setup fails after message acceptance', async () => {
        const { result } = renderHook(() => useChatStore());
        const setDocument = vi.fn();
        const setJSONState = vi.fn();
        const executeGatewayAgentSpy = vi.fn().mockImplementation(async (params) => {
          params.onMessageAccepted();
          throw new Error('gateway client initialization failed');
        });

        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            mainInputEditor: {
              getJSONState: vi.fn().mockReturnValue({ root: { children: [], type: 'root' } }),
              setDocument,
              setJSONState,
            } as any,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            message: 'Already persisted',
          });
        });

        const sendMessageOperation = Object.values(result.current.operations).find(
          (operation) => operation.type === 'sendMessage',
        );
        expect(executeGatewayAgentSpy).toHaveBeenCalledOnce();
        expect(setDocument).not.toHaveBeenCalled();
        expect(setJSONState).not.toHaveBeenCalled();
        expect(sendMessageOperation?.metadata.inputSendErrorMsg).toBeUndefined();
      });

      it('should restore the pre-send editor snapshot when a hetero send fails', async () => {
        // Same silent-discard shape as the gateway branch above: persistence
        // throws, the temp rows are cleaned up, and the typed text is gone.
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });

        const { result } = renderHook(() => useChatStore());
        const inputEditorState = {
          root: {
            children: [
              {
                children: [{ text: 'Swallowed by hetero', type: 'text', version: 1 }],
                type: 'paragraph',
                version: 1,
              },
            ],
            type: 'root',
            version: 1,
          },
        };
        const setDocument = vi.fn();
        const setJSONState = vi.fn();
        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockRejectedValue(
            new TRPCClientError('Topic tpc_test remained busy while starting operation'),
          );

        act(() => {
          useChatStore.setState({
            mainInputEditor: {
              getJSONState: vi.fn().mockReturnValue({ root: { children: [], type: 'root' } }),
              setDocument,
              setJSONState,
            } as any,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            editorData: inputEditorState as any,
            message: 'Swallowed by hetero',
          });
        });

        const sendMessageOperation = Object.values(result.current.operations).find(
          (operation) => operation.type === 'sendMessage',
        );

        // Prove the hetero persistence branch actually ran and failed.
        expect(sendMessageInServerSpy).toHaveBeenCalled();
        expect(sendMessageOperation?.status).toBe('failed');

        expect(setJSONState).toHaveBeenCalledWith(inputEditorState);
        expect(sendMessageOperation?.metadata.inputSendErrorMsg).toBeTruthy();
      });

      it('should move and adopt a first-turn voice row without sending local-only history', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);

        act(() => {
          useChatStore.setState({
            activeAgentId: TEST_IDS.SESSION_ID,
            activeTopicId: undefined,
          });
        });

        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice-preview');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(useFileStore.getState(), 'uploadWithProgress').mockResolvedValue({
          id: 'uploaded-audio',
          url: 'https://example.com/voice.webm',
        });

        let resolvePersistence!: (value: any) => void;
        const persistence = new Promise<any>((resolve) => {
          resolvePersistence = resolve;
        });
        const sendMessageInServer = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockReturnValue(persistence);

        let optimisticUserMessageId!: string;
        act(() => {
          optimisticUserMessageId = result.current.sendVoiceMessage({
            canSend: () => true,
            context,
            recording: {
              codec: 'opus',
              durationMs: 1200,
              file: new File(['voice'], 'voice.webm', { type: 'audio/webm' }),
              mimeType: 'audio/webm',
              waveform: [0.2, 0.8, 0.3],
            },
            send: (file, options) =>
              new Promise<void>((resolve, reject) => {
                let accepted = false;
                void result.current
                  .sendMessage({
                    context: options.context,
                    files: [file],
                    message: '',
                    onMessageAccepted: () => {
                      accepted = true;
                      resolve();
                    },
                    optimisticUserMessageId: options.messageId,
                    preserveComposer: true,
                    signal: options.signal,
                  })
                  .then(() => {
                    if (!accepted) reject(new Error('Voice message was not accepted'));
                  }, reject);
              }),
          })!;
        });

        await waitFor(() => expect(sendMessageInServer).toHaveBeenCalledOnce());

        const midState = useChatStore.getState();
        const mintedTopicId = midState.activeTopicId!;
        const mintedContextKey = messageMapKey({ ...context, topicId: mintedTopicId });
        const pendingMessages = midState.dbMessagesMap[mintedContextKey];
        expect(mintedTopicId).toMatch(/^tpc_/);
        expect(optimisticUserMessageId).toMatch(/^msg_/);
        expect(midState.dbMessagesMap[contextKey] ?? []).toEqual([]);
        expect(pendingMessages.filter((message) => message.role === 'user')).toHaveLength(1);
        expect(
          pendingMessages.filter((message) => message.id === optimisticUserMessageId),
        ).toHaveLength(1);
        expect(pendingMessages.find((message) => message.id === optimisticUserMessageId)).toEqual(
          expect.objectContaining({
            audioList: [
              expect.objectContaining({
                id: 'uploaded-audio',
                url: 'https://example.com/voice.webm',
              }),
            ],
            files: ['uploaded-audio'],
            metadata: expect.objectContaining({ scope: LOCAL_MESSAGE_SCOPE }),
          }),
        );
        expect(sendMessageInServer.mock.calls[0][0].newTopic?.id).toBe(mintedTopicId);
        expect(sendMessageInServer.mock.calls[0][0].newTopic?.topicMessageIds).toEqual([]);

        const request = sendMessageInServer.mock.calls[0][0];
        await act(async () => {
          resolvePersistence({
            assistantMessageId: request.newAssistantMessage.id,
            isCreateNewTopic: true,
            messages: [
              createMockMessage({
                id: request.newUserMessage.id,
                role: 'user',
                topicId: mintedTopicId,
              }),
              createMockMessage({
                id: request.newAssistantMessage.id,
                role: 'assistant',
                topicId: mintedTopicId,
              }),
            ],
            topicId: mintedTopicId,
            topics: { items: [{ id: mintedTopicId, title: 'Voice topic' }], total: 1 },
            userMessageId: request.newUserMessage.id,
          });
        });

        await waitFor(() =>
          expect(useChatStore.getState().voiceMessageUploadMap[optimisticUserMessageId]).toBe(
            undefined,
          ),
        );
      });

      it('should preserve a caller-owned optimistic user row when persistence fails before acceptance', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const context = {
          agentId: TEST_IDS.SESSION_ID,
          threadId: null,
          topicId: TEST_IDS.TOPIC_ID,
        };
        const contextKey = messageMapKey(context);
        const optimisticUserMessageId = 'tmp-voice-message';
        const localVoiceMessage = createMockMessage({
          audioList: [
            {
              alt: 'voice.webm',
              durationMs: 1200,
              id: 'tmp-audio',
              mimeType: 'audio/webm',
              url: 'blob:voice-preview',
            },
          ],
          content: '',
          id: optimisticUserMessageId,
          metadata: { scope: LOCAL_MESSAGE_SCOPE },
          topicId: TEST_IDS.TOPIC_ID,
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: TEST_IDS.SESSION_ID,
            activeTopicId: TEST_IDS.TOPIC_ID,
            dbMessagesMap: { [contextKey]: [localVoiceMessage] },
            messagesMap: { [contextKey]: [localVoiceMessage] },
          });
        });

        const onMessageAccepted = vi.fn();
        vi.spyOn(aiChatService, 'sendMessageInServer').mockRejectedValue(
          new Error('persistence failed'),
        );

        await act(async () => {
          await result.current.sendMessage({
            context,
            files: [
              {
                audioMetadata: { durationMs: 1200, mimeType: 'audio/webm' },
                file: { name: 'voice.webm', type: 'audio/webm' },
                fileUrl: 'https://example.com/voice.webm',
                id: 'uploaded-audio',
                status: 'success',
              } as any,
            ],
            message: '',
            onMessageAccepted,
            optimisticUserMessageId,
            preserveComposer: true,
          });
        });

        const remainingMessages = useChatStore.getState().dbMessagesMap[contextKey];
        expect(onMessageAccepted).not.toHaveBeenCalled();
        expect(remainingMessages).toHaveLength(1);
        expect(remainingMessages[0]).toEqual(
          expect.objectContaining({
            id: optimisticUserMessageId,
            metadata: expect.objectContaining({ scope: LOCAL_MESSAGE_SCOPE }),
            role: 'user',
          }),
        );
        expect(remainingMessages.some((message) => message.role === 'assistant')).toBe(false);
      });

      it('should move a failed first-turn voice back to _new before retrying', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const newContextKey = messageMapKey(context);

        act(() => {
          useChatStore.setState({
            activeAgentId: TEST_IDS.SESSION_ID,
            activeTopicId: undefined,
          });
        });

        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice-retry');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(useFileStore.getState(), 'uploadWithProgress').mockResolvedValue({
          id: 'uploaded-retry-audio',
          url: 'https://example.com/retry.webm',
        });

        const sendMessageInServer = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockRejectedValueOnce(new Error('persistence failed'))
          .mockImplementationOnce(async (params: any) => {
            const topicId = params.newTopic?.id;
            return {
              assistantMessageId: params.newAssistantMessage.id,
              isCreateNewTopic: true,
              messages: [
                createMockMessage({ id: params.newUserMessage.id, role: 'user', topicId }),
                createMockMessage({
                  id: params.newAssistantMessage.id,
                  role: 'assistant',
                  topicId,
                }),
              ],
              topicId,
              topics: { items: [{ id: topicId, title: 'Retried voice topic' }], total: 1 },
              userMessageId: params.newUserMessage.id,
            } as any;
          });

        const sendThroughLifecycle: VoiceMessageSend = (file, options: VoiceMessageSendOptions) =>
          new Promise<void>((resolve, reject) => {
            let accepted = false;
            void result.current
              .sendMessage({
                context: options.context,
                files: [file],
                message: '',
                onMessageAccepted: () => {
                  accepted = true;
                  resolve();
                },
                optimisticUserMessageId: options.messageId,
                preserveComposer: true,
                signal: options.signal,
              })
              .then(() => {
                if (!accepted) reject(new Error('Voice message was not accepted'));
              }, reject);
          });

        let messageId!: string;
        act(() => {
          messageId = result.current.sendVoiceMessage({
            canSend: () => true,
            context,
            recording: {
              codec: 'opus',
              durationMs: 1200,
              file: new File(['voice'], 'voice.webm', { type: 'audio/webm' }),
              mimeType: 'audio/webm',
              waveform: [0.2, 0.8, 0.3],
            },
            send: sendThroughLifecycle,
          })!;
        });

        await waitFor(() =>
          expect(useChatStore.getState().voiceMessageUploadMap[messageId]?.status).toBe('failed'),
        );

        const failedTopicId = sendMessageInServer.mock.calls[0][0].newTopic?.id;
        const failedTopicKey = messageMapKey({ ...context, topicId: failedTopicId });
        const failedState = useChatStore.getState();
        const uploadOperation = Object.values(failedState.operations).find(
          (operation) =>
            operation.type === 'uploadVoiceMessage' && operation.context.messageId === messageId,
        );
        expect(failedTopicId).toMatch(/^tpc_/);
        expect(failedState.activeTopicId).toBeFalsy();
        expect(failedState.dbMessagesMap[newContextKey]?.map((message) => message.id)).toContain(
          messageId,
        );
        expect(failedState.dbMessagesMap[failedTopicKey] ?? []).toEqual([]);
        expect(uploadOperation?.context.topicId).toBeNull();

        act(() => result.current.retryVoiceMessage(messageId));

        await waitFor(() => expect(sendMessageInServer).toHaveBeenCalledTimes(2));
        await waitFor(() =>
          expect(useChatStore.getState().voiceMessageUploadMap[messageId]).toBeUndefined(),
        );

        const retryRequest = sendMessageInServer.mock.calls[1][0];
        expect(retryRequest.newTopic?.id).toMatch(/^tpc_/);
        expect(retryRequest.newTopic?.id).not.toBe(failedTopicId);
        expect(retryRequest.newUserMessage.id).toBe(messageId);
      });

      it('should acknowledge persistence before client generation completes', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const onMessageAccepted = vi.fn();
        const onMessagePersisted = vi.fn();
        let resolveExecution!: () => void;
        let sendCompleted = false;
        const executionPromise = new Promise<void>((resolve) => {
          resolveExecution = resolve;
        });

        executeHeterogeneousAgentMock.mockReturnValue(executionPromise);
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current
            .sendMessage({
              context: createTestContext(),
              message: TEST_CONTENT.USER_MESSAGE,
              onMessageAccepted,
              onMessagePersisted,
            })
            .then((value) => {
              sendCompleted = true;
              return value;
            });
        });

        await waitFor(() => expect(onMessagePersisted).toHaveBeenCalledOnce());
        expect(onMessageAccepted).toHaveBeenCalledOnce();
        expect(sendCompleted).toBe(false);

        await act(async () => {
          resolveExecution();
          await sendPromise;
        });
      });

      it('reconciles a persisted client message but skips generation when cancellation wins the request race', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const controller = new AbortController();
        const onMessageAccepted = vi.fn();
        const onMessagePersisted = vi.fn();
        let resolvePersistence!: (value: any) => void;
        const persistence = new Promise<any>((resolve) => {
          resolvePersistence = resolve;
        });
        const sendMessageInServer = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockReturnValue(persistence);
        const context = {
          agentId: TEST_IDS.SESSION_ID,
          threadId: null,
          topicId: TEST_IDS.TOPIC_ID,
        };

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context,
            message: TEST_CONTENT.USER_MESSAGE,
            onMessageAccepted,
            onMessagePersisted,
            signal: controller.signal,
          });
        });
        await waitFor(() => expect(sendMessageInServer).toHaveBeenCalledOnce());

        act(() => controller.abort(new DOMException('cancelled', 'AbortError')));
        await act(async () => {
          resolvePersistence({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            messages: [
              createMockMessage({
                id: TEST_IDS.USER_MESSAGE_ID,
                role: 'user',
                topicId: TEST_IDS.TOPIC_ID,
              }),
              createMockMessage({
                id: TEST_IDS.ASSISTANT_MESSAGE_ID,
                role: 'assistant',
                topicId: TEST_IDS.TOPIC_ID,
              }),
            ],
            topicId: TEST_IDS.TOPIC_ID,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          });
          await sendPromise;
        });

        expect(onMessageAccepted).toHaveBeenCalledOnce();
        expect(onMessagePersisted).toHaveBeenCalledOnce();
        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
        expect(result.current.messagesMap[messageMapKey(context)]).toHaveLength(2);
      });

      it('stops the operations-driven topic spinner when cancellation wins persistence', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const controller = new AbortController();
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });
        let resolvePersistence!: (value: any) => void;
        const persistence = new Promise<any>((resolve) => {
          resolvePersistence = resolve;
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });
        const sendMessageInServer = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockReturnValue(persistence);

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: TEST_CONTENT.USER_MESSAGE,
            signal: controller.signal,
          });
        });
        await waitFor(() => expect(sendMessageInServer).toHaveBeenCalledOnce());

        const optimisticTopicId = useChatStore.getState().topicDataMap[topicKey]?.items[0]?.id;
        expect(optimisticTopicId).toMatch(/^tpc_/);
        expect(
          operationSelectors.isTopicVisiblyRunning(optimisticTopicId!)(useChatStore.getState()),
        ).toBe(true);

        act(() => controller.abort(new DOMException('cancelled', 'AbortError')));
        await act(async () => {
          resolvePersistence({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            isCreateNewTopic: true,
            messages: [
              createMockMessage({
                id: TEST_IDS.USER_MESSAGE_ID,
                role: 'user',
                topicId: optimisticTopicId,
              }),
              createMockMessage({
                id: TEST_IDS.ASSISTANT_MESSAGE_ID,
                role: 'assistant',
                topicId: optimisticTopicId,
              }),
            ],
            topicId: optimisticTopicId,
            topics: { items: [{ id: optimisticTopicId, title: 'Server Topic' }], total: 1 },
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          });
          await sendPromise;
        });

        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
        expect(useChatStore.getState().topicDataMap[topicKey]?.items[0]?.id).toBe(
          optimisticTopicId,
        );
        expect(
          operationSelectors.isTopicVisiblyRunning(optimisticTopicId!)(useChatStore.getState()),
        ).toBe(false);
      });

      it('detaches the caller cancellation signal after an unaccepted persistence failure', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const controller = new AbortController();
        vi.spyOn(aiChatService, 'sendMessageInServer').mockRejectedValue(
          new TRPCClientError('persistence failed'),
        );

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            message: TEST_CONTENT.USER_MESSAGE,
            signal: controller.signal,
          });
        });
        const sendOperation = Object.values(result.current.operations).find(
          (operation) => operation.type === 'sendMessage',
        );
        expect(sendOperation?.status).toBe('failed');

        act(() => controller.abort(new DOMException('late cancel', 'AbortError')));

        expect(result.current.operations[sendOperation!.id]?.status).toBe('failed');
      });

      it('should create user message and trigger AI processing', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topics: [],
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(executeHeterogeneousAgentMock).toHaveBeenCalled();
      });

      it('should persist selected slash skills into user message content before sending', async () => {
        // The skill-context suffix is appended by the REST-persist tail, which
        // after the client-runtime retirement only runs for a gateway-bound
        // direct @Agent mention — so this test sends one.
        const { result } = renderHook(() => useChatStore());
        act(() => {
          useChatStore.setState({ isGatewayModeEnabled: () => true });
        });

        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            messages: [
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topicId: TEST_IDS.TOPIC_ID,
            topics: undefined,
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);
        vi.spyOn(aiAgentService, 'execSubAgentTask').mockResolvedValue({
          assistantMessageId: 'sub-assistant',
          operationId: 'sub-op',
          success: true,
          threadId: 'thread-sub',
        } as any);
        vi.spyOn(aiAgentService, 'getSubAgentTaskStatus').mockResolvedValue({
          result: 'sub agent done',
          status: 'completed',
        } as any);
        vi.spyOn(toolStoreModule, 'getToolStoreState').mockReturnValue({
          agentSkillDetailMap: {},
          agentSkills: [],
          builtinSkills: [
            {
              content: 'Use the user memory skill content.',
              description: 'Load user memory',
              identifier: 'user_memory',
              name: 'User Memory',
              source: 'builtin',
            },
            {
              content: 'Use the instruction skill content.',
              description: 'Load instruction',
              identifier: 'instruction',
              name: 'Instruction',
              source: 'builtin',
            },
          ],
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            context: { ...createTestContext(), topicId: TEST_IDS.TOPIC_ID },
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'Agent A',
                        metadata: { id: 'agent-a', type: 'agent' },
                        type: 'mention',
                      },
                      {
                        actionCategory: 'skill',
                        actionLabel: 'User Memory',
                        actionType: 'user_memory',
                        type: 'action-tag',
                      },
                      {
                        actionCategory: 'skill',
                        actionLabel: 'Instruction',
                        actionType: 'instruction',
                        type: 'action-tag',
                      },
                      { text: ' ' + TEST_CONTENT.USER_MESSAGE, type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            message: '<action type="user_memory" category="skill" /> ' + TEST_CONTENT.USER_MESSAGE,
          });
        });

        const requestPayload = sendMessageInServerSpy.mock.calls[0]?.[0];

        expect(requestPayload?.newUserMessage).toEqual(
          expect.objectContaining({
            content: expect.stringContaining(TEST_CONTENT.USER_MESSAGE),
            editorData: expect.objectContaining({
              root: expect.any(Object),
            }),
          }),
        );
        expect(requestPayload?.newUserMessage.content).toContain('<selected_skill_context>');
        expect(requestPayload?.newUserMessage.content).toContain('identifier="user_memory"');
        expect(requestPayload?.newUserMessage.content).toContain('identifier="instruction"');
        expect(requestPayload?.newUserMessage.content).toContain(
          'Use the user memory skill content.',
        );
        expect(requestPayload?.newUserMessage.content).toContain(
          'Use the instruction skill content.',
        );
        expect(requestPayload?.preloadMessages).toBeUndefined();
        expect(requestPayload?.newUserMessage.editorData?.root.children[0].children).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              actionCategory: 'skill',
              actionType: 'user_memory',
              type: 'action-tag',
            }),
          ]),
        );
        // The direct mention executes through the server-backed sub-agent task
        // transport.
        expect(aiAgentService.execSubAgentTask).toHaveBeenCalled();
      });

      it('should work when sending from home page (activeAgentId is empty but context.agentId exists)', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());

        // Simulate home page state where activeAgentId is empty
        act(() => {
          useChatStore.setState({
            activeAgentId: '',
            activeTopicId: undefined,
          });
        });

        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            messages: [
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topics: [],
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            // Pass agentId via context (simulating home page sending to inbox)
            context: createTestContext('inbox-agent-id'),
          });
        });

        // Should use agentId from context to get agent config. Hetero runs
        // persist only the runtime provider — the CLI owns model selection.
        expect(sendMessageInServerSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            agentId: 'inbox-agent-id',
            newAssistantMessage: expect.objectContaining({
              provider: 'codex',
            }),
          }),
          expect.any(AbortController),
        );
        expect(executeHeterogeneousAgentMock).toHaveBeenCalled();
      });

      it('should adopt the minted topic id and move context added during preflight', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const newBucketKey = messageMapKey({ agentId, topicId: null });
        let resolveSkillPreload!: (value: []) => void;
        const skillPreloadPromise = new Promise<[]>((resolve) => {
          resolveSkillPreload = resolve;
        });
        const skillPreloadSpy = vi
          .spyOn(skillPreload, 'resolveSelectedSkillsWithContent')
          .mockReturnValue(skillPreloadPromise);
        let resolveServerSend!: (value: any) => void;
        const serverSendPromise = new Promise<any>((resolve) => {
          resolveServerSend = resolve;
        });
        let resolveExecute!: () => void;
        const executePromise = new Promise<void>((resolve) => {
          resolveExecute = resolve;
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
          });
        });
        executeHeterogeneousAgentMock.mockReturnValue(executePromise);

        let sentNewTopicId: string | undefined;
        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockImplementation((params: any) => {
            sentNewTopicId = params.newTopic?.id;
            return serverSendPromise;
          });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: 'first message',
          });
        });

        await waitFor(() => expect(skillPreloadSpy).toHaveBeenCalled());

        const pendingSelection = {
          content: 'context added while preparing the first send',
          id: 'pending-selection',
          type: 'text' as const,
        };
        act(() => {
          useFileStore.getState().addChatContextSelection({
            contextKey: newBucketKey,
            selection: pendingSelection,
          });
          resolveSkillPreload([]);
        });

        await waitFor(() => expect(sendMessageInServerSpy).toHaveBeenCalled());

        // The conversation adopted the minted id BEFORE the server answered:
        // activeTopicId already points at it, the optimistic pair lives in the
        // minted bucket (NOT `_new`), and the id is marked as creating.
        const midState = useChatStore.getState();
        const mintedTopicId = midState.activeTopicId!;
        expect(mintedTopicId).toMatch(/^tpc_/);
        expect(sentNewTopicId).toBe(mintedTopicId);
        expect(midState.creatingTopicIds).toContain(mintedTopicId);

        const mintedBucketKey = messageMapKey({ agentId, topicId: mintedTopicId });
        expect(midState.dbMessagesMap[mintedBucketKey]?.length).toBe(2);
        expect(midState.dbMessagesMap[newBucketKey] ?? []).toEqual([]);
        expect(
          fileChatSelectors.chatContextSelections(mintedBucketKey)(useFileStore.getState()),
        ).toEqual([pendingSelection]);
        expect(
          fileChatSelectors.chatContextSelections(newBucketKey)(useFileStore.getState()),
        ).toEqual([]);

        await act(async () => {
          resolveServerSend({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            isCreateNewTopic: true,
            messages: [
              createMockMessage({
                id: TEST_IDS.USER_MESSAGE_ID,
                role: 'user',
                topicId: mintedTopicId,
              }),
              createMockMessage({
                id: TEST_IDS.ASSISTANT_MESSAGE_ID,
                role: 'assistant',
                topicId: mintedTopicId,
              }),
            ],
            topicId: mintedTopicId,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          });
          resolveExecute();
          await sendPromise;
        });

        const endState = useChatStore.getState();
        // Same id end to end — nothing re-keyed, nothing remounted.
        expect(endState.activeTopicId).toBe(mintedTopicId);
        // Server confirmed: the id must leave the creating set so fetching and
        // refetch reconciliation return to normal.
        expect(endState.creatingTopicIds).not.toContain(mintedTopicId);
      });

      it('should return composer context ownership when preflight fails', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const preflightError = new Error('skill preload failed');
        const onPreflightFailure = vi.fn();
        vi.spyOn(skillPreload, 'resolveSelectedSkillsWithContent').mockRejectedValue(
          preflightError,
        );

        await expect(
          result.current.sendMessage({
            context: createTestContext(),
            message: TEST_CONTENT.USER_MESSAGE,
            onPreflightFailure,
          }),
        ).rejects.toBe(preflightError);

        expect(onPreflightFailure).toHaveBeenCalledOnce();
        expect(result.current.operations).toEqual({});
      });

      it('should show an optimistic topic while the first message is still creating the server topic', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });
        const newTopicId = TEST_IDS.NEW_TOPIC_ID;
        let resolveServerSend!: (value: any) => void;
        const serverSendPromise = new Promise<any>((resolve) => {
          resolveServerSend = resolve;
        });
        let resolveExecute!: () => void;
        const executePromise = new Promise<void>((resolve) => {
          resolveExecute = resolve;
        });
        // Mimic the real executor's contract: it completes its own
        // `execHeterogeneousAgent` operation when the run ends — without this
        // the op stays `running` and the sidebar spinner never stops.
        executeHeterogeneousAgentMock.mockImplementation(async (_get: any, params: any) => {
          await executePromise;
          useChatStore.getState().completeOperation(params.operationId);
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockReturnValue(serverSendPromise);

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: '**666**',
          });
        });

        await waitFor(() => expect(sendMessageInServerSpy).toHaveBeenCalled());

        const optimisticTopic = useChatStore.getState().topicDataMap[topicKey]?.items[0];
        expect(optimisticTopic).toEqual(
          expect.objectContaining({
            sessionId: agentId,
            title: '666',
          }),
        );
        expect(optimisticTopic?.id).toMatch(/^tpc_/);
        // The running sendMessage operation (context carries the minted topic
        // id) drives the sidebar spinner while the server round-trip is in
        // flight.
        expect(
          operationSelectors.isTopicVisiblyRunning(optimisticTopic!.id)(useChatStore.getState()),
        ).toBe(true);

        await act(async () => {
          resolveServerSend({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            isCreateNewTopic: true,
            messages: [
              createMockMessage({
                id: TEST_IDS.USER_MESSAGE_ID,
                role: 'user',
                topicId: newTopicId,
              }),
              createMockMessage({
                id: TEST_IDS.ASSISTANT_MESSAGE_ID,
                role: 'assistant',
                topicId: newTopicId,
              }),
            ],
            topicId: newTopicId,
            topics: { items: [{ id: newTopicId, title: 'Server Topic' }], total: 1 },
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);
        });

        await waitFor(() =>
          expect(useChatStore.getState().topicDataMap[topicKey]?.items[0]?.id).toBe(newTopicId),
        );
        const finalTopics = useChatStore.getState().topicDataMap[topicKey]?.items ?? [];
        expect(finalTopics).toEqual([expect.objectContaining({ id: newTopicId })]);
        expect(finalTopics.some((topic) => topic.id === optimisticTopic?.id)).toBe(false);

        await act(async () => {
          resolveExecute();
          await sendPromise;
        });

        // Send settled: no operation left running for either id, so the
        // sidebar spinner is off.
        expect(operationSelectors.isTopicVisiblyRunning(newTopicId)(useChatStore.getState())).toBe(
          false,
        );
        expect(
          operationSelectors.isTopicVisiblyRunning(optimisticTopic!.id)(useChatStore.getState()),
        ).toBe(false);
      });

      it('should snapshot the agent model onto the newTopic (top-level) when the send creates the topic', async () => {
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const newTopicId = TEST_IDS.NEW_TOPIC_ID;

        // The gateway path carries the model snapshot on the `optimisticTopic`
        // it hands to executeGatewayAgent — there is no sendMessageInServer
        // `newTopic` payload on this path anymore.
        const executeGatewayAgentSpy = vi.fn(async (params: any) => {
          useChatStore.getState().internal_replaceTopicId({
            nextId: newTopicId,
            previousId: params.optimisticTopic.id,
          });
          useChatStore.getState().completeOperation(params.parentOperationId);
          return makeGatewayResult({
            operationId: 'gateway-op-model-snapshot',
            topicId: newTopicId,
          });
        });
        const sendMessageInServerSpy = vi.spyOn(aiChatService, 'sendMessageInServer');

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: TEST_CONTENT.USER_MESSAGE,
          });
        });

        expect(sendMessageInServerSpy).not.toHaveBeenCalled();
        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            optimisticTopic: expect.objectContaining({
              model: expect.any(String),
              provider: expect.any(String),
            }),
          }),
        );
      });

      it('should stop the sidebar spinner after a gateway send creates the topic', async () => {
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });
        const newTopicId = TEST_IDS.NEW_TOPIC_ID;
        let resolveGateway!: () => void;
        const executeGatewayAgentSpy = vi.fn().mockImplementation(
          (params: any) =>
            new Promise<any>((resolve) => {
              resolveGateway = () => {
                // Mimic executeGatewayAgent's contract: execAgentTask resolves
                // the optimistic topic via internal_replaceTopicId, and the
                // parent sendMessage op is completed once phase-1 init is done
                // (without this the leaked running op pollutes later tests —
                // resetTestEnvironment does not clear `operations`).
                useChatStore.getState().internal_replaceTopicId({
                  nextId: newTopicId,
                  previousId: params.optimisticTopic.id,
                });
                useChatStore.getState().completeOperation(params.parentOperationId);
                resolve(
                  makeGatewayResult({
                    operationId: 'gateway-op-release',
                    topicId: newTopicId,
                  }),
                );
              };
            }),
        );

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: 'hello',
          });
        });

        await waitFor(() => expect(executeGatewayAgentSpy).toHaveBeenCalled());

        const optimisticTopicId = useChatStore.getState().topicDataMap[topicKey]?.items[0]?.id;
        expect(optimisticTopicId).toMatch(/^tpc_/);
        // The running sendMessage op keeps the spinner on during phase-1 init.
        expect(
          operationSelectors.isTopicVisiblyRunning(optimisticTopicId!)(useChatStore.getState()),
        ).toBe(true);

        await act(async () => {
          resolveGateway();
          await sendPromise;
          // Let the fire-and-forget afterUserMessagePersisted title task settle
          // inside this test instead of leaking into the next one.
          await Promise.resolve();
          await Promise.resolve();
        });

        // From here the run spinner is owned by the persisted
        // `status === 'running'` — no client-side operation may keep spinning
        // for either id, or the sidebar spinner sticks after the run.
        expect(operationSelectors.isTopicVisiblyRunning(newTopicId)(useChatStore.getState())).toBe(
          false,
        );
        expect(
          operationSelectors.isTopicVisiblyRunning(optimisticTopicId!)(useChatStore.getState()),
        ).toBe(false);
      });

      it('keeps persisted gateway messages when caller cancellation wins after acceptance', async () => {
        const { result } = renderHook(() => useChatStore());
        const controller = new AbortController();
        const context = {
          agentId: TEST_IDS.SESSION_ID,
          threadId: null,
          topicId: TEST_IDS.TOPIC_ID,
        };
        let gatewayParams: any;
        let resolveGateway!: () => void;
        const executeGatewayAgentSpy = vi.fn().mockImplementation(
          (params: any) =>
            new Promise<any>((resolve) => {
              gatewayParams = params;
              resolveGateway = () =>
                resolve(
                  makeGatewayResult({
                    assistantMessageId: gatewayParams.clientIds.assistantMessageId,
                    operationId: 'gateway-op-cancelled-after-persistence',
                    topicId: TEST_IDS.TOPIC_ID,
                    userMessageId: gatewayParams.clientIds.userMessageId,
                  }),
                );
            }),
        );
        const internalDispatchMessageSpy = vi.spyOn(result.current, 'internal_dispatchMessage');

        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context,
            message: TEST_CONTENT.USER_MESSAGE,
            signal: controller.signal,
          });
        });
        await waitFor(() => expect(executeGatewayAgentSpy).toHaveBeenCalledOnce());

        act(() => controller.abort(new DOMException('cancelled', 'AbortError')));
        await act(async () => {
          gatewayParams.onMessageAccepted();
          resolveGateway();
          await sendPromise;
        });

        expect(internalDispatchMessageSpy).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: 'deleteMessages' }),
          expect.anything(),
        );
        expect(
          (result.current.messagesMap[messageMapKey(context)] ?? []).map((message) => message.id),
        ).toEqual(
          expect.arrayContaining([
            gatewayParams.clientIds.userMessageId,
            gatewayParams.clientIds.assistantMessageId,
          ]),
        );
      });

      it('should keep the sidebar spinner on through a hetero new-topic run and stop it at the end', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });

        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });
        const newTopicId = TEST_IDS.NEW_TOPIC_ID;

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          isCreateNewTopic: true,
          messages: [
            createMockMessage({
              id: TEST_IDS.USER_MESSAGE_ID,
              role: 'user',
              topicId: newTopicId,
            }),
            createMockMessage({
              id: TEST_IDS.ASSISTANT_MESSAGE_ID,
              role: 'assistant',
              topicId: newTopicId,
            }),
          ],
          topicId: newTopicId,
          topics: { items: [{ id: newTopicId, title: 'Server Topic' }], total: 1 },
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        let resolveExecutor!: () => void;
        executeHeterogeneousAgentMock.mockImplementation(
          (_getStore: unknown, opts: { operationId: string }) =>
            new Promise<void>((resolve) => {
              resolveExecutor = () => {
                // The real executor settles its execHeterogeneousAgent op at
                // the terminal; without this the leaked running op would keep
                // the spinner on (and pollute later tests).
                useChatStore.getState().completeOperation(opts.operationId);
                resolve();
              };
            }),
        );

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: 'hello',
          });
        });

        await waitFor(() => expect(executeHeterogeneousAgentMock).toHaveBeenCalled());

        // The executor only writes the persisted `status === 'running'` (the
        // run spinner's other driver) after startSession resolves — the running
        // execHeterogeneousAgent operation must keep the spinner on while the
        // executor starts up, or it blanks during a slow CLI startup.
        expect(operationSelectors.isTopicVisiblyRunning(newTopicId)(useChatStore.getState())).toBe(
          true,
        );

        await act(async () => {
          resolveExecutor();
          await sendPromise;
          // Let the fire-and-forget afterUserMessagePersisted title task settle
          // inside this test instead of leaking into the next one.
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(operationSelectors.isTopicVisiblyRunning(newTopicId)(useChatStore.getState())).toBe(
          false,
        );
      });

      it('should keep a gateway optimistic topic in its pending repo project group', async () => {
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });
        const selectedRepo = 'https://github.com/alexj11324/orvilo1';
        let resolveGateway!: () => void;
        const gatewayPromise = new Promise<any>((resolve) => {
          resolveGateway = () =>
            resolve({
              assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
              operationId: 'gateway-op-1',
              userMessageId: TEST_IDS.USER_MESSAGE_ID,
            });
        });
        const executeGatewayAgentSpy = vi.fn().mockReturnValue(gatewayPromise);

        setPendingTopicRepos(agentId, [selectedRepo]);

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: 'Create a project topic',
          });
        });

        await waitFor(() => expect(executeGatewayAgentSpy).toHaveBeenCalled());

        // A pending repo selected before the first send used to be missing from
        // the tmp topic, so By Project grouped it under "No directory" until
        // the server topic replaced it.
        expect(useChatStore.getState().topicDataMap[topicKey]?.items[0]).toEqual(
          expect.objectContaining({
            // Pinned model is a top-level column, not metadata.
            model: expect.any(String),
            provider: expect.any(String),
            metadata: {
              executionConfig: { inheritWorkspaceScope: true },
              repos: [selectedRepo],
              workingDirectory: selectedRepo,
              workingDirectoryConfig: { path: selectedRepo, repoType: 'github' },
            },
          }),
        );
        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            optimisticTopic: expect.objectContaining({
              model: expect.any(String),
              provider: expect.any(String),
              metadata: {
                executionConfig: { inheritWorkspaceScope: true },
                repos: [selectedRepo],
                workingDirectory: selectedRepo,
                workingDirectoryConfig: { path: selectedRepo, repoType: 'github' },
              },
            }),
          }),
        );

        await act(async () => {
          resolveGateway();
          await sendPromise;
        });
      });

      // A native (non-hetero) agent bound to a device resolves its cwd for the
      // run (tools, {{workingDirectory}}) but used to leave the new topic
      // unbound — By Project filed every such conversation under "No directory",
      // and later turns re-resolved the agent-level default, so changing the
      // agent's directory silently moved old topics to another project.
      it('should bind a new gateway topic to a native agent device working directory', async () => {
        mockConstEnv.isDesktop = true;
        const deviceId = 'device-1';
        const sourcePath = '/repo/orvilo';
        const worktreePath = '/repo/orvilo/.worktrees/feat';
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              boundDeviceId: deviceId,
              executionTarget: 'local',
              workingDirByDevice: {
                [deviceId]: {
                  git: { activeWorktree: worktreePath },
                  path: sourcePath,
                  repoType: 'github',
                },
              },
            },
          },
        });

        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });
        let resolveGateway!: () => void;
        const gatewayPromise = new Promise<any>((resolve) => {
          resolveGateway = () =>
            resolve({
              assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
              operationId: 'gateway-op-cwd',
              topicId: TEST_IDS.NEW_TOPIC_ID,
              userMessageId: TEST_IDS.USER_MESSAGE_ID,
            });
        });
        const executeGatewayAgentSpy = vi.fn().mockReturnValue(gatewayPromise);

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: 'Bind me to the project',
          });
        });

        await waitFor(() => expect(executeGatewayAgentSpy).toHaveBeenCalled());

        // `workingDirectory` is the EFFECTIVE path (the checked-out worktree the
        // run executes in); the config keeps the SOURCE repo, which is what
        // By-Project groups on.
        const expectedMetadata = {
          executionConfig: {
            boundDeviceId: deviceId,
            executionTarget: 'local',
            inheritWorkspaceScope: true,
          },
          workingDirectory: worktreePath,
          workingDirectoryConfig: {
            git: { activeWorktree: worktreePath },
            path: sourcePath,
            repoType: 'github',
          },
        };
        expect(useChatStore.getState().topicDataMap[topicKey]?.items[0]).toEqual(
          expect.objectContaining({ metadata: expectedMetadata }),
        );
        // Rides along to the server, which owns the real topic row.
        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            optimisticTopic: expect.objectContaining({ metadata: expectedMetadata }),
          }),
        );

        await act(async () => {
          resolveGateway();
          await sendPromise;
        });
      });

      it('should fall back to the bound device default cwd when the agent has no pick', async () => {
        mockConstEnv.isDesktop = true;
        const deviceId = 'device-1';
        setupMockSelectors({
          agentConfig: {
            agencyConfig: { boundDeviceId: deviceId, executionTarget: 'device' },
          },
        });
        act(() => {
          useDeviceStore.setState({
            devices: [{ defaultCwd: '/repo/default', deviceId, name: 'Mac' }] as any,
          });
        });

        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'gateway-op-default-cwd',
          topicId: TEST_IDS.NEW_TOPIC_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: 'Use the device default',
          });
        });

        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            optimisticTopic: expect.objectContaining({
              metadata: {
                executionConfig: {
                  boundDeviceId: deviceId,
                  executionTarget: 'device',
                  inheritWorkspaceScope: true,
                },
                workingDirectory: '/repo/default',
                workingDirectoryConfig: { path: '/repo/default' },
              },
            }),
          }),
        );
      });

      // The hetero runtime persists the topic itself (`sendMessageInServer`),
      // so nothing downstream would ever write the cwd back — the metadata has
      // to ride on the create call.
      it('should bind a heterogeneous new topic to the resolved working directory', async () => {
        mockConstEnv.isDesktop = true;
        const deviceId = 'device-1';
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              boundDeviceId: deviceId,
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
              workingDirByDevice: { [deviceId]: { path: '/repo/orvilo' } },
            },
          },
        });

        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            messages: [
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topicId: TEST_IDS.NEW_TOPIC_ID,
            topics: [],
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);

        const { result } = renderHook(() => useChatStore());
        act(() => {
          useChatStore.setState({ isGatewayModeEnabled: () => false });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: { agentId: TEST_IDS.SESSION_ID, threadId: null, topicId: null },
            message: 'Bind me too',
          });
        });

        expect(sendMessageInServerSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            newTopic: expect.objectContaining({
              metadata: {
                executionConfig: {
                  boundDeviceId: deviceId,
                  executionTarget: 'local',
                  inheritWorkspaceScope: true,
                },
                workingDirectory: '/repo/orvilo',
                workingDirectoryConfig: { path: '/repo/orvilo' },
              },
            }),
          }),
          expect.any(AbortController),
        );
      });

      it('should leave a plain-chat agent topic unbound', async () => {
        mockConstEnv.isDesktop = true;
        const deviceId = 'device-1';
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              boundDeviceId: deviceId,
              executionTarget: 'local',
              workingDirByDevice: { [deviceId]: { path: '/repo/orvilo' } },
            },
            // No execution environment at all — a directory would be noise, and
            // By Project would file plain chats under a project they never used.
            chatConfig: { ...createMockAgentConfig().chatConfig, enableAgentMode: false },
          },
        });

        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'gateway-op-chat',
          topicId: TEST_IDS.NEW_TOPIC_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: 'Just chatting',
          });
        });

        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            optimisticTopic: expect.objectContaining({
              metadata: {
                executionConfig: {
                  boundDeviceId: deviceId,
                  executionTarget: 'local',
                  inheritWorkspaceScope: true,
                },
              },
            }),
          }),
        );
      });

      // The device `defaultCwd` level was added to the SEND path by the same
      // change that started binding native topics, and it sits BETWEEN the
      // legacy per-agent slot and the desktop/home fallback. A local
      // heterogeneous CLI keys its sessions off the cwd
      // (`~/.claude/projects/<encoded-cwd>/`), so reordering these levels moves
      // an agent's whole session bucket and silently drops `--resume` — pin the
      // order for the hetero path, which the native-agent cases above don't
      // exercise (they never reach the desktop/home fallback at all).
      describe('heterogeneous cwd precedence', () => {
        const HETERO_DEVICE_ID = 'device-1';
        const DESKTOP_PATH = '/Users/me/Desktop';

        const setupHeteroRun = (agencyConfig: Record<string, any> = {}) => {
          mockConstEnv.isDesktop = true;
          setupMockSelectors({
            agentConfig: {
              agencyConfig: {
                boundDeviceId: HETERO_DEVICE_ID,
                executionTarget: 'local',
                heterogeneousProvider: { command: 'codex', type: 'codex' },
                ...agencyConfig,
              },
            },
          });
          executeHeterogeneousAgentMock.mockResolvedValue(undefined);

          return vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            messages: [
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topicId: TEST_IDS.NEW_TOPIC_ID,
            topics: [],
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);
        };

        const sendHeteroMessage = async () => {
          const { result } = renderHook(() => useChatStore());
          await act(async () => {
            await result.current.sendMessage({
              context: createTestContext(),
              message: TEST_CONTENT.USER_MESSAGE,
            });
          });
        };

        beforeEach(() => {
          // The desktop/home fallback is always available for a hetero CLI, so
          // every case below has something to lose to.
          window.__ORVILO_GLOBAL_AGENT_CONTEXT__ = { desktopPath: DESKTOP_PATH };
        });

        it('snapshots the heterogeneous effort into the first-send topic', async () => {
          const sendSpy = setupHeteroRun({
            heterogeneousProvider: { command: 'codex', effort: 'high', type: 'codex' },
          });
          await sendHeteroMessage();
          expect(sendSpy.mock.calls[0][0].newTopic?.metadata).toMatchObject({
            heteroEffort: 'high',
          });
        });

        it('prefers the bound device defaultCwd over the desktop fallback', async () => {
          const sendMessageInServerSpy = setupHeteroRun();
          act(() => {
            useDeviceStore.setState({
              devices: [
                { defaultCwd: '/repo/device-default', deviceId: HETERO_DEVICE_ID, name: 'Mac' },
              ] as any,
            });
          });

          await sendHeteroMessage();

          // The CLI actually spawns here — a regression sends it to ~/Desktop
          // and the `--resume` session bucket moves with it.
          expect(executeHeterogeneousAgentMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
              workingDirectory: '/repo/device-default',
              workingDirectoryConfig: { path: '/repo/device-default' },
            }),
          );
          // …and the topic is born pinned to the same directory.
          expect(sendMessageInServerSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              newTopic: expect.objectContaining({
                metadata: {
                  executionConfig: {
                    boundDeviceId: HETERO_DEVICE_ID,
                    executionTarget: 'local',
                    inheritWorkspaceScope: true,
                  },
                  workingDirectory: '/repo/device-default',
                  workingDirectoryConfig: { path: '/repo/device-default' },
                },
              }),
            }),
            expect.any(AbortController),
          );
        });

        it('keeps the agent per-device pick above the device defaultCwd', async () => {
          setupHeteroRun({
            workingDirByDevice: { [HETERO_DEVICE_ID]: { path: '/repo/agent-pick' } },
          });
          act(() => {
            useDeviceStore.setState({
              devices: [
                { defaultCwd: '/repo/device-default', deviceId: HETERO_DEVICE_ID, name: 'Mac' },
              ] as any,
            });
          });

          await sendHeteroMessage();

          expect(executeHeterogeneousAgentMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ workingDirectory: '/repo/agent-pick' }),
          );
        });

        it('still falls back to the desktop path when neither the agent nor the device has one', async () => {
          setupHeteroRun();

          await sendHeteroMessage();

          // Inserting the defaultCwd level must not swallow the last resort: a
          // hetero CLI always spawns somewhere, so an unconfigured agent still
          // needs a directory (unlike a native one, which stays unbound).
          expect(executeHeterogeneousAgentMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ workingDirectory: DESKTOP_PATH }),
          );
        });
      });

      it('should rollback an optimistic topic if the create response resolves without a topic id', async () => {
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });

        // Gateway resolve with no topicId — the server never confirmed a topic,
        // so the optimistic row must roll back (see the `result.topicId` falsy
        // branch in the gateway transport tail).
        const executeGatewayAgentSpy = vi.fn(async (params: any) => {
          useChatStore.getState().completeOperation(params.parentOperationId);
          return makeGatewayResult({
            operationId: 'gateway-op-rollback',
            topicId: undefined,
          });
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: TEST_CONTENT.USER_MESSAGE,
          });
        });

        expect(useChatStore.getState().topicDataMap[topicKey]?.items ?? []).toEqual([]);
        expect(operationSelectors.visiblyRunningTopicIds(useChatStore.getState()).size).toBe(0);
      });

      it('should show a group optimistic topic in the group topic bucket', async () => {
        const { result } = renderHook(() => useChatStore());
        const groupId = 'group-1';
        const supervisorAgentId = 'supervisor-agent';
        const groupKey = topicMapKey({ groupId });
        const groupAgentKey = topicMapKey({ agentId: supervisorAgentId, groupId });
        let resolveGateway!: () => void;

        // A group supervisor turn requires the gateway runtime — the optimistic
        // row is handed to executeGatewayAgent, which resolves it to the real id.
        const executeGatewayAgentSpy = vi.fn(
          (params: any) =>
            new Promise<any>((resolve) => {
              resolveGateway = () => {
                useChatStore.getState().internal_replaceTopicId({
                  groupId,
                  nextId: TEST_IDS.NEW_TOPIC_ID,
                  previousId: params.optimisticTopic.id,
                  value: { title: params.optimisticTopic.title },
                });
                useChatStore.getState().completeOperation(params.parentOperationId);
                resolve(
                  makeGatewayResult({
                    operationId: 'gateway-op-group',
                    topicId: TEST_IDS.NEW_TOPIC_ID,
                  }),
                );
              };
            }),
        );

        vi.spyOn(agentGroupStore, 'getChatGroupStoreState').mockReturnValue({
          groupMap: {
            [groupId]: {
              id: groupId,
              supervisorAgentId,
            },
          },
        } as any);

        act(() => {
          useChatStore.setState({
            activeAgentId: undefined,
            activeGroupId: groupId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
            topicDataMap: {
              [groupKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: {
              agentId: supervisorAgentId,
              groupId,
              scope: 'group',
              threadId: null,
              topicId: null,
            },
            message: 'Group first message',
          });
        });

        await waitFor(() =>
          expect(useChatStore.getState().topicDataMap[groupKey]?.items[0]?.id).toMatch(/^tpc_/),
        );

        const optimisticTopic = useChatStore.getState().topicDataMap[groupKey]?.items[0];
        expect(optimisticTopic).toEqual(
          expect.objectContaining({
            title: 'Group first message',
          }),
        );
        expect(useChatStore.getState().topicDataMap[groupAgentKey]?.items ?? []).toEqual([]);

        await act(async () => {
          resolveGateway();
          await sendPromise;
        });

        // The gateway contract resolves the optimistic row to the server id in
        // place — the sidebar row keeps the optimistic title until the real
        // refreshTopic lands.
        expect(useChatStore.getState().topicDataMap[groupKey]?.items).toEqual([
          expect.objectContaining({ id: TEST_IDS.NEW_TOPIC_ID, title: 'Group first message' }),
        ]);
        expect(useChatStore.getState().topicDataMap[groupAgentKey]?.items ?? []).toEqual([]);
      });

      it('should clear the active temp topic when rolling back an optimistic topic', async () => {
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });
        let resolveGateway!: () => void;

        // Gateway resolve with no topicId — same rollback contract as the
        // previous test, but here the optimistic topic is also the ACTIVE one.
        const executeGatewayAgentSpy = vi.fn(
          (params: any) =>
            new Promise<any>((resolve) => {
              resolveGateway = () => {
                useChatStore.getState().completeOperation(params.parentOperationId);
                resolve(
                  makeGatewayResult({
                    operationId: 'gateway-op-rollback-active',
                    topicId: undefined,
                  }),
                );
              };
            }),
        );

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: TEST_CONTENT.USER_MESSAGE,
          });
        });

        await waitFor(() =>
          expect(useChatStore.getState().topicDataMap[topicKey]?.items[0]?.id).toMatch(/^tpc_/),
        );
        const optimisticTopicId = useChatStore.getState().topicDataMap[topicKey]!.items[0].id;

        act(() => {
          useChatStore.setState({ activeTopicId: optimisticTopicId });
        });

        await act(async () => {
          resolveGateway();
          await sendPromise;
        });

        expect(useChatStore.getState().topicDataMap[topicKey]?.items ?? []).toEqual([]);
        expect(useChatStore.getState().activeTopicId).not.toBe(optimisticTopicId);
      });

      it('should restore optimistic topic selections after switching away before rollback', async () => {
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicKey = topicMapKey({ agentId });
        const newContextKey = messageMapKey({ agentId, topicId: null });
        const otherTopicId = 'other-topic';
        let resolveGateway!: () => void;

        // Gateway resolve with no topicId drives the rollback — selections must
        // return to the `_new` composer bucket even after the user switched away.
        const executeGatewayAgentSpy = vi.fn(
          (params: any) =>
            new Promise<any>((resolve) => {
              resolveGateway = () => {
                useChatStore.getState().completeOperation(params.parentOperationId);
                resolve(
                  makeGatewayResult({
                    operationId: 'gateway-op-rollback-selections',
                    topicId: undefined,
                  }),
                );
              };
            }),
        );

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                isExpandingPageSize: false,
                isLoadingMore: false,
                items: [],
                pageSize: 20,
                total: 0,
              },
            },
          });
        });

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: TEST_CONTENT.USER_MESSAGE,
          });
        });

        await waitFor(() =>
          expect(useChatStore.getState().topicDataMap[topicKey]?.items[0]?.id).toMatch(/^tpc_/),
        );
        const optimisticTopicId = useChatStore.getState().topicDataMap[topicKey]!.items[0].id;
        const optimisticContextKey = messageMapKey({ agentId, topicId: optimisticTopicId });
        const pendingSelection = {
          content: 'context added before the failed send',
          id: 'rollback-selection',
          type: 'text' as const,
        };

        act(() => {
          useFileStore.getState().addChatContextSelection({
            contextKey: optimisticContextKey,
            selection: pendingSelection,
          });
          useChatStore.setState({ activeTopicId: otherTopicId });
        });

        await act(async () => {
          resolveGateway();
          await sendPromise;
        });

        expect(useChatStore.getState().activeTopicId).toBe(otherTopicId);
        expect(useChatStore.getState().topicDataMap[topicKey]?.items ?? []).toEqual([]);
        expect(
          fileChatSelectors.chatContextSelections(newContextKey)(useFileStore.getState()),
        ).toEqual([pendingSelection]);
        expect(
          fileChatSelectors.chatContextSelections(optimisticContextKey)(useFileStore.getState()),
        ).toEqual([]);
      });

      it('should persist selected tool tags into user message content before runtime execution', async () => {
        // The tool-context suffix is appended by the REST-persist tail, which
        // after the client-runtime retirement only runs for a gateway-bound
        // direct @Agent mention — so this test sends one.
        const { result } = renderHook(() => useChatStore());
        act(() => {
          useChatStore.setState({ isGatewayModeEnabled: () => true });
        });

        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            messages: [
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topicId: TEST_IDS.TOPIC_ID,
            topics: undefined,
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);
        vi.spyOn(aiAgentService, 'execSubAgentTask').mockResolvedValue({
          assistantMessageId: 'sub-assistant',
          operationId: 'sub-op',
          success: true,
          threadId: 'thread-sub',
        } as any);
        vi.spyOn(aiAgentService, 'getSubAgentTaskStatus').mockResolvedValue({
          result: 'sub agent done',
          status: 'completed',
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            context: { ...createTestContext(), topicId: TEST_IDS.TOPIC_ID },
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'Agent A',
                        metadata: { id: 'agent-a', type: 'agent' },
                        type: 'mention',
                      },
                      {
                        actionCategory: 'tool',
                        actionLabel: 'Notebook',
                        actionType: 'orvilo-notebook',
                        type: 'action-tag',
                      },
                      {
                        actionCategory: 'tool',
                        actionLabel: 'Artifacts',
                        actionType: 'orvilo-artifacts',
                        type: 'action-tag',
                      },
                      { text: ' ' + TEST_CONTENT.USER_MESSAGE, type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            message: '@Agent A ' + TEST_CONTENT.USER_MESSAGE,
          });
        });

        const requestPayload = sendMessageInServerSpy.mock.calls[0]?.[0];

        expect(requestPayload?.newUserMessage.content).toContain(TEST_CONTENT.USER_MESSAGE);
        expect(requestPayload?.newUserMessage.content).toContain('<selected_tool_context>');
        expect(requestPayload?.newUserMessage.content).toContain('identifier="orvilo-notebook"');
        expect(requestPayload?.newUserMessage.content).toContain('name="Notebook"');
        expect(requestPayload?.newUserMessage.content).toContain('identifier="orvilo-artifacts"');
        expect(requestPayload?.newUserMessage.content).toContain('name="Artifacts"');
        // The direct mention executes through the server-backed sub-agent task
        // transport — the hetero executor is not involved.
        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
        expect(aiAgentService.execSubAgentTask).toHaveBeenCalled();
      });

      it('should merge partial persisted messages into existing topic history', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicId = TEST_IDS.TOPIC_ID;
        const context = { agentId, threadId: null, topicId };
        const key = messageMapKey(context);
        const existingMessages = [
          createMockMessage({ id: 'existing-user', role: 'user', topicId }),
          createMockMessage({ id: 'existing-assistant', role: 'assistant', topicId }),
        ];
        const persistedUserMessage = createMockMessage({
          id: TEST_IDS.USER_MESSAGE_ID,
          role: 'user',
          topicId,
        });
        const persistedAssistantMessage = createMockMessage({
          id: TEST_IDS.ASSISTANT_MESSAGE_ID,
          parentId: TEST_IDS.USER_MESSAGE_ID,
          role: 'assistant',
          topicId,
        });

        act(() => {
          useChatStore.setState({
            dbMessagesMap: { [key]: existingMessages },
            messagesMap: { [key]: existingMessages },
          });
        });

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          __isPartialMessages: true,
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          isCreateNewTopic: false,
          messages: [persistedUserMessage, persistedAssistantMessage],
          topicId,
          topics: undefined,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            context,
            message: TEST_CONTENT.USER_MESSAGE,
          });
        });

        expect(result.current.messagesMap[key].map((message) => message.id)).toEqual([
          'existing-user',
          'existing-assistant',
          TEST_IDS.USER_MESSAGE_ID,
          TEST_IDS.ASSISTANT_MESSAGE_ID,
        ]);
        expect(
          result.current.messagesMap[key].some((message) => message.id.startsWith('tmp_')),
        ).toBe(false);
      });

      it('should keep another active local-only voice row in history after a partial merge', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const topicId = TEST_IDS.TOPIC_ID;
        const context = { agentId, threadId: null, topicId };
        const key = messageMapKey(context);
        const localVoiceMessage = createMockMessage({
          audioList: [{ alt: 'voice.webm', id: 'tmp-audio', url: 'blob:voice-preview' }],
          content: '',
          id: 'tmp-other-voice-message',
          metadata: { scope: LOCAL_MESSAGE_SCOPE },
          role: 'user',
          topicId,
        });
        const existingMessages = [
          createMockMessage({ id: 'existing-user', role: 'user', topicId }),
          createMockMessage({ id: 'existing-assistant', role: 'assistant', topicId }),
          localVoiceMessage,
        ];
        const persistedUserMessage = createMockMessage({
          id: TEST_IDS.USER_MESSAGE_ID,
          role: 'user',
          topicId,
        });
        const persistedAssistantMessage = createMockMessage({
          id: TEST_IDS.ASSISTANT_MESSAGE_ID,
          parentId: TEST_IDS.USER_MESSAGE_ID,
          role: 'assistant',
          topicId,
        });
        act(() => {
          useChatStore.setState({
            dbMessagesMap: { [key]: existingMessages },
            messagesMap: { [key]: existingMessages },
            voiceMessageUploadMap: {
              [localVoiceMessage.id]: { progress: 50, status: 'uploading' },
            },
          });
        });

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          __isPartialMessages: true,
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          isCreateNewTopic: false,
          messages: [persistedUserMessage, persistedAssistantMessage],
          topicId,
          topics: undefined,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            context,
            message: TEST_CONTENT.USER_MESSAGE,
          });
        });

        // The local-only voice row stays in the visible history; the hetero
        // runtime reads history itself and never receives a `messages` array
        // (the retired client executor did — that path is gone).
        expect(result.current.messagesMap[key].map((message) => message.id)).toContain(
          localVoiceMessage.id,
        );
        expect(executeHeterogeneousAgentMock).toHaveBeenCalledOnce();
        expect(executeHeterogeneousAgentMock.mock.calls[0][1].message).toBe(
          TEST_CONTENT.USER_MESSAGE,
        );
      });

      it('should preserve editorData when enqueueing a queued message', async () => {
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);
        const onMessageAccepted = vi.fn();
        const onMessagePersisted = vi.fn();
        const editorData = {
          root: {
            children: [
              {
                children: [
                  {
                    actionCategory: 'tool',
                    actionLabel: 'Notebook',
                    actionType: 'orvilo-notebook',
                    type: 'action-tag',
                  },
                  { text: ' queued message', type: 'text' },
                ],
                type: 'paragraph',
              },
            ],
            type: 'root',
          },
        };

        act(() => {
          useChatStore.setState({
            operations: {
              'op-running': {
                childOperationIds: [],
                context,
                id: 'op-running',
                metadata: {},
                status: 'running',
                type: 'execAgentRuntime',
              },
            } as any,
            operationsByContext: {
              [contextKey]: ['op-running'],
            },
          });
        });

        const enqueueMessageSpy = vi.spyOn(result.current, 'enqueueMessage');

        await act(async () => {
          await result.current.sendMessage({
            context,
            editorData: editorData as any,
            message: 'queued message',
            onMessageAccepted,
            onMessagePersisted,
          });
        });

        expect(enqueueMessageSpy).toHaveBeenCalledWith(
          contextKey,
          expect.objectContaining({
            content: 'queued message',
            editorData,
          }),
          'op-running',
        );
        expect(onMessageAccepted).toHaveBeenCalledOnce();
        expect(onMessagePersisted).not.toHaveBeenCalled();
      });

      it('should enqueue a later text turn behind an optimistic voice upload', async () => {
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);

        act(() => {
          useChatStore.setState({
            operations: {
              'op-voice-upload': {
                childOperationIds: [],
                context: { ...context, messageId: 'tmp_voice' },
                id: 'op-voice-upload',
                metadata: { startTime: Date.now() },
                status: 'running',
                type: 'uploadVoiceMessage',
              },
            } as any,
            operationsByContext: {
              [contextKey]: ['op-voice-upload'],
            },
          });
        });

        const enqueueMessageSpy = vi.spyOn(result.current, 'enqueueMessage');

        await act(async () => {
          await result.current.sendMessage({
            context,
            message: 'text after voice',
          });
        });

        expect(enqueueMessageSpy).toHaveBeenCalledWith(
          contextKey,
          expect.objectContaining({ content: 'text after voice' }),
          'op-voice-upload',
        );
      });

      it('should enqueue when an execHeterogeneousAgent op is running (CC queue mode)', async () => {
        // With Plan A, sends during a running CC turn must hit the
        // same queue path used by client mode — without this we'd spawn a
        // second `claude` process in parallel.
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);

        act(() => {
          useChatStore.setState({
            operations: {
              'op-cc-running': {
                childOperationIds: [],
                context,
                id: 'op-cc-running',
                metadata: {},
                status: 'running',
                type: 'execHeterogeneousAgent',
              },
            } as any,
            operationsByContext: {
              [contextKey]: ['op-cc-running'],
            },
          });
        });

        const enqueueMessageSpy = vi.spyOn(result.current, 'enqueueMessage');

        await act(async () => {
          await result.current.sendMessage({
            context,
            message: 'follow-up during CC run',
          });
        });

        expect(enqueueMessageSpy).toHaveBeenCalledWith(
          contextKey,
          expect.objectContaining({
            content: 'follow-up during CC run',
            interruptMode: 'soft',
          }),
          'op-cc-running',
        );
      });

      it('should NOT enqueue once the run finished its visible output', async () => {
        // Regression: the enqueue check only asked `status === 'running'`, while the
        // composer flips back to Send on `visibleLoadingDone`. The answer is complete
        // on screen and the button says Send, so the next message must start a fresh
        // turn — not park in a tray the user has no reason to expect, and one that
        // never empties at all when `agent_runtime_end` is lost over a still-open WS
        // (neither the run lifecycle nor onSessionComplete's fallback fires, and the
        // queue drains on success only).
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          isCreateNewTopic: true,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.NEW_TOPIC_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        act(() => {
          useChatStore.setState({
            operations: {
              'op-visible-done': {
                childOperationIds: [],
                context,
                id: 'op-visible-done',
                metadata: { visibleLoadingDone: true },
                status: 'running',
                type: 'execServerAgentRuntime',
              },
            } as any,
            operationsByContext: {
              [contextKey]: ['op-visible-done'],
            },
          });
        });

        const enqueueMessageSpy = vi.spyOn(result.current, 'enqueueMessage');

        await act(async () => {
          await result.current.sendMessage({
            context,
            message: 'follow-up after the run visibly ended',
          });
        });

        expect(enqueueMessageSpy).not.toHaveBeenCalled();
      });

      it('should NOT enqueue behind an aborting op (Stop already pressed)', async () => {
        // Stop flips the composer back to Send immediately via `isAborting`. The
        // queue drains on success only, so queueing behind an aborting run would
        // strand the message with no run left to send it.
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          isCreateNewTopic: true,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.NEW_TOPIC_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        act(() => {
          useChatStore.setState({
            operations: {
              'op-aborting': {
                childOperationIds: [],
                context,
                id: 'op-aborting',
                metadata: { isAborting: true },
                status: 'running',
                type: 'execServerAgentRuntime',
              },
            } as any,
            operationsByContext: {
              [contextKey]: ['op-aborting'],
            },
          });
        });

        const enqueueMessageSpy = vi.spyOn(result.current, 'enqueueMessage');

        await act(async () => {
          await result.current.sendMessage({ context, message: 'send after stop' });
        });

        expect(enqueueMessageSpy).not.toHaveBeenCalled();
      });

      it('should restart the existing queue in FIFO order when Stop already cancelled its owner', async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);

        act(() => {
          useChatStore.setState({
            operations: {
              'op-cancelled': {
                childOperationIds: [],
                context,
                id: 'op-cancelled',
                metadata: { isAborting: true },
                status: 'cancelled',
                type: 'execServerAgentRuntime',
              },
            } as any,
            operationsByContext: { [contextKey]: ['op-cancelled'] },
            queuedMessages: {
              [contextKey]: [
                {
                  content: 'queued A',
                  createdAt: Date.now(),
                  id: 'queued-1',
                  interruptMode: 'soft',
                },
              ],
            },
          });
        });

        const sendMessageSpy = vi.spyOn(result.current, 'sendMessage');

        await act(async () => {
          await result.current.sendMessage({ context, message: 'new B' });
          await vi.runAllTimersAsync();
        });

        expect(sendMessageSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ message: expect.stringMatching(/queued A[\s\S]*new B/) }),
        );
        expect(useChatStore.getState().queuedMessages[contextKey]).toEqual([]);
        vi.useRealTimers();
      });

      it('should still enqueue past visible end when follow-ups are already queued', async () => {
        // Order beats latency: those queued items belong to the terminal drain, so a
        // newer send must join the queue instead of jumping it — otherwise the drain
        // fires a second, older turn right behind this one.
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);

        act(() => {
          useChatStore.setState({
            operations: {
              'op-finishing': {
                childOperationIds: [],
                context,
                id: 'op-finishing',
                metadata: { visibleLoadingDone: true },
                status: 'running',
                type: 'execServerAgentRuntime',
              },
            } as any,
            operationsByContext: {
              [contextKey]: ['op-finishing'],
            },
            queuedMessages: {
              [contextKey]: [
                {
                  content: 'queued before the visible end',
                  createdAt: Date.now(),
                  id: 'queued-1',
                  interruptMode: 'soft',
                },
              ],
            },
          });
        });

        const enqueueMessageSpy = vi.spyOn(result.current, 'enqueueMessage');

        await act(async () => {
          await result.current.sendMessage({ context, message: 'follow-up mid-terminal' });
        });

        expect(enqueueMessageSpy).toHaveBeenCalledWith(
          contextKey,
          expect.objectContaining({ content: 'follow-up mid-terminal' }),
          'op-finishing',
        );
      });

      it('should enqueue behind a running interim approve/retry op (preflight window)', async () => {
        // Interim ops (approve/submit/skip/regenerate) show input loading the
        // instant the user clicks, but the real runtime op is only created 2–4
        // tRPC round-trips later. A fast follow-up Enter in that window must
        // queue behind the interim op — not fire a concurrent sendMessage that
        // interleaves with the approve/retry flow. Guards QUEUE_BLOCKING staying
        // in sync with INPUT_LOADING for INTERIM_LOADING_OPERATION_TYPES.
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);

        act(() => {
          useChatStore.setState({
            operations: {
              'op-regenerate': {
                childOperationIds: [],
                context,
                id: 'op-regenerate',
                metadata: {},
                status: 'running',
                type: 'regenerate',
              },
            } as any,
            operationsByContext: {
              [contextKey]: ['op-regenerate'],
            },
          });
        });

        const enqueueMessageSpy = vi.spyOn(result.current, 'enqueueMessage');
        const sendMessageInServerSpy = vi.spyOn(aiChatService, 'sendMessageInServer');

        await act(async () => {
          await result.current.sendMessage({
            context,
            message: 'follow-up during regenerate preflight',
          });
        });

        expect(enqueueMessageSpy).toHaveBeenCalledWith(
          contextKey,
          expect.objectContaining({
            content: 'follow-up during regenerate preflight',
            interruptMode: 'soft',
          }),
          'op-regenerate',
        );
        // Must queue, not start a concurrent send.
        expect(sendMessageInServerSpy).not.toHaveBeenCalled();
      });

      it('should enqueue while the first new-topic message is still being persisted', async () => {
        const { result } = renderHook(() => useChatStore());
        const context = createTestContext();
        const contextKey = messageMapKey(context);

        act(() => {
          useChatStore.setState({
            operations: {
              'op-send-running': {
                childOperationIds: [],
                context: { ...context, messageId: 'tmp-first-user-message' },
                id: 'op-send-running',
                metadata: {},
                status: 'running',
                type: 'sendMessage',
              },
            } as any,
            operationsByContext: {
              [contextKey]: ['op-send-running'],
            },
          });
        });

        const enqueueMessageSpy = vi.spyOn(result.current, 'enqueueMessage');
        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            isCreateNewTopic: true,
            messages: [
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topicId: TEST_IDS.TOPIC_ID,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);

        await act(async () => {
          await result.current.sendMessage({
            context,
            message: 'fast follow-up before topic is created',
          });
        });

        expect(enqueueMessageSpy).toHaveBeenCalledWith(
          contextKey,
          expect.objectContaining({
            content: 'fast follow-up before topic is created',
            interruptMode: 'soft',
          }),
          'op-send-running',
        );
        expect(sendMessageInServerSpy).not.toHaveBeenCalled();
      });

      it('should move queued follow-ups from the new-topic key to the created topic key', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const newTopicKey = messageMapKey({ agentId, topicId: null });
        const queuedMessage = {
          content: 'queued while topic is being created',
          createdAt: Date.now(),
          id: 'queued-before-topic-created',
          interruptMode: 'soft' as const,
        };
        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            queuedMessages: {
              [newTopicKey]: [queuedMessage],
            },
          });
        });

        let createdTopicId: string | undefined;
        vi.spyOn(aiChatService, 'sendMessageInServer').mockImplementation(async (params: any) => {
          createdTopicId = params.newTopic?.id;
          return {
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            isCreateNewTopic: true,
            messages: [
              createMockMessage({
                id: TEST_IDS.USER_MESSAGE_ID,
                role: 'user',
                topicId: createdTopicId,
              }),
              createMockMessage({
                id: TEST_IDS.ASSISTANT_MESSAGE_ID,
                role: 'assistant',
                topicId: createdTopicId,
              }),
            ],
            topicId: createdTopicId,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any;
        });

        await act(async () => {
          await result.current.sendMessage({
            context: { agentId, threadId: null, topicId: null },
            message: TEST_CONTENT.USER_MESSAGE,
          });
        });

        expect(createdTopicId).toMatch(/^tpc_/);
        const createdTopicKey = messageMapKey({ agentId, topicId: createdTopicId });
        expect(useChatStore.getState().queuedMessages[newTopicKey] ?? []).toEqual([]);
        expect(useChatStore.getState().queuedMessages[createdTopicKey]).toEqual([queuedMessage]);
      });
    });

    describe('page scope documentId injection', () => {
      it('enables the task tool for a /goal gateway turn', async () => {
        const { result } = renderHook(() => useChatStore());
        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-goal',
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });

        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            message: '/goal ship the homepage',
          });
        });

        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({ selectedToolIds: ['orvilo-goal'] }),
        );
      });

      it('injects the active page documentId into the gateway context when scope is page', async () => {
        const { result } = renderHook(() => useChatStore());

        const getCurrentDocIdSpy = vi
          .spyOn(pageAgentRuntime, 'getCurrentDocId')
          .mockReturnValue('doc-page-1');

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-1',
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });

        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: {
              agentId: TEST_IDS.SESSION_ID,
              scope: 'page',
              threadId: null,
              topicId: null,
            },
          });
        });

        expect(getCurrentDocIdSpy).toHaveBeenCalled();
        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            context: expect.objectContaining({ documentId: 'doc-page-1', scope: 'page' }),
          }),
        );
      });

      it('does not inject documentId for non-page scope conversations', async () => {
        const { result } = renderHook(() => useChatStore());

        vi.spyOn(pageAgentRuntime, 'getCurrentDocId').mockReturnValue('doc-page-1');

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-1',
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });

        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            context: expect.not.objectContaining({ documentId: expect.anything() }),
          }),
        );
      });
    });

    describe('group chat supervisor metadata', () => {
      // After the client-runtime retirement, a group-supervisor turn only runs
      // over the gateway (selectRuntimeType throws
      // GROUP_SUPERVISOR_REQUIRES_GATEWAY otherwise), and the supervisor markers
      // ride on `operationContext` → the gateway `messageContext`/`context`
      // params plus the optimistic assistant message's metadata.
      it('should pass isSupervisor metadata when agentId matches supervisorAgentId', async () => {
        const { result } = renderHook(() => useChatStore());

        // Mock agentGroup store to return a group with specific supervisorAgentId
        vi.spyOn(agentGroupStore, 'getChatGroupStoreState').mockReturnValue({
          groupMap: {
            'test-group-id': {
              id: 'test-group-id',
              supervisorAgentId: 'supervisor-agent-id',
            },
          },
        } as any);

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-gw-sup',
          topicId: undefined,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });
        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: {
              agentId: 'supervisor-agent-id',
              groupId: 'test-group-id',
              topicId: null,
              threadId: null,
            },
          });
        });

        // Should pass isSupervisor metadata when agentId matches supervisorAgentId
        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            messageContext: expect.objectContaining({
              groupId: 'test-group-id',
              isSupervisor: true,
              orchestrationRole: 'supervisor',
            }),
          }),
        );
      });

      it('should NOT pass isSupervisor metadata when agentId is a sub-agent (not supervisor)', async () => {
        const { result } = renderHook(() => useChatStore());

        // Mock agentGroup store - sub-agent-id does NOT match supervisorAgentId
        vi.spyOn(agentGroupStore, 'getChatGroupStoreState').mockReturnValue({
          groupMap: {
            'test-group-id': {
              id: 'test-group-id',
              supervisorAgentId: 'supervisor-agent-id', // Different from sub-agent-id
            },
          },
        } as any);

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-gw-sub',
          topicId: undefined,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });
        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: {
              agentId: 'sub-agent-id',
              groupId: 'test-group-id',
              topicId: 'topic-id',
              threadId: 'thread-id',
            },
          });
        });

        // Should NOT pass isSupervisor metadata since agentId doesn't match supervisorAgentId
        const gatewayParams = executeGatewayAgentSpy.mock.calls[0]?.[0];
        expect(gatewayParams?.messageContext?.groupId).toBe('test-group-id');
        expect(gatewayParams?.messageContext?.isSupervisor).toBeUndefined();
        expect(gatewayParams?.messageContext?.orchestrationRole).toBeUndefined();
      });

      it('should pass isSupervisor metadata when isSupervisor is explicitly set in context', async () => {
        const { result } = renderHook(() => useChatStore());

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-gw-sup-explicit',
          topicId: undefined,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });
        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: {
              agentId: 'supervisor-agent-id',
              isSupervisor: true,
              topicId: null,
              threadId: null,
            },
          });
        });

        // Should pass isSupervisor metadata when explicitly set in context.
        // `orchestrationRole` is only added for a real group supervisor, so an
        // explicit non-group flag just carries `isSupervisor` through.
        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            messageContext: expect.objectContaining({ isSupervisor: true }),
          }),
        );
      });

      it('should NOT pass isSupervisor metadata for regular agent chat (no groupId)', async () => {
        const { result } = renderHook(() => useChatStore());

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-gw-regular',
          topicId: undefined,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });
        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        // Should NOT pass isSupervisor metadata for regular agent chat
        const gatewayParams = executeGatewayAgentSpy.mock.calls[0]?.[0];
        expect(gatewayParams?.messageContext?.isSupervisor).toBeUndefined();
        expect(gatewayParams?.messageContext?.orchestrationRole).toBeUndefined();
      });

      it('should not persist the requested model for heterogeneous agents before the CLI reports it', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
            model: 'claude-sonnet-4-6',
          },
        });

        const { result } = renderHook(() => useChatStore());

        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            messages: [
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topicId: TEST_IDS.TOPIC_ID,
            topics: [],
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);

        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(sendMessageInServerSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            // Exact object on purpose: `model` must still be absent. `id` is the
            // client-minted message id the server is asked to honour.
            newAssistantMessage: {
              id: expect.stringMatching(/^msg_/),
              provider: 'codex',
            },
          }),
          expect.any(AbortController),
        );
        expect(sendMessageInServerSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            newTopic: expect.objectContaining({ model: 'default', provider: 'codex' }),
          }),
          expect.any(AbortController),
        );
      });

      it('overrides the heterogeneous runtime with the active topic model', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: {
                args: ['--model', 'global-model', '--mode', 'plan'],
                model: 'global-model',
                type: 'cursor',
              },
            },
          },
        });
        const context = {
          agentId: TEST_IDS.SESSION_ID,
          threadId: null,
          topicId: TEST_IDS.TOPIC_ID,
        };
        const topicKey = topicMapKey({ agentId: TEST_IDS.SESSION_ID });
        act(() => {
          useChatStore.setState({
            activeAgentId: TEST_IDS.SESSION_ID,
            activeTopicId: TEST_IDS.TOPIC_ID,
            topicDataMap: {
              [topicKey]: {
                currentPage: 0,
                hasMore: false,
                items: [
                  {
                    createdAt: Date.now(),
                    id: TEST_IDS.TOPIC_ID,
                    model: 'topic-model',
                    provider: 'cursor',
                    title: 'Topic A',
                    updatedAt: Date.now(),
                  },
                ],
                pageSize: 20,
                total: 1,
              },
            },
          });
        });
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          topics: [],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);
        const { result } = renderHook(() => useChatStore());

        await act(async () => {
          await result.current.sendMessage({
            context,
            message: TEST_CONTENT.USER_MESSAGE,
          });
        });

        expect(executeHeterogeneousAgentMock).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            heterogeneousProvider: {
              args: ['--mode', 'plan'],
              model: 'topic-model',
              type: 'cursor',
            },
          }),
        );
      });

      it('routes a legacy bare Qoder model to the desktop heterogeneous runtime without gateway mode', async () => {
        mockConstEnv.isDesktop = true;
        // `executionTarget: 'local'` is the explicit desktop-local selection the
        // device switcher persists; the legacy provider still comes from the
        // bare `model` field because `heterogeneousProvider` is unset.
        setupMockSelectors({
          agentConfig: { agencyConfig: { executionTarget: 'local' }, model: 'qoder' },
        });

        const executeGatewayAgent = vi.fn();
        act(() => {
          useChatStore.setState({
            executeGatewayAgent,
            isGatewayModeEnabled: () => false,
          });
        });

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          topics: [],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        const { result } = renderHook(() => useChatStore());
        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(executeHeterogeneousAgentMock).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({ heterogeneousProvider: { type: 'qoder' } }),
        );
        expect(executeGatewayAgent).not.toHaveBeenCalled();
      });

      it('keeps a legacy bare Qoder model on the gateway when gateway mode is available', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({ agentConfig: { agencyConfig: undefined, model: 'qoder' } });

        const executeGatewayAgent = vi.fn().mockImplementation(async (params) => {
          useChatStore.getState().completeOperation(params.parentOperationId);
          return {
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            operationId: 'gateway-operation',
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          };
        });
        act(() => {
          useChatStore.setState({
            executeGatewayAgent,
            isGatewayModeEnabled: () => true,
          });
        });

        const { result } = renderHook(() => useChatStore());
        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(executeGatewayAgent).toHaveBeenCalledTimes(1);
        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
      });

      it('runs a workspace Codex local-device override in the desktop heterogeneous runtime', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              boundDeviceId: 'workspace-device',
              executionTarget: 'device',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });

        const { agentByIdSelectors } = await import('@/store/agent/selectors');
        vi.spyOn(agentByIdSelectors, 'getAgentById').mockReturnValue(
          () => ({ visibility: 'public', workspaceId: 'workspace-1' }) as any,
        );
        useUserStore.setState({
          workspaceUserPreference: {
            agentDeviceOverrides: {
              [TEST_IDS.SESSION_ID]: {
                boundDeviceId: 'personal-device',
                executionTarget: 'local',
              },
            },
          },
        });

        const executeGatewayAgent = vi.fn();
        act(() => {
          useChatStore.setState({ executeGatewayAgent });
        });

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          topics: [],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        const { result } = renderHook(() => useChatStore());
        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(executeHeterogeneousAgentMock).toHaveBeenCalledTimes(1);
        expect(executeGatewayAgent).not.toHaveBeenCalled();
      });

      it('keeps a workspace shared-local fallback on the gateway without a member override', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              boundDeviceId: 'workspace-device',
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });

        const { agentByIdSelectors } = await import('@/store/agent/selectors');
        vi.spyOn(agentByIdSelectors, 'getAgentById').mockReturnValue(
          () => ({ visibility: 'public', workspaceId: 'workspace-1' }) as any,
        );

        const executeGatewayAgent = vi.fn().mockResolvedValue(undefined);
        act(() => {
          useChatStore.setState({ executeGatewayAgent });
        });

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          topics: [],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        const { result } = renderHook(() => useChatStore());
        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(executeGatewayAgent).toHaveBeenCalledTimes(1);
        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
      });

      // The owner's own `local` pick lives in the per-user override even on a
      // private Workspace Agent (the shared row must never reference a
      // personal device — the server rejects it), so a `local` override must
      // keep routing the owner's run to the in-process desktop runtime.
      it("applies the owner's own local override for a private Workspace Agent", async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              boundDeviceId: 'shared-workspace-device',
              executionTarget: 'device',
              executionTargetSelectionPolicy: 'fixed',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
          agentMeta: { visibility: 'private', workspaceId: 'workspace-1' },
        });
        useUserStore.setState({
          workspaceUserPreference: {
            agentDeviceOverrides: {
              [TEST_IDS.SESSION_ID]: {
                boundDeviceId: 'owner-desktop',
                executionTarget: 'local',
              },
            },
          },
        });

        const executeGatewayAgent = vi.fn().mockResolvedValue(undefined);
        act(() => {
          useChatStore.setState({ executeGatewayAgent });
        });
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          topics: [],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        const { result } = renderHook(() => useChatStore());
        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(executeHeterogeneousAgentMock).toHaveBeenCalledTimes(1);
        expect(executeGatewayAgent).not.toHaveBeenCalled();
      });

      // A workspace admin who is not the author can store a personal `local`
      // override (the picker and server both recognize management access), and
      // runtime resolution must honor it even under a `fixed` selection
      // policy — otherwise the send silently routes to the gateway instead of
      // the admin's own desktop.
      it("applies a workspace admin's local override under a fixed selection policy", async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              boundDeviceId: 'shared-workspace-device',
              executionTarget: 'device',
              executionTargetSelectionPolicy: 'fixed',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });
        const { agentByIdSelectors } = await import('@/store/agent/selectors');
        vi.spyOn(agentByIdSelectors, 'getAgentById').mockReturnValue(
          () =>
            ({ userId: 'author-user', visibility: 'public', workspaceId: 'workspace-1' }) as any,
        );
        const { rememberAgentManagementAccess, clearAgentManagementAccessCache } =
          await import('@/helpers/agentManagementAccess');
        useUserStore.setState({
          user: { id: 'admin-user' } as any,
          workspaceUserPreference: {
            agentDeviceOverrides: {
              [TEST_IDS.SESSION_ID]: {
                boundDeviceId: 'admin-desktop',
                executionTarget: 'local',
              },
            },
          },
        });
        rememberAgentManagementAccess('admin-user', TEST_IDS.SESSION_ID, true);

        const executeGatewayAgent = vi.fn().mockResolvedValue(undefined);
        act(() => {
          useChatStore.setState({ executeGatewayAgent });
        });
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          topics: [],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        try {
          const { result } = renderHook(() => useChatStore());
          await act(async () => {
            await result.current.sendMessage({
              message: TEST_CONTENT.USER_MESSAGE,
              context: createTestContext(),
            });
          });

          expect(executeHeterogeneousAgentMock).toHaveBeenCalledTimes(1);
          expect(executeGatewayAgent).not.toHaveBeenCalled();
        } finally {
          clearAgentManagementAccessCache();
          useUserStore.setState({ user: undefined as any });
        }
      });

      // Same scenario on a COLD cache: the picker's hook never ran, so the
      // send path must resolve management access from the server itself
      // before choosing a runtime.
      it("resolves an unprimed admin's access from the server before dispatch", async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              boundDeviceId: 'shared-workspace-device',
              executionTarget: 'device',
              executionTargetSelectionPolicy: 'fixed',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });
        const { agentByIdSelectors } = await import('@/store/agent/selectors');
        vi.spyOn(agentByIdSelectors, 'getAgentById').mockReturnValue(
          () =>
            ({ userId: 'author-user', visibility: 'public', workspaceId: 'workspace-1' }) as any,
        );
        const { clearAgentManagementAccessCache } = await import('@/helpers/agentManagementAccess');
        clearAgentManagementAccessCache();
        getGeneralAccessMock.mockResolvedValue({ canManage: true });
        useUserStore.setState({
          user: { id: 'admin-user' } as any,
          workspaceUserPreference: {
            agentDeviceOverrides: {
              [TEST_IDS.SESSION_ID]: {
                boundDeviceId: 'admin-desktop',
                executionTarget: 'local',
              },
            },
          },
        });

        const executeGatewayAgent = vi.fn().mockResolvedValue(undefined);
        act(() => {
          useChatStore.setState({ executeGatewayAgent });
        });
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          topics: [],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        try {
          const { result } = renderHook(() => useChatStore());
          await act(async () => {
            await result.current.sendMessage({
              message: TEST_CONTENT.USER_MESSAGE,
              context: createTestContext(),
            });
          });

          expect(getGeneralAccessMock).toHaveBeenCalledWith('agent', TEST_IDS.SESSION_ID);
          expect(executeHeterogeneousAgentMock).toHaveBeenCalledTimes(1);
          expect(executeGatewayAgent).not.toHaveBeenCalled();
        } finally {
          clearAgentManagementAccessCache();
          getGeneralAccessMock.mockReset();
          useUserStore.setState({ user: undefined as any });
        }
      });

      it('should route new-topic heterogeneous streaming updates to the persisted topic key', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });

        const createdTopicId = 'created-topic-id';
        const { result } = renderHook(() => useChatStore());

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          isCreateNewTopic: true,
          messages: [
            createMockMessage({
              id: TEST_IDS.USER_MESSAGE_ID,
              role: 'user',
              topicId: createdTopicId,
            }),
            createMockMessage({
              id: TEST_IDS.ASSISTANT_MESSAGE_ID,
              role: 'assistant',
              topicId: createdTopicId,
            }),
          ],
          topicId: createdTopicId,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: { ...createTestContext(), isNew: true, scope: 'main' },
          });
        });

        const executorParams = executeHeterogeneousAgentMock.mock.calls[0]?.[1];
        expect(executorParams?.context).toEqual(
          expect.objectContaining({
            agentId: TEST_IDS.SESSION_ID,
            isNew: false,
            scope: 'main',
            topicId: createdTopicId,
          }),
        );

        const heteroOperation = Object.values(useChatStore.getState().operations).find(
          (operation) => operation.type === 'execHeterogeneousAgent',
        );
        expect(heteroOperation?.context).toEqual(
          expect.objectContaining({
            isNew: false,
            topicId: createdTopicId,
          }),
        );

        const persistedTopicKey = messageMapKey({
          agentId: TEST_IDS.SESSION_ID,
          scope: 'main',
          topicId: createdTopicId,
        });
        const leakedNewTopicKey = messageMapKey({
          agentId: TEST_IDS.SESSION_ID,
          isNew: true,
          scope: 'main',
          topicId: createdTopicId,
        });

        expect(useChatStore.getState().messagesMap[persistedTopicKey]).toHaveLength(2);
        expect(useChatStore.getState().messagesMap[leakedNewTopicKey] ?? []).toHaveLength(0);
      });

      it('reconciles a persisted heterogeneous message but skips CLI execution after cancellation', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });
        const { result } = renderHook(() => useChatStore());
        const controller = new AbortController();
        const onMessageAccepted = vi.fn();
        const onMessagePersisted = vi.fn();
        let resolvePersistence!: (value: any) => void;
        const persistence = new Promise<any>((resolve) => {
          resolvePersistence = resolve;
        });
        const sendMessageInServer = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockReturnValue(persistence);
        const context = {
          agentId: TEST_IDS.SESSION_ID,
          threadId: null,
          topicId: TEST_IDS.TOPIC_ID,
        };

        let sendPromise!: ReturnType<typeof result.current.sendMessage>;
        act(() => {
          sendPromise = result.current.sendMessage({
            context,
            message: TEST_CONTENT.USER_MESSAGE,
            onMessageAccepted,
            onMessagePersisted,
            signal: controller.signal,
          });
        });
        await waitFor(() => expect(sendMessageInServer).toHaveBeenCalledOnce());

        act(() => controller.abort(new DOMException('cancelled', 'AbortError')));
        await act(async () => {
          resolvePersistence({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            messages: [
              createMockMessage({
                id: TEST_IDS.USER_MESSAGE_ID,
                role: 'user',
                topicId: TEST_IDS.TOPIC_ID,
              }),
              createMockMessage({
                id: TEST_IDS.ASSISTANT_MESSAGE_ID,
                role: 'assistant',
                topicId: TEST_IDS.TOPIC_ID,
              }),
            ],
            topicId: TEST_IDS.TOPIC_ID,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          });
          await sendPromise;
        });

        expect(onMessageAccepted).toHaveBeenCalledOnce();
        expect(onMessagePersisted).toHaveBeenCalledOnce();
        expect(executeHeterogeneousAgentMock).not.toHaveBeenCalled();
        expect(result.current.messagesMap[messageMapKey(context)]).toHaveLength(2);
      });

      it('should preserve the isNew marker for heterogeneous new-thread contexts', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });

        const { result } = renderHook(() => useChatStore());

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: {
              ...createTestContext(),
              isNew: true,
              scope: 'thread',
              sourceMessageId: 'source-message-id',
              threadType: 'continuation',
              topicId: TEST_IDS.TOPIC_ID,
            },
          });
        });

        const executorParams = executeHeterogeneousAgentMock.mock.calls[0]?.[1];
        expect(executorParams?.context).toEqual(
          expect.objectContaining({
            isNew: true,
            scope: 'thread',
            topicId: TEST_IDS.TOPIC_ID,
          }),
        );
      });

      it('should clear isNew on the runtime operation after a new thread is persisted', async () => {
        const { result } = renderHook(() => useChatStore());
        const topicId = 'topic-existing';
        const createdThreadId = 'thread-created';
        const draftContext = {
          agentId: TEST_IDS.SESSION_ID,
          isNew: true,
          scope: 'thread' as const,
          sourceMessageId: 'source-message',
          threadId: null,
          threadType: 'continuation' as const,
          topicId,
        };

        // Gateway execution creates the `execServerAgentRuntime` child op
        // internally — mimic its phase-1 contract: the child op runs under the
        // persisted thread (isNew cleared), then the parent send op completes.
        const executeGatewayAgentSpy = vi.fn(async (params: any) => {
          const resolvedContext = {
            ...params.context,
            isNew: false,
            threadId: createdThreadId,
          };
          useChatStore.getState().startOperation({
            context: resolvedContext,
            parentOperationId: params.parentOperationId,
            type: 'execServerAgentRuntime',
          });
          useChatStore.getState().completeOperation(params.parentOperationId);
          return makeGatewayResult({
            createdThreadId,
            operationId: 'gateway-op-thread',
            topicId,
          });
        });
        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            context: draftContext,
            message: 'create thread and keep streaming',
          });
        });

        const runtimeOperation = Object.values(result.current.operations).find(
          (operation) => operation.type === 'execServerAgentRuntime',
        );
        expect(runtimeOperation?.context).toEqual(
          expect.objectContaining({
            agentId: TEST_IDS.SESSION_ID,
            isNew: false,
            scope: 'thread',
            threadId: createdThreadId,
            topicId,
          }),
        );

        act(() => {
          const cancelled = result.current.cancelOperations({
            agentId: TEST_IDS.SESSION_ID,
            isNew: false,
            scope: 'thread',
            status: 'running',
            threadId: createdThreadId,
            topicId,
            type: 'execServerAgentRuntime',
          });
          expect(cancelled).toEqual([runtimeOperation!.id]);
        });
        expect(result.current.operations[runtimeOperation!.id].status).toBe('cancelled');
      });

      it('should recover heterogeneous context selections from the persisted user message metadata', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });

        const persistedContextSelections = [
          {
            content: 'const selected = true;',
            filePath: 'src/example.ts',
            id: 'code-selection',
            lineRange: { endLine: 12, startLine: 10 },
            source: 'code' as const,
          },
        ];
        const { result } = renderHook(() => useChatStore());
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [
            createMockMessage({
              id: TEST_IDS.USER_MESSAGE_ID,
              metadata: { contextSelections: persistedContextSelections },
              role: 'user',
            }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topicId: TEST_IDS.TOPIC_ID,
          topics: [],
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: createTestContext(),
          });
        });

        expect(executeHeterogeneousAgentMock).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            contextSelections: persistedContextSelections,
          }),
        );
      });

      it('should materialize local file mention editor data into persisted tool-result snapshots', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });
        mockLocalFileService.readLocalFile.mockResolvedValue({
          charCount: 17,
          content: 'export const x = 1;',
          fileType: 'text',
          filename: 'foo.ts',
          loc: [0, 200],
          totalCharCount: 17,
          totalLineCount: 1,
        });

        const { result } = renderHook(() => useChatStore());
        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            messages: [
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topicId: TEST_IDS.TOPIC_ID,
            topics: [],
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);

        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'foo.ts',
                        metadata: {
                          name: 'foo.ts',
                          path: '/Users/me/project/foo.ts',
                          type: 'localFile',
                        },
                        type: 'mention',
                      },
                      { text: ' 这个文件是什么', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            },
            message: '<localFile name="foo.ts" path="/Users/me/project/foo.ts" /> 这个文件是什么',
          });
        });

        expect(mockLocalFileService.readLocalFile).toHaveBeenCalledWith({
          path: '/Users/me/project/foo.ts',
        });
        const payload = sendMessageInServerSpy.mock.calls[0]?.[0];
        expect(payload?.newUserMessage.metadata?.localSystemToolSnapshots).toMatchObject([
          {
            apiName: 'readFile',
            arguments: { path: '/Users/me/project/foo.ts' },
            content: expect.stringContaining('export const x = 1;'),
            identifier: 'orvilo-local-system',
            success: true,
          },
        ]);
      });

      it('should preserve local file snapshots for runtime when server response omits metadata', async () => {
        // The hetero runtime reads history from the persisted record, so the
        // snapshots ride on `newUserMessage.metadata` in the persist call —
        // even when the server's echoed `messages` omit them.
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
            plugins: ['orvilo-local-system'],
          },
        });
        mockLocalFileService.readLocalFile.mockResolvedValue({
          charCount: 17,
          content: 'export const x = 1;',
          fileType: 'text',
          filename: 'foo.ts',
          loc: [0, 200],
          totalCharCount: 17,
          totalLineCount: 1,
        });

        const { result } = renderHook(() => useChatStore());
        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            isCreateNewTopic: true,
            messages: [
              // The server's echo deliberately omits the snapshot metadata.
              createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
              createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
            ],
            topicId: TEST_IDS.TOPIC_ID,
            topics: { items: [], total: 0 },
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        await act(async () => {
          await result.current.sendMessage({
            context: createTestContext(),
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'foo.ts',
                        metadata: {
                          name: 'foo.ts',
                          path: '/Users/me/project/foo.ts',
                          type: 'localFile',
                        },
                        type: 'mention',
                      },
                      { text: ' 这个文件是什么', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            },
            message: '<localFile name="foo.ts" path="/Users/me/project/foo.ts" /> 这个文件是什么',
          });
        });

        const payload = sendMessageInServerSpy.mock.calls[0]?.[0];
        expect(payload?.newUserMessage.metadata?.localSystemToolSnapshots).toMatchObject([
          {
            apiName: 'readFile',
            arguments: { path: '/Users/me/project/foo.ts' },
            content: expect.stringContaining('export const x = 1;'),
            identifier: 'orvilo-local-system',
            success: true,
          },
        ]);
        expect(executeHeterogeneousAgentMock).toHaveBeenCalled();
      });
    });

    describe('optimistic topic sortUpdatedAt', () => {
      // The sortUpdatedAt bump lives in the REST-persist tail, which after the
      // client-runtime retirement only runs for a gateway-bound direct @Agent
      // mention — so these sends carry one.
      it('should optimistically bump topic sortUpdatedAt when sending message to existing topic', async () => {
        setupDirectMentionTail();
        const { result } = renderHook(() => useChatStore());
        const topicId = TEST_IDS.TOPIC_ID;

        const dispatchTopicSpy = vi.spyOn(result.current, 'internal_dispatchTopic');

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user', topicId }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant', topicId }),
          ],
          topicId,
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            message: DIRECT_MENTION_TEXT + TEST_CONTENT.USER_MESSAGE,
            editorData: directMentionEditorData(),
            context: { agentId: TEST_IDS.SESSION_ID, topicId, threadId: null },
          });
        });

        // Should call internal_dispatchTopic with updateTopic to bump the sidebar sort key
        expect(dispatchTopicSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'updateTopic',
            id: topicId,
            value: { sortUpdatedAt: expect.any(Number) },
          }),
        );
      });

      it('should NOT optimistically bump topic sortUpdatedAt when server returns topics (new topic)', async () => {
        setupDirectMentionTail();
        const { result } = renderHook(() => useChatStore());

        const dispatchTopicSpy = vi.spyOn(result.current, 'internal_dispatchTopic');

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topics: { items: [{ id: 'new-topic', title: 'New Topic' }], total: 1 },
          topicId: 'new-topic',
          isCreateNewTopic: true,
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            message: DIRECT_MENTION_TEXT + TEST_CONTENT.USER_MESSAGE,
            editorData: directMentionEditorData(),
            context: createTestContext(),
          });
        });

        // Should NOT call internal_dispatchTopic with updateTopic for sortUpdatedAt
        const updateTopicCalls = dispatchTopicSpy.mock.calls.filter(
          ([payload]) => payload.type === 'updateTopic' && 'sortUpdatedAt' in (payload.value || {}),
        );
        expect(updateTopicCalls).toHaveLength(0);
      });
    });

    describe('@agent mention delegation', () => {
      it('should NOT set isSupervisor on assistant message when @agent uses supervisor path in non-group chat', async () => {
        const { result } = renderHook(() => useChatStore());

        // Non-leading mention is a supervisor-delegation turn, which only the
        // gateway runtime still supports — the mentioned agents are forwarded
        // so the server supervisor can delegate via callAgent.
        const executeGatewayAgentSpy = vi.fn(async (params: any) => {
          useChatStore.getState().completeOperation(params.parentOperationId);
          return makeGatewayResult({ operationId: 'op-gw-mention' });
        });
        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });
        const sendMessageInServerSpy = vi.spyOn(aiChatService, 'sendMessageInServer');

        await act(async () => {
          await result.current.sendMessage({
            message: 'hello @Agent A',
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      { text: 'hello ', type: 'text' },
                      {
                        label: 'Agent A',
                        metadata: { id: 'agent-a', type: 'agent' },
                        type: 'mention',
                      },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            // Non-group context: no groupId
            context: createTestContext(),
          });
        });

        // Gateway owns persistence — no REST payload carries isSupervisor.
        expect(sendMessageInServerSpy).not.toHaveBeenCalled();
        const gatewayParams = executeGatewayAgentSpy.mock.calls[0]?.[0];
        expect(gatewayParams?.metadata?.isSupervisor).toBeUndefined();

        // The runtime receives the mentioned agents for supervisor delegation
        // (the retired client runtime got them via nested `initialContext`).
        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            mentionedAgents: [{ id: 'agent-a', name: 'Agent A' }],
          }),
        );
      });

      it('should directly call a single leading @agent in non-group chat', async () => {
        const { result } = renderHook(() => useChatStore());
        const targetAgentId = 'agent-direct-target';
        const toolMessageId = 'unused-tool-call-agent-result';
        const message = '@Agent B hello';
        const createdThreadId = 'thread-direct-mention';

        const userMessage = createMockMessage({
          id: TEST_IDS.USER_MESSAGE_ID,
          role: 'user',
          content: message,
        });
        let assistantMessage = createMockMessage({
          id: TEST_IDS.ASSISTANT_MESSAGE_ID,
          role: 'assistant',
          content: '',
          tools: [],
        });

        // Gateway-bound direct mention: REST persist runs in the tail, then the
        // server-backed sub-agent task transport executes the target.
        act(() => {
          useChatStore.setState({ isGatewayModeEnabled: () => true });
        });

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [userMessage, assistantMessage],
          topicId: TEST_IDS.TOPIC_ID,
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        vi.spyOn(aiAgentService, 'execSubAgentTask').mockResolvedValue({
          assistantMessageId: 'thread-assistant',
          operationId: 'op-sub-mention',
          success: true,
          threadId: createdThreadId,
        } as any);
        vi.spyOn(aiAgentService, 'getSubAgentTaskStatus').mockResolvedValue({
          result: 'Sub agent answer',
          status: 'completed',
        } as any);

        (messageService.updateMessage as any).mockImplementation(
          async (_id: string, value: any) => {
            assistantMessage = { ...assistantMessage, ...value };
            return { messages: [userMessage, assistantMessage], success: true };
          },
        );
        (messageService.createMessage as any).mockImplementation(async (params: any) => {
          const toolMessage = createMockMessage({
            ...params,
            id: toolMessageId,
            role: 'tool',
          });

          return {
            id: toolMessageId,
            messages: [userMessage, assistantMessage, toolMessage],
          };
        });

        await act(async () => {
          await result.current.sendMessage({
            message,
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'Agent B',
                        metadata: { id: targetAgentId, type: 'agent' },
                        type: 'mention',
                      },
                      { text: ' hello', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            context: { ...createTestContext(), topicId: TEST_IDS.TOPIC_ID },
          });
        });

        expect(messageService.createMessage).not.toHaveBeenCalled();
        expect(aiChatService.sendMessageInServer).toHaveBeenCalledWith(
          expect.objectContaining({
            agentId: TEST_IDS.SESSION_ID,
            newAssistantMessage: expect.objectContaining({ agentId: targetAgentId }),
          }),
          expect.any(AbortController),
        );

        // Execution is dispatched to the server as an isolated sub-agent task
        // for the mentioned agent — no local runtime is involved.
        expect(aiAgentService.execSubAgentTask).toHaveBeenCalledWith(
          expect.objectContaining({
            agentId: targetAgentId,
            instruction: message,
            parentMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            topicId: TEST_IDS.TOPIC_ID,
          }),
        );

        const subAgentOperation = Object.values(result.current.operations).find(
          (operation) => operation.type === 'execClientSubAgent',
        );
        expect(subAgentOperation?.context).toEqual(
          expect.objectContaining({
            agentId: TEST_IDS.SESSION_ID,
            topicId: TEST_IDS.TOPIC_ID,
          }),
        );
        expect(subAgentOperation?.status).toBe('completed');
      });

      it('should isolate a direct mention executed by a local heterogeneous agent', async () => {
        mockConstEnv.isDesktop = true;
        setupMockSelectors({
          agentConfig: {
            agencyConfig: {
              executionTarget: 'local',
              heterogeneousProvider: { command: 'codex', type: 'codex' },
            },
          },
        });

        const targetAgentId = 'agent-direct-codex';
        const threadId = 'thread-direct-codex';
        const threadAssistantId = 'thread-assistant-codex';
        const message = '@Codex inspect this';
        const userMessage = createMockMessage({
          content: message,
          id: TEST_IDS.USER_MESSAGE_ID,
          role: 'user',
        });
        const sourceAssistant = createMockMessage({
          agentId: targetAgentId,
          content: '',
          id: TEST_IDS.ASSISTANT_MESSAGE_ID,
          role: 'assistant',
        });

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          messages: [userMessage, sourceAssistant],
          topicId: TEST_IDS.TOPIC_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);
        const createTaskSpy = vi.spyOn(aiAgentService, 'createClientTaskThread').mockResolvedValue({
          assistantMessageId: threadAssistantId,
          messages: [userMessage, sourceAssistant],
          startedAt: new Date().toISOString(),
          success: true,
          threadId,
          threadMessages: [
            createMockMessage({ id: 'thread-user-codex', role: 'user', threadId }),
            createMockMessage({ id: threadAssistantId, role: 'assistant', threadId }),
          ],
          userMessageId: 'thread-user-codex',
        } as any);
        const updateTaskSpy = vi
          .spyOn(aiAgentService, 'updateClientTaskThreadStatus')
          .mockResolvedValue({
            status: 'completed',
            success: true,
            threadId,
          } as any);
        executeHeterogeneousAgentMock.mockResolvedValue(undefined);

        const { result } = renderHook(() => useChatStore());
        const dispatchSpy = vi.spyOn(useChatStore.getState(), 'internal_dispatchMessage');
        await act(async () => {
          await result.current.sendMessage({
            context: { ...createTestContext(), topicId: TEST_IDS.TOPIC_ID },
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'Codex',
                        metadata: { id: targetAgentId, type: 'agent' },
                        type: 'mention',
                      },
                      { text: ' inspect this', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            message,
          });
        });

        expect(createTaskSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            agentId: targetAgentId,
            assistantMessage: { provider: 'codex' },
            parentMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            topicId: TEST_IDS.TOPIC_ID,
          }),
        );
        expect(executeHeterogeneousAgentMock).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            assistantMessageId: threadAssistantId,
            context: expect.objectContaining({
              agentId: targetAgentId,
              scope: 'sub_agent',
              subAgentId: targetAgentId,
              threadId,
            }),
          }),
        );
        expect(updateTaskSpy).toHaveBeenCalledWith(
          expect.objectContaining({ completionReason: 'done', threadId }),
        );
        expect(dispatchSpy).toHaveBeenCalledWith(
          {
            id: TEST_IDS.ASSISTANT_MESSAGE_ID,
            type: 'updateMessage',
            value: { content: TEST_CONTENT.USER_MESSAGE },
          },
          {
            context: expect.objectContaining({
              agentId: TEST_IDS.SESSION_ID,
              isNew: false,
              topicId: TEST_IDS.TOPIC_ID,
            }),
          },
        );
      });

      it('should route a single leading @agent through the gateway when gateway mode is enabled', async () => {
        const { result } = renderHook(() => useChatStore());
        const targetAgentId = 'agent-direct-target';
        const toolMessageId = 'unused-tool-call-agent-result';
        const message = '@Agent B hello';

        const userMessage = createMockMessage({
          id: TEST_IDS.USER_MESSAGE_ID,
          role: 'user',
          content: message,
        });
        let assistantMessage = createMockMessage({
          id: TEST_IDS.ASSISTANT_MESSAGE_ID,
          role: 'assistant',
          content: '',
          tools: [],
        });

        // A direct mention runs the target on the gateway, which owns persistence.
        const sendMessageInServerSpy = vi
          .spyOn(aiChatService, 'sendMessageInServer')
          .mockResolvedValue({
            messages: [userMessage, assistantMessage],
            topicId: TEST_IDS.TOPIC_ID,
            assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            userMessageId: TEST_IDS.USER_MESSAGE_ID,
          } as any);
        vi.spyOn(aiAgentService, 'execSubAgentTask').mockResolvedValue({
          assistantMessageId: 'thread-assistant',
          operationId: 'op-gw-sub',
          success: true,
          threadId: 'thread-gateway',
        });
        vi.spyOn(aiAgentService, 'getSubAgentTaskStatus').mockResolvedValue({
          result: 'Gateway result',
          status: 'completed',
          taskDetail: undefined,
        } as any);

        (messageService.updateMessage as any).mockImplementation(
          async (_id: string, value: any) => {
            assistantMessage = { ...assistantMessage, ...value };
            return { messages: [userMessage, assistantMessage], success: true };
          },
        );
        (messageService.createMessage as any).mockImplementation(async (params: any) => {
          const toolMessage = createMockMessage({ ...params, id: toolMessageId, role: 'tool' });
          return { id: toolMessageId, messages: [userMessage, assistantMessage, toolMessage] };
        });

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-gw-sub',
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });

        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message,
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'Agent B',
                        metadata: { id: targetAgentId, type: 'agent' },
                        type: 'mention',
                      },
                      { text: ' hello', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            context: { ...createTestContext(), topicId: TEST_IDS.TOPIC_ID },
          });
        });

        expect(sendMessageInServerSpy).toHaveBeenCalled();
        expect(messageService.createMessage).not.toHaveBeenCalled();
        // The TARGET agent runs through the server sub-agent task transport —
        // neither the owner-agent gateway run nor a local runtime is involved.
        expect(executeGatewayAgentSpy).not.toHaveBeenCalled();
        expect(aiAgentService.execSubAgentTask).toHaveBeenCalledWith(
          expect.objectContaining({
            agentId: targetAgentId,
            parentMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
            topicId: TEST_IDS.TOPIC_ID,
          }),
        );
      });

      it('should reject multi-mention supervisor delegation when no runtime is bound', async () => {
        // Multi-mention is a supervisor-delegation turn: it needs the gateway
        // (or a hetero binding) now that the browser runtime is retired. With
        // neither, the send must fail loudly instead of silently dropping the
        // delegation.
        const { result } = renderHook(() => useChatStore());
        const sendMessageInServerSpy = vi.spyOn(aiChatService, 'sendMessageInServer');

        await expect(
          result.current.sendMessage({
            message: '@Agent A @Agent B compare',
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'Agent A',
                        metadata: { id: 'agent-a', type: 'agent' },
                        type: 'mention',
                      },
                      { text: ' ', type: 'text' },
                      {
                        label: 'Agent B',
                        metadata: { id: 'agent-b', type: 'agent' },
                        type: 'mention',
                      },
                      { text: ' compare', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            context: createTestContext(),
          }),
        ).rejects.toThrow(AGENT_BINDING_REQUIRED_ERROR);

        expect(sendMessageInServerSpy).not.toHaveBeenCalled();
      });

      it('should forward mentionedAgents to the gateway for multi-mention when gateway mode is enabled', async () => {
        const { result } = renderHook(() => useChatStore());

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [
            createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user' }),
            createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant' }),
          ],
          topics: [],
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        } as any);

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-gw-supervisor',
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });

        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message: '@Agent A @Agent B compare',
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'Agent A',
                        metadata: { id: 'agent-a', type: 'agent' },
                        type: 'mention',
                      },
                      { text: ' ', type: 'text' },
                      {
                        label: 'Agent B',
                        metadata: { id: 'agent-b', type: 'agent' },
                        type: 'mention',
                      },
                      { text: ' compare', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            context: createTestContext(),
          });
        });

        // Multi-mention keeps the supervisor on the gateway; single-mention runs
        // the target directly. The mentioned agents are
        // forwarded so the server enables callAgent + injects the delegation context.
        expect(executeGatewayAgentSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            mentionedAgents: [
              { id: 'agent-a', name: 'Agent A' },
              { id: 'agent-b', name: 'Agent B' },
            ],
          }),
        );
      });

      it('should NOT inject mentionedAgents into the gateway payload when in group chat', async () => {
        const { result } = renderHook(() => useChatStore());

        // Mock group store so groupId resolves
        vi.spyOn(agentGroupStore, 'getChatGroupStoreState').mockReturnValue({
          groupMap: {
            'test-group': {
              id: 'test-group',
              supervisorAgentId: 'supervisor-id',
            },
          },
        } as any);

        const executeGatewayAgentSpy = vi.fn().mockResolvedValue({
          assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
          operationId: 'op-gw-group-mention',
          topicId: undefined,
          userMessageId: TEST_IDS.USER_MESSAGE_ID,
        });
        act(() => {
          useChatStore.setState({
            executeGatewayAgent: executeGatewayAgentSpy,
            isGatewayModeEnabled: () => true,
          });
        });

        await act(async () => {
          await result.current.sendMessage({
            message: '@Agent A in group',
            editorData: {
              root: {
                children: [
                  {
                    children: [
                      {
                        label: 'Agent A',
                        metadata: { id: 'agent-a', type: 'agent' },
                        type: 'mention',
                      },
                      { text: ' in group', type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'root',
              },
            } as any,
            // Group context
            context: {
              agentId: 'sub-agent-id',
              groupId: 'test-group',
              topicId: null,
              threadId: null,
            },
          });
        });

        // Group @member mentions go through group orchestration, not the
        // agent-management delegation channel — the gateway must NOT receive
        // `mentionedAgents`.
        expect(executeGatewayAgentSpy).toHaveBeenCalled();
        expect(executeGatewayAgentSpy.mock.calls[0]?.[0]?.mentionedAgents).toBeUndefined();
      });
    });

    describe('auto-dismiss pending tool interventions', () => {
      // The dismissal sweep runs in the REST-persist tail — after the
      // client-runtime retirement that tail only executes for a gateway-bound
      // direct @Agent mention, so each send below carries one.
      it('should abort pending flat tool messages when user sends a new message', async () => {
        setupDirectMentionTail();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        // Pending interventions only ever live in a real topic bucket now: a
        // new-topic send adopts its minted id up front, so the `_new` bucket
        // never holds messages.
        const topicId = 'topic-pending';
        const key = messageMapKey({ agentId, topicId });

        const pendingToolMsg = createMockMessage({
          id: 'tool-pending-1',
          role: 'tool',
          content: '',
          pluginIntervention: { status: 'pending' },
          topicId,
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: topicId,
            messagesMap: { [key]: [pendingToolMsg] },
            dbMessagesMap: { [key]: [pendingToolMsg] },
          });
        });

        const dispatchSpy = vi.spyOn(result.current, 'internal_dispatchMessage');
        const updatePluginSpy = vi
          .spyOn(messageService, 'updateMessagePlugin')
          .mockResolvedValue({ success: true } as any);

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [
            pendingToolMsg,
            createMockMessage({ id: 'new-user-msg', role: 'user', topicId: undefined }),
            createMockMessage({ id: 'new-assistant-msg', role: 'assistant', topicId: undefined }),
          ],
          topics: [],
          assistantMessageId: 'new-assistant-msg',
          userMessageId: 'new-user-msg',
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            message: DIRECT_MENTION_TEXT + 'override pending interaction',
            editorData: directMentionEditorData('override pending interaction'),
            context: { agentId, topicId, threadId: null },
          });
        });

        // Should dispatch a single merged update for pluginIntervention + content
        const abortCalls = dispatchSpy.mock.calls.filter(
          ([payload]) =>
            payload.type === 'updateMessage' &&
            (payload as any).value?.pluginIntervention?.status === 'aborted',
        );
        expect(abortCalls).toHaveLength(1);
        expect(abortCalls[0][0]).toEqual(
          expect.objectContaining({
            id: 'tool-pending-1',
            type: 'updateMessage',
            value: expect.objectContaining({
              pluginIntervention: { status: 'aborted' },
              content: 'User bypassed this interaction by sending a message directly.',
            }),
          }),
        );

        // Should persist intervention status to server
        expect(updatePluginSpy).toHaveBeenCalledWith(
          'tool-pending-1',
          { intervention: { status: 'aborted' } },
          expect.any(Object),
        );
      });

      it('should abort pending interventions in group message children', async () => {
        setupDirectMentionTail();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        // Same shift as the flat-tool case: messages only live in real topic
        // buckets now, never in `_new`.
        const topicId = 'topic-pending';
        const key = messageMapKey({ agentId, topicId });

        const groupMsg = createMockMessage({
          id: 'group-1',
          role: 'assistant',
          topicId,
          children: [
            {
              id: 'child-1',
              content: '',
              tools: [
                {
                  apiName: 'askUserQuestion',
                  arguments: '{}',
                  id: 'tool-call-1',
                  identifier: 'orvilo-user-interaction',
                  intervention: { status: 'pending' },
                  result_msg_id: 'tool-result-1',
                },
              ],
            },
          ] as any,
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: topicId,
            messagesMap: { [key]: [groupMsg] },
            dbMessagesMap: { [key]: [groupMsg] },
          });
        });

        const dispatchSpy = vi.spyOn(result.current, 'internal_dispatchMessage');
        vi.spyOn(messageService, 'updateMessagePlugin').mockResolvedValue({
          success: true,
        } as any);

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [
            groupMsg,
            createMockMessage({ id: 'new-user-msg', role: 'user', topicId: undefined }),
            createMockMessage({ id: 'new-assistant-msg', role: 'assistant', topicId: undefined }),
          ],
          topics: [],
          assistantMessageId: 'new-assistant-msg',
          userMessageId: 'new-user-msg',
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            message: DIRECT_MENTION_TEXT + 'override group interaction',
            editorData: directMentionEditorData('override group interaction'),
            context: { agentId, topicId, threadId: null },
          });
        });

        // Should dispatch abort for the tool result message found in children
        const abortCalls = dispatchSpy.mock.calls.filter(
          ([payload]) =>
            payload.type === 'updateMessage' &&
            (payload as any).value?.pluginIntervention?.status === 'aborted',
        );
        expect(abortCalls).toHaveLength(1);
        expect(abortCalls[0][0]).toEqual(
          expect.objectContaining({
            id: 'tool-result-1',
            type: 'updateMessage',
            value: expect.objectContaining({
              pluginIntervention: { status: 'aborted' },
            }),
          }),
        );
      });

      it('should not dispatch if no pending interventions exist', async () => {
        setupDirectMentionTail();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const key = messageMapKey({ agentId, topicId: null });

        const normalMsg = createMockMessage({
          id: 'normal-1',
          role: 'assistant',
          topicId: undefined,
        });

        act(() => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            messagesMap: { [key]: [normalMsg] },
            dbMessagesMap: { [key]: [normalMsg] },
          });
        });

        const dispatchSpy = vi.spyOn(result.current, 'internal_dispatchMessage');
        const updatePluginSpy = vi
          .spyOn(messageService, 'updateMessagePlugin')
          .mockResolvedValue({ success: true } as any);

        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [
            normalMsg,
            createMockMessage({ id: 'new-user-msg', role: 'user', topicId: undefined }),
            createMockMessage({ id: 'new-assistant-msg', role: 'assistant', topicId: undefined }),
          ],
          topics: [],
          assistantMessageId: 'new-assistant-msg',
          userMessageId: 'new-user-msg',
        } as any);

        await act(async () => {
          await result.current.sendMessage({
            message: DIRECT_MENTION_TEXT + 'normal message',
            editorData: directMentionEditorData('normal message'),
            context: { agentId, topicId: null, threadId: null },
          });
        });

        // No updateMessage dispatch for intervention abort
        const abortDispatches = dispatchSpy.mock.calls.filter(
          ([payload]) =>
            payload.type === 'updateMessage' &&
            (payload as any).value?.pluginIntervention?.status === 'aborted',
        );
        expect(abortDispatches).toHaveLength(0);
        expect(updatePluginSpy).not.toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ intervention: { status: 'aborted' } }),
          expect.any(Object),
        );
      });
    });

    describe('new topic creation cleanup', () => {
      it('should clear _new key data when new topic is created', async () => {
        setupHeteroRuntime();
        const { result } = renderHook(() => useChatStore());
        const agentId = TEST_IDS.SESSION_ID;
        const newTopicId = 'created-topic-id';

        // Setup initial state: messages exist in the _new key (no topicId)
        const newKey = messageMapKey({ agentId, topicId: null });
        const existingMessages = [
          createMockMessage({ id: 'old-msg-1', role: 'user' }),
          createMockMessage({ id: 'old-msg-2', role: 'assistant' }),
        ];

        await act(async () => {
          useChatStore.setState({
            activeAgentId: agentId,
            activeTopicId: undefined,
            messagesMap: {
              [newKey]: existingMessages,
            },
            dbMessagesMap: {
              [newKey]: existingMessages,
            },
            summaryTopicTitle: vi.fn().mockResolvedValue(undefined),
          });
        });

        // Verify messages exist in _new key before sending
        expect(useChatStore.getState().messagesMap[newKey]).toHaveLength(2);

        // Mock server response with new topic creation
        vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
          messages: [
            createMockMessage({ id: 'new-user-msg', role: 'user', topicId: newTopicId }),
            createMockMessage({ id: 'new-assistant-msg', role: 'assistant', topicId: newTopicId }),
          ],
          topicId: newTopicId,
          isCreateNewTopic: true,
          assistantMessageId: 'new-assistant-msg',
          userMessageId: 'new-user-msg',
        } as any);

        // Mock switchTopic to verify it's called correctly
        const switchTopicSpy = vi.spyOn(result.current, 'switchTopic');

        await act(async () => {
          await result.current.sendMessage({
            message: TEST_CONTENT.USER_MESSAGE,
            context: { agentId, topicId: null, threadId: null },
          });
        });

        // switchTopic should be called with the new topicId and clearNewKey option
        expect(switchTopicSpy).toHaveBeenCalledWith(newTopicId, {
          clearNewKey: true,
          skipRefreshMessage: true,
        });

        // After new topic creation, the _new key should be cleared
        const messagesInNewKey = useChatStore.getState().messagesMap[newKey];
        expect(messagesInNewKey ?? []).toHaveLength(0);

        const newTopicKey = messageMapKey({ agentId, topicId: newTopicId });
        expect(useChatStore.getState().messagesMap[newTopicKey]).toHaveLength(2);
        expect(useChatStore.getState().topicDataMap[topicMapKey({ agentId })]?.items[0]).toEqual(
          expect.objectContaining({ id: newTopicId }),
        );
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Characterization net for the POST-PERSIST topic-title auto-generation hook.
  //
  // After the user message is persisted, sendMessage fires the shared
  // `sendRunLifecycle.afterUserMessagePersisted` hook (fire-and-forget), which
  // calls `summaryTopicTitle(topicId, messages)` when the gate is met:
  //   - the response created a new topic → always summarize it, OR
  //   - existing topic whose `title` is empty/falsy → summarize it.
  // All three runtimes funnel through this one hook: hetero passes the persisted
  // topic via its event context and the hook reads the store; the gateway fires
  // it when executeGatewayAgent resolves a topicId; the REST-persist tail
  // (direct @Agent mention) passes `data.messages` straight through.
  // These tests lock the PER-PATH WIRING (which path triggers the hook), not the
  // title generation mechanism itself (that's unit-tested in topic/action.test.ts).
  //
  // NOTE on async: the hook is dispatched WITHOUT await inside sendMessage.
  // Because the spy resolves synchronously and `act(async () => await ...)` flushes
  // the microtask queue, asserting on the spy right after the awaited sendMessage
  // is reliable here.
  // ───────────────────────────────────────────────────────────────────────────
  describe('post-persist title auto-gen characterization (lifecycle refactor regression net)', () => {
    it('HETERO new-topic path: summaryTopicTitle IS invoked with the new topicId + persisted messages', async () => {
      setupHeteroRuntime();
      const { result } = renderHook(() => useChatStore());
      const agentId = TEST_IDS.SESSION_ID;
      const newTopicId = TEST_IDS.NEW_TOPIC_ID;

      const summaryTopicTitleSpy = vi.fn().mockResolvedValue(undefined);
      act(() => {
        useChatStore.setState({ summaryTopicTitle: summaryTopicTitleSpy });
      });

      const persistedMessages = [
        createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user', topicId: newTopicId }),
        createMockMessage({
          id: TEST_IDS.ASSISTANT_MESSAGE_ID,
          parentId: TEST_IDS.USER_MESSAGE_ID,
          role: 'assistant',
          topicId: newTopicId,
        }),
      ];

      vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
        assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
        isCreateNewTopic: true,
        messages: persistedMessages,
        topicId: newTopicId,
        topics: undefined,
        userMessageId: TEST_IDS.USER_MESSAGE_ID,
      } as any);
      executeHeterogeneousAgentMock.mockResolvedValue(undefined);

      await act(async () => {
        await result.current.sendMessage({
          context: { agentId, threadId: null, topicId: null },
          message: TEST_CONTENT.USER_MESSAGE,
        });
      });

      // new-topic gate → summarize the freshly created topic. The hetero hook
      // reads the just-persisted conversation from the store under the real
      // topicId (event.context), so the persisted rows are what get titled.
      await waitFor(() => expect(summaryTopicTitleSpy).toHaveBeenCalledTimes(1));
      expect(summaryTopicTitleSpy).toHaveBeenCalledWith(
        newTopicId,
        expect.arrayContaining([
          expect.objectContaining({ id: TEST_IDS.USER_MESSAGE_ID }),
          expect.objectContaining({ id: TEST_IDS.ASSISTANT_MESSAGE_ID }),
        ]),
      );
    });

    it('DIRECT-MENTION tail path: summaryTopicTitle still runs when the response omits isCreateNewTopic', async () => {
      // The tail's `isCreatedTopicResponse` treats `willCreateNewTopic &&
      // response.topicId` as a created topic even without the explicit flag.
      setupDirectMentionTail();
      const { result } = renderHook(() => useChatStore());
      const agentId = TEST_IDS.SESSION_ID;
      const newTopicId = TEST_IDS.NEW_TOPIC_ID;

      const summaryTopicTitleSpy = vi.fn().mockResolvedValue(undefined);
      act(() => {
        useChatStore.setState({ summaryTopicTitle: summaryTopicTitleSpy });
      });

      const persistedMessages = [
        createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user', topicId: newTopicId }),
        createMockMessage({
          id: TEST_IDS.ASSISTANT_MESSAGE_ID,
          parentId: TEST_IDS.USER_MESSAGE_ID,
          role: 'assistant',
          topicId: newTopicId,
        }),
      ];

      vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
        assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
        messages: persistedMessages,
        topicId: newTopicId,
        topics: undefined,
        userMessageId: TEST_IDS.USER_MESSAGE_ID,
      } as any);

      await act(async () => {
        await result.current.sendMessage({
          context: { agentId, threadId: null, topicId: null },
          editorData: directMentionEditorData(),
          message: DIRECT_MENTION_TEXT + TEST_CONTENT.USER_MESSAGE,
        });
      });

      await waitFor(() =>
        expect(summaryTopicTitleSpy).toHaveBeenCalledWith(newTopicId, expect.any(Array)),
      );
    });

    it('HETERO existing-topic with EMPTY title: summaryTopicTitle IS invoked', async () => {
      setupHeteroRuntime();
      const { result } = renderHook(() => useChatStore());
      const agentId = TEST_IDS.SESSION_ID;
      const topicId = TEST_IDS.TOPIC_ID;
      const key = messageMapKey({ agentId, topicId });

      const summaryTopicTitleSpy = vi.fn().mockResolvedValue(undefined);

      // Seed an existing topic whose title is empty — this is the second gate branch.
      // currentTopicData() keys on activeAgentId, which resetTestEnvironment set to SESSION_ID.
      act(() => {
        useChatStore.setState({
          summaryTopicTitle: summaryTopicTitleSpy,
          topicDataMap: {
            [topicMapKey({ agentId })]: {
              items: [{ id: topicId, title: '' }],
              total: 1,
            },
          } as any,
        });
      });

      const persistedMessages = [
        createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user', topicId }),
        createMockMessage({
          id: TEST_IDS.ASSISTANT_MESSAGE_ID,
          parentId: TEST_IDS.USER_MESSAGE_ID,
          role: 'assistant',
          topicId,
        }),
      ];

      vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
        assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
        isCreateNewTopic: false,
        messages: persistedMessages,
        topicId,
        topics: undefined,
        userMessageId: TEST_IDS.USER_MESSAGE_ID,
      } as any);
      executeHeterogeneousAgentMock.mockResolvedValue(undefined);

      await act(async () => {
        await result.current.sendMessage({
          context: { agentId, threadId: null, topicId },
          message: TEST_CONTENT.USER_MESSAGE,
        });
      });

      // empty-title gate → summarize the existing topic.
      await waitFor(() => expect(summaryTopicTitleSpy).toHaveBeenCalledTimes(1));
      // First arg is the existing topic id; messages come from the display selector
      // for the topic's message key (assistant message id filtered out).
      expect(summaryTopicTitleSpy.mock.calls[0][0]).toBe(topicId);
      // sanity: the message key exists so the selector path is real
      expect(key).toBe(messageMapKey({ agentId, topicId }));
    });

    it('HETERO existing-topic that ALREADY has a title: summaryTopicTitle is NOT invoked (gate not met)', async () => {
      setupHeteroRuntime();
      const { result } = renderHook(() => useChatStore());
      const agentId = TEST_IDS.SESSION_ID;
      const topicId = TEST_IDS.TOPIC_ID;

      const summaryTopicTitleSpy = vi.fn().mockResolvedValue(undefined);

      // Existing topic WITH a non-empty title → neither gate branch fires.
      act(() => {
        useChatStore.setState({
          summaryTopicTitle: summaryTopicTitleSpy,
          topicDataMap: {
            [topicMapKey({ agentId })]: {
              items: [{ id: topicId, title: 'Already has a title' }],
              total: 1,
            },
          } as any,
        });
      });

      vi.spyOn(aiChatService, 'sendMessageInServer').mockResolvedValue({
        assistantMessageId: TEST_IDS.ASSISTANT_MESSAGE_ID,
        isCreateNewTopic: false,
        messages: [
          createMockMessage({ id: TEST_IDS.USER_MESSAGE_ID, role: 'user', topicId }),
          createMockMessage({ id: TEST_IDS.ASSISTANT_MESSAGE_ID, role: 'assistant', topicId }),
        ],
        topics: undefined,
        userMessageId: TEST_IDS.USER_MESSAGE_ID,
      } as any);
      executeHeterogeneousAgentMock.mockResolvedValue(undefined);

      await act(async () => {
        await result.current.sendMessage({
          context: { agentId, threadId: null, topicId },
          message: TEST_CONTENT.USER_MESSAGE,
        });
        // Let the fire-and-forget afterUserMessagePersisted task settle.
        await Promise.resolve();
      });

      expect(summaryTopicTitleSpy).not.toHaveBeenCalled();
    });

    it('GATEWAY path: summaryTopicTitle IS invoked via the shared hook once the gateway resolves a topicId', async () => {
      // The unified lifecycle titles gateway-created topics too:
      // executeGatewayAgent owns persistence and resolves with the real
      // topicId, then sendMessage fires afterUserMessagePersisted which reads
      // the persisted conversation from the store and summarizes it.
      const { result } = renderHook(() => useChatStore());
      const newTopicId = TEST_IDS.NEW_TOPIC_ID;

      const summaryTopicTitleSpy = vi.fn().mockResolvedValue(undefined);
      const executeGatewayAgentSpy = vi.fn(async (params: any) => {
        useChatStore.getState().completeOperation(params.parentOperationId);
        return makeGatewayResult({ operationId: 'op-gateway', topicId: newTopicId });
      });

      act(() => {
        useChatStore.setState({
          executeGatewayAgent: executeGatewayAgentSpy,
          isGatewayModeEnabled: () => true,
          refreshTopic: vi.fn().mockResolvedValue(undefined),
          summaryTopicTitle: summaryTopicTitleSpy,
        });
      });

      await act(async () => {
        await result.current.sendMessage({
          context: createTestContext(),
          message: TEST_CONTENT.USER_MESSAGE,
        });
      });

      // gateway routing was actually taken (precondition for the assertion below)
      expect(executeGatewayAgentSpy).toHaveBeenCalled();
      // and the shared post-persist title hook fired for the resolved topic
      await waitFor(() =>
        expect(summaryTopicTitleSpy).toHaveBeenCalledWith(newTopicId, expect.any(Array)),
      );
    });
  });
});
