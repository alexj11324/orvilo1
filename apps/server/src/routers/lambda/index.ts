/**
 * This file contains the root router of Orvilo tRPC-backend
 */
import { accountDeletionRouter } from '@/business/server/lambda-routers/accountDeletion';
import { artifactShareRouter } from '@/business/server/lambda-routers/artifactShare';
import { invitationRouter } from '@/business/server/lambda-routers/invitation';
import { pageShareRouter } from '@/business/server/lambda-routers/pageShare';
import { projectMemberRouter } from '@/business/server/lambda-routers/projectMember';
import { referralRouter } from '@/business/server/lambda-routers/referral';
import { spendRouter } from '@/business/server/lambda-routers/spend';
import { storageOverageRouter } from '@/business/server/lambda-routers/storageOverage';
import { subscriptionRouter } from '@/business/server/lambda-routers/subscription';
import { taskTemplateRouter } from '@/business/server/lambda-routers/taskTemplate';
import { topUpRouter } from '@/business/server/lambda-routers/topUp';
import { waitlistRouter } from '@/business/server/lambda-routers/waitlist';
import { workspaceRouter } from '@/business/server/lambda-routers/workspace';
import { workspaceAgentRouter } from '@/business/server/lambda-routers/workspaceAgent';
import { workspaceAuditLogRouter } from '@/business/server/lambda-routers/workspaceAuditLog';
import { workspaceCreditsRouter } from '@/business/server/lambda-routers/workspaceCredits';
import { workspaceCredsRouter } from '@/business/server/lambda-routers/workspaceCreds';
import { workspaceDataRouter } from '@/business/server/lambda-routers/workspaceData';
import { workspaceMemberRouter } from '@/business/server/lambda-routers/workspaceMember';
import { workspaceUsageRouter } from '@/business/server/lambda-routers/workspaceUsage';
import { publicProcedure, router } from '@/libs/trpc/lambda';

import { acceptanceRouter } from './acceptance';
import { acceptanceCommentRouter } from './acceptanceComment';
import { agentRouter } from './agent';
import { agentDocumentRouter } from './agentDocument';
import { agentEvalRouter } from './agentEval';
import { agentEvalExternalRouter } from './agentEvalExternal';
import { agentGroupRouter } from './agentGroup';
import { agentLabelRouter } from './agentLabel';
import { agentNotifyRouter } from './agentNotify';
import { agentQuotaRouter } from './agentQuota';
import { agentShareRouter } from './agentShare';
import { agentSignalRouter } from './agentSignal';
import { agentSkillsRouter } from './agentSkills';
import { agentTraceRouter } from './agentTrace';
import { aiAgentRouter } from './aiAgent';
import { aiChatRouter } from './aiChat';
import { apiKeyRouter } from './apiKey';
import { asrRouter } from './asr';
import { briefRouter } from './brief';
import { changelogRouter } from './changelog';
import { chunkRouter } from './chunk';
import { collaborationRouter } from './collaboration';
import { composioRouter } from './composio';
import { configRouter } from './config';
import { connectorRouter } from './connector';
import { deviceRouter } from './device';
import { documentRouter } from './document';
import { documentCommentRouter } from './documentComment';
import { documentLikeRouter } from './documentLike';
import { expertiseRouter } from './expertise';
import { exporterRouter } from './exporter';
import { fileRouter } from './file';
import { followUpActionRouter } from './followUpAction';
import { githubOAuthRouter } from './githubOAuth';
import { goalRouter } from './goal';
import { homeRouter } from './home';
import { importerRouter } from './importer';
import { knowledgeRouter } from './knowledge';
import { knowledgeBaseRouter } from './knowledgeBase';
import { linearImportRouter } from './linearImport';
import { linearSyncRouter } from './linearSync';
import { llmGenerationTracingRouter } from './llmGenerationTracing';
import { marketRouter } from './market';
import { messageRouter } from './message';
import { metricRouter } from './metric';
import { notebookRouter } from './notebook';
import { notificationRouter } from './notification';
import { pluginRouter } from './plugin';
import { projectRouter } from './project';
import { pullRequestRouter } from './pullRequest';
import { pushTokenRouter } from './pushToken';
import { ragEvalRouter } from './ragEval';
import { recentRouter } from './recent';
import { repositoryRouter } from './repository';
import { resourcePermissionRouter } from './resourcePermission';
import { resourceTransferRequestRouter } from './resourceTransferRequest';
import { searchRouter } from './search';
import { sessionRouter } from './session';
import { sessionGroupRouter } from './sessionGroup';
import { shareRouter } from './share';
import { shareChatRouter } from './shareChat';
import { taskRouter } from './task';
import { taskDraftRouter } from './taskDraft';
import { taskLabelRouter } from './taskLabel';
import { teamRouter } from './team';
import { teamResourceRouter } from './teamResource';
import { threadRouter } from './thread';
import { topicRouter } from './topic';
import { topicCommentRouter } from './topicComment';
import { uploadRouter } from './upload';
import { usageRouter } from './usage';
import { userRouter } from './user';
import { userMemoriesRouter } from './userMemories';
import { userMemoryRouter } from './userMemory';
import { verifyRouter } from './verify';
import { webBrowsingRouter } from './webBrowsing';
import { workRouter } from './work';
import { workAttentionRouter } from './workAttention';
import { workspaceUserSettingsRouter } from './workspaceUserSettings';

