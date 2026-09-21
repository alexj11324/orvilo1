/**
 * Canonical directory of every `llm_generation_tracing` scenario value.
 *
 * Add to this map whenever a new caller pipes through the tracing path so
 * there's one place to scan for all known scenarios. Values are the literal
 * strings persisted on the row's `scenario` column — keep them stable, they
 * are dashboard / partition keys.
 */
export const TRACING_SCENARIOS = {
  AgentMeta: 'agent_meta',
  AgentSignal: 'agent_signal',
  AgentWelcome: 'agent_welcome',
  BuilderSuggestion: 'builder_suggestion',
  ContextCompress: 'context_compress',
  DocumentToSkillMeta: 'document_to_skill_meta',
  ExpertiseDomainDraft: 'expertise_domain_draft',
  ExpertiseTopicIngestion: 'expertise_topic_ingestion',
  FollowUp: 'follow_up',
  GoalCriteriaGen: 'goal_criteria_gen',
  GoalDecompose: 'goal_decompose',
  GoalExplore: 'goal_explore',
  HistorySummary: 'history_summary',
  HomeBrief: 'home_brief',
  InputCompletion: 'input_completion',
  LangDetect: 'lang_detect',
  MediaAnalysis: 'media_analysis',
  MemoryExtract: 'memory_extract',
  MessageTranslate: 'message_translate',
  OnboardingTaskRecommendation: 'onboarding_task_recommendation',
  SignalFeedbackDomain: 'signal_feedback_domain',
  SignalFeedbackSatisfaction: 'signal_feedback_satisfaction',
  SignalSkillIntent: 'signal_skill_intent',
  SignalSkillManagement: 'signal_skill_management',
  SignupEmailReview: 'signup_email_review',
  TaskBrief: 'task_brief',
  TaskBriefJudge: 'task_brief_judge',
  TaskHandoff: 'task_handoff',
  TaskInstruction: 'task_instruction',
  TaskIntent: 'task_intent',
  TopicTitle: 'topic_title',
  TopicAutoSummary: 'topic_auto_summary',
  UnderstandingAnalysis: 'understanding_analysis',
  UnderstandingDetailedPersona: 'understanding_detailed_persona',
  Unknown: 'unknown',
  ReviewPredict: 'review_predict',
  VerifyJudge: 'verify_judge',
  VerifyPlanGen: 'verify_plan_gen',
  VerifyReport: 'verify_report',
} as const;

export type TracingScenario = (typeof TRACING_SCENARIOS)[keyof typeof TRACING_SCENARIOS];