export const lambdaRouter = router({
  acceptance: acceptanceRouter,
  acceptanceComment: acceptanceCommentRouter,
  agent: agentRouter,
  agentNotify: agentNotifyRouter,
  agentDocument: agentDocumentRouter,
  agentEval: agentEvalRouter,
  agentEvalExternal: agentEvalExternalRouter,
  agentLabel: agentLabelRouter,
  agentSkills: agentSkillsRouter,
  agentTrace: agentTraceRouter,
  expertise: expertiseRouter,
  agentSignal: agentSignalRouter,
  changelog: changelogRouter,
  brief: briefRouter,
  aiAgent: aiAgentRouter,
  aiChat: aiChatRouter,
  agentQuota: agentQuotaRouter,
  agentShare: agentShareRouter,
  apiKey: apiKeyRouter,
  asr: asrRouter,
  chunk: chunkRouter,
  collaboration: collaborationRouter,
  config: configRouter,
  connector: connectorRouter,
  device: deviceRouter,
  document: documentRouter,
  documentComment: documentCommentRouter,
  documentLike: documentLikeRouter,
  exporter: exporterRouter,
  file: fileRouter,
  followUpAction: followUpActionRouter,
  goal: goalRouter,
  githubOAuth: githubOAuthRouter,
  group: agentGroupRouter,
  healthcheck: publicProcedure.query(() => "i'm live!"),
  home: homeRouter,
  importer: importerRouter,
  invitation: invitationRouter,
  composio: composioRouter,

  knowledge: knowledgeRouter,
  knowledgeBase: knowledgeBaseRouter,
  linearSync: linearSyncRouter,
  linearImport: linearImportRouter,
  llmGenerationTracing: llmGenerationTracingRouter,
  market: marketRouter,
  message: messageRouter,
  metric: metricRouter,
  notebook: notebookRouter,
  notification: notificationRouter,
  plugin: pluginRouter,
  project: projectRouter,
  projectMember: projectMemberRouter,
  pullRequest: pullRequestRouter,
  pushToken: pushTokenRouter,
  ragEval: ragEvalRouter,
  recent: recentRouter,
  repository: repositoryRouter,
  resourcePermission: resourcePermissionRouter,
  resourceTransferRequest: resourceTransferRequestRouter,
  search: searchRouter,
  session: sessionRouter,
  sessionGroup: sessionGroupRouter,
  share: shareRouter,
  shareChat: shareChatRouter,
  task: taskRouter,
  taskDraft: taskDraftRouter,
  taskLabel: taskLabelRouter,
  team: teamRouter,
  teamResource: teamResourceRouter,
  thread: threadRouter,
  topic: topicRouter,
  topicComment: topicCommentRouter,
  upload: uploadRouter,
  usage: usageRouter,
  user: userRouter,
  userMemories: userMemoriesRouter,
  userMemory: userMemoryRouter,
  verify: verifyRouter,
  webBrowsing: webBrowsingRouter,
  work: workRouter,
  workAttention: workAttentionRouter,
  workspace: workspaceRouter,
  workspaceAgent: workspaceAgentRouter,
  workspaceAuditLog: workspaceAuditLogRouter,
  workspaceCreds: workspaceCredsRouter,
  workspaceCredits: workspaceCreditsRouter,
  workspaceData: workspaceDataRouter,
  workspaceMember: workspaceMemberRouter,
  workspaceUsage: workspaceUsageRouter,
  workspaceUserSettings: workspaceUserSettingsRouter,
  accountDeletion: accountDeletionRouter,
  artifactShare: artifactShareRouter,
  pageShare: pageShareRouter,
  referral: referralRouter,
  spend: spendRouter,
  storageOverage: storageOverageRouter,
  subscription: subscriptionRouter,
  taskTemplate: taskTemplateRouter,
  topUp: topUpRouter,
  waitlist: waitlistRouter,
});

export type LambdaRouter = typeof lambdaRouter;
