# Migration journal integrity

Drizzle's PG migrator decides which entries to run by comparing each journal
`when` (folderMillis) against `MAX(created_at)` in `drizzle.__drizzle_migrations`
— the stored `created_at` is the journal `when` of the applied entry, not the
wall-clock apply time. An entry journaled with a `when` earlier than an
already-applied entry is **silently skipped** on staged upgrades — the deploy
carrying it never applies it, while new code already reads the columns it
adds. `0180` (which adds `integration_leases.fence_seq`) was journaled with
`when` before `0179`'s and would have been skipped by exactly this path.

## Invariant

`meta/_journal.json` entries must keep `idx` gap-free and `when` **strictly
increasing** in journal order. When two migrations land in the same millisecond
or out of order, bump the later entry's `when` past the previous entry — never
leave an inversion. Do this _before_ release; after an entry has been applied
anywhere, repair forward with an idempotent migration instead of rewriting
history.

## Guard

`packages/database/src/core/__tests__/migrationJournal.test.ts` enforces the
ordering statically in every test run (including an explicit `0179 → 0180 →
0181 → 0182` boundary pin and a corrupt-journal gate), replays the three field
states below on a real Postgres engine (PGlite, same `PgDialect.migrate`
selection logic), and — under the server-DB suite (`TEST_SERVER_DB=1`, CI
`test-database` job) — replays the real two-stage path: a scratch database
migrated to the previous boundary, then the real folder applied on top,
asserting the tail migration's artifact actually exists.

## Migration inventory — `fence_seq` introduction point

`integration_leases.fence_seq` is introduced by **`0180_lean_metal_master`**:

```sql
ALTER TABLE "integration_leases" ADD COLUMN "fence_seq" bigint DEFAULT 0 NOT NULL;
```

and conditionally repaired by **`0183_fence_seq_forward_repair`** (see below).
The boundary cluster:

| idx  | tag                                  | when          | notes                                                                                                                                                                  |
| ---- | ------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0179 | `0179_task_workspace_claims`         | 1789886344796 | creates `task_workspace_claims` + `task_workspace_recoveries`                                                                                                          |
| 0180 | `0180_lean_metal_master`             | 1789886344797 | adds `integration_leases.fence_seq` — `when` was originally **below** 0179's (the journal-order bug); it is also non-idempotent (`ADD COLUMN` without `IF NOT EXISTS`) |
| 0181 | `0181_task_dispatch_origin`          | 1789907068904 | `task_dispatches` origin/initiator/source\_dispatch\_id/settlement\_grant                                                                                              |
| 0182 | `0182_task_workspace_claim_identity` | 1789907379748 | `task_workspace_claims` repo\_common\_dir/base\_branch                                                                                                                 |
| 0183 | `0183_fence_seq_forward_repair`      | 1789933086797 | conditional `fence_seq` repair + definition verification                                                                                                               |

Full inventory as of this writing: 186 journal entries, `0000`–`0185`, gap-free.
Regenerate with `bun run db:generate` / inspect `meta/_journal.json`; the
appendix at the bottom lists every entry.

## Three-scenario field matrix for 0180 (`fence_seq`)

Classify a target database before deploying the repaired journal:

```sql
-- Did 0180 ever apply, and under which journal timestamp?
SELECT created_at FROM drizzle.__drizzle_migrations
 WHERE hash = '<sha256 of 0180_lean_metal_master.sql>';   -- see below

-- Both halves of the question in two probes:
SELECT MAX(created_at) AS boundary FROM drizzle.__drizzle_migrations;
SELECT data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'integration_leases'
   AND column_name = 'fence_seq';
```

sha256 of the file content matches drizzle's stored `hash`:
`shasum -a 256 packages/database/migrations/0180_lean_metal_master.sql`.

| Field state                                                                                                              | Evidence                                                  | What the new journal does                                                                                                         | Required action                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **未应用** (0180 never reached; `MAX(created_at)` < `1789886344797` and column absent)                                   | column absent; boundary below 0180's `when`               | applies 0180 normally, then 0183 verifies the definition and no-ops                                                               | none — deploy as usual                                                                                                                                                                                                   |
| **曾跳过** (column absent; `MAX(created_at)` > `1789886344797`, i.e. 0181/0182 already recorded)                         | column absent; boundary at ≥ 0181's `when`                | 0180 stays skipped; **0183 adds the column** and verifies the definition                                                          | none — 0183 converges it                                                                                                                                                                                                 |
| **已应用** (column present; a `__drizzle_migrations` row matching 0180's hash has `created_at` < 0179's `1789886344796`) | column present; 0180 row timestamped under the old `when` | **fails hard**: 0180 is re-selected (`1789886344797` > recorded boundary) and crashes on the duplicate column before 0183 can run | controlled marker repair **before** deploying: `UPDATE drizzle.__drizzle_migrations SET created_at = 1789886344797 WHERE hash = '<0180 sha256>' AND created_at < 1789886344796;` — then deploy, and 0183 verifies/no-ops |

If no preserved database shows the 已应用 state (prove it by running the probe
above on every environment that ever saw the pre-fix journal), no marker repair
is needed anywhere. The marker update is not a blind history rewrite: it pins
the already-applied row to the timestamp the repaired journal assigns 0180,
matched by content hash, and the PGlite replay test covers it end to end.

**0183 is deliberately not a bare `ADD COLUMN IF NOT EXISTS`.** When the column
exists it checks `data_type = bigint`, `is_nullable = NO`, `column_default = 0`
and raises on any divergence — a column with the right name but a wrong shape
must fail loudly, not masquerade as applied. When absent it creates the column
exactly as 0180 defines it.

## Appendix — full journal inventory (idx / tag / when)

| idx  | tag                                                   | when          |
| ---- | ----------------------------------------------------- | ------------- |
| 0000 | `0000_init`                                           | 1716982944425 |
| 0001 | `0001_add_client_id`                                  | 1717153686544 |
| 0002 | `0002_amusing_puma`                                   | 1717587734458 |
| 0003 | `0003_naive_echo`                                     | 1718460779230 |
| 0004 | `0004_add_next_auth`                                  | 1721724512422 |
| 0005 | `0005_pgvector`                                       | 1722944166657 |
| 0006 | `0006_add_knowledge_base`                             | 1724089032064 |
| 0007 | `0007_fix_embedding_table`                            | 1724254147447 |
| 0008 | `0008_add_rag_evals`                                  | 1725366565650 |
| 0009 | `0009_remove_unused_user_tables`                      | 1729699958471 |
| 0010 | `0010_add_accessed_at_and_clean_tables`               | 1730900133049 |
| 0011 | `0011_add_topic_history_summary`                      | 1731138670427 |
| 0012 | `0012_add_thread`                                     | 1731858381716 |
| 0013 | `0013_add_ai_infra`                                   | 1735834653361 |
| 0014 | `0014_add_message_reasoning`                          | 1737609172353 |
| 0015 | `0015_add_message_search_metadata`                    | 1739901891891 |
| 0016 | `0016_add_message_index`                              | 1741844738677 |
| 0017 | `0017_add_user_id_to_tables`                          | 1742269437903 |
| 0018 | `0018_add_client_id_for_entities`                     | 1742616026643 |
| 0019 | `0019_add_hotkey_user_settings`                       | 1742806552131 |
| 0020 | `0020_add_oidc`                                       | 1744458287757 |
| 0021 | `0021_add_agent_opening_settings`                     | 1744602998656 |
| 0022 | `0022_add_documents`                                  | 1746724476380 |
| 0023 | `0023_remove_param_and_doubao`                        | 1748925630721 |
| 0024 | `0024_add_rbac_tables`                                | 1749301573666 |
| 0025 | `0025_add_provider_config`                            | 1749309388370 |
| 0026 | `0026_add_autovacuum_tuning`                          | 1752212281564 |
| 0027 | `0027_ai_image`                                       | 1752413805765 |
| 0028 | `0028_oauth_handoffs`                                 | 1752567402506 |
| 0029 | `0029_add_apikey_manage`                              | 1753201379817 |
| 0030 | `0030_add_group_chat`                                 | 1756298669289 |
| 0031 | `0031_add_agent_index`                                | 1757902833213 |
| 0032 | `0032_improve_agents_field`                           | 1757993755131 |
| 0033 | `0033_add_table_index`                                | 1758012348218 |
| 0034 | `0034_fix_chat_group`                                 | 1758825944181 |
| 0035 | `0035_add_virtual`                                    | 1759116400580 |
| 0036 | `0036_add_group_messages`                             | 1759666151079 |
| 0037 | `0037_add_user_memory`                                | 1760086906862 |
| 0038 | `0038_add_image_user_settings`                        | 1760108430562 |
| 0039 | `0039_add_editor_data`                                | 1761554153406 |
| 0040 | `0040_improve_user_memory_field`                      | 1761563458595 |
| 0041 | `0041_improve_index`                                  | 1761878697451 |
| 0042 | `0042_improve_agent_index`                            | 1762232313711 |
| 0043 | `0043_add_ai_model_settings`                          | 1762251112601 |
| 0044 | `0044_high_toxin`                                     | 1762870034882 |
| 0045 | `0045_add_tool_intervention`                          | 1762911968658 |
| 0046 | `0046_add_parent_id`                                  | 1763453175961 |
| 0047 | `0047_add_slug_document`                              | 1763987922211 |
| 0048 | `0048_add_editor_data`                                | 1764215503726 |
| 0049 | `0049_better_auth`                                    | 1764229953081 |
| 0050 | `0050_thread_and_user_id`                             | 1764303057060 |
| 0051 | `0051_add_market_into_user_settings`                  | 1764335703306 |
| 0052 | `0052_topic_and_messages`                             | 1764500630663 |
| 0053 | `0053_better_auth_admin`                              | 1764511006123 |
| 0054 | `0054_better_auth_two_factor`                         | 1764579351312 |
| 0055 | `0055_rename_phone_number_to_phone`                   | 1764583392443 |
| 0056 | `0056_update_agent_slug_index`                        | 1764685643024 |
| 0057 | `0057_add_topic_user_memory_extract_status`           | 1764734167674 |
| 0058 | `0058_add_source_into_user_plugins`                   | 1764842015809 |
| 0059 | `0059_add_normalized_email_indexes`                   | 1764858574403 |
| 0060 | `0060_add_user_last_active_at`                        | 1765437218969 |
| 0061 | `0061_add_document_and_memory_index`                  | 1765540257262 |
| 0062 | `0062_add_more_index`                                 | 1765728439737 |
| 0063 | `0063_add_columns_for_several_tables`                 | 1766157362540 |
| 0064 | `0064_add_agents_session_group_id`                    | 1766297832021 |
| 0065 | `0065_add_passkey`                                    | 1766408202688 |
| 0066 | `0066_add_document_fields`                            | 1766474494249 |
| 0067 | `0067_add_agent_cron_tables`                          | 1767929492232 |
| 0068 | `0068_update_group_data`                              | 1768189437504 |
| 0069 | `0069_add_topic_shares_table`                         | 1768303764632 |
| 0070 | `0070_add_user_memory_activities`                     | 1768999498635 |
| 0071 | `0071_add_async_task_extend`                          | 1769093425330 |
| 0072 | `0072_add_market_identifier_chat_group`               | 1769251608013 |
| 0073 | `0073_add_message_group_metadata`                     | 1769272397744 |
| 0074 | `0074_add_fk_indexes_for_cascade_delete`              | 1769341100106 |
| 0075 | `0075_add_user_memory_persona`                        | 1769362978088 |
| 0076 | `0076_add_message_group_index`                        | 1770180814971 |
| 0077 | `0077_add_agent_skills`                               | 1770392264696 |
| 0078 | `0078_added_id_nanoid_for_replacing_id`               | 1770621740632 |
| 0079 | `0079_update_id_nanoid_from_casted_id`                | 1770621892194 |
| 0080 | `0080_add_constraint_unique_not_null_to_id_nanoid`    | 1770624987735 |
| 0081 | `0081_switch_forgien_key_to_id_nanoid`                | 1770626135088 |
| 0082 | `0082_set_id_nanoid_as_primary`                       | 1770628390927 |
| 0083 | `0083_remove_id_seq_identity_column`                  | 1770628799077 |
| 0084 | `0084_rename_id_nanoid_to_id`                         | 1770631019385 |
| 0085 | `0085_remove_id_unique_constraint`                    | 1770632176750 |
| 0086 | `0086_video_generation_schema`                        | 1770955654188 |
| 0087 | `0087_add_eval_benchmark`                             | 1771386090928 |
| 0088 | `0088_fix_benchmark_add_bot_provider`                 | 1772277762014 |
| 0089 | `0089_add_api_key_hash`                               | 1772723999146 |
| 0090 | `0090_enable_pg_search`                               | 1773115333051 |
| 0091 | `0091_topics_add_description`                         | 1773308533505 |
| 0092 | `0092_add_agent_documents`                            | 1773419250145 |
| 0093 | `0093_add_bm25_indexes_with_icu`                      | 1773653550268 |
| 0094 | `0094_agent_bot_providers_add_settings`               | 1773764776073 |
| 0095 | `0095_add_agent_task_system`                          | 1774502940061 |
| 0096 | `0096_add_notification_tables`                        | 1774514478074 |
| 0097 | `0097_add_agent_onboarding`                           | 1774548140282 |
| 0098 | `0098_add_document_history`                           | 1776234919716 |
| 0099 | `0099_topic_status_tasks_automation_mode`             | 1776674965365 |
| 0100 | `0100_add_metadata_and_trigger_to_briefs`             | 1777552567945 |
| 0101 | `0101_add_messenger_tables`                           | 1778164638645 |
| 0102 | `0102_add_agent_operations_table`                     | 1778602304603 |
| 0103 | `0103_add_llm_tracing_and_eval_experiments`           | 1779464293586 |
| 0104 | `0104_add_devices_connectors_push_tokens`             | 1779966336116 |
| 0105 | `0105_add_usage_agent_share_workspace`                | 1780497229863 |
| 0106 | `0106_add_workspace_id_columns`                       | 1780508742730 |
| 0107 | `0107_add_workspace_id_fk`                            | 1780557205766 |
| 0108 | `0108_add_workspace_id_indexes`                       | 1780563957134 |
| 0109 | `0109_migrate_unique_constraints`                     | 1780571940776 |
| 0110 | `0110_add_verify_tables_and_ai_infra_id`              | 1780832120210 |
| 0111 | `0111_workspace_device_and_ai_infra_surrogate_pk`     | 1781883177374 |
| 0112 | `0112_add_verify_evidence_and_reports`                | 1781953132733 |
| 0113 | `0113_add_verify_runs`                                | 1781964552445 |
| 0114 | `0114_add_verify_run_scenario_context`                | 1782009459420 |
| 0115 | `0115_add_workspace_private_visibility`               | 1782954350516 |
| 0116 | `0116_add_task_connector_message_and_verify_updates`  | 1783164982287 |
| 0117 | `0117_workspace_user_settings_and_device_share`       | 1783760291530 |
| 0118 | `0118_workspace_user_settings_surrogate_pk`           | 1783773134101 |
| 0119 | `0119_add_acceptances`                                | 1784101324965 |
| 0120 | `0120_oidc_clients_governance`                        | 1784130423992 |
| 0121 | `0121_add_work_registry_tables`                       | 1784209244697 |
| 0122 | `0122_verify_visibility_and_check_user_decision`      | 1784258432422 |
| 0123 | `0123_resource_permissions_and_messenger_credentials` | 1784296516822 |
| 0124 | `0124_agent_quota_accounts`                           | 1784554877720 |
| 0125 | `0125_add_stats_activity_created_at_indexes`          | 1784642643318 |
| 0126 | `0126_agent_quota_workspace_identity`                 | 1784648819431 |
| 0127 | `0127_add_topic_comments`                             | 1784716592911 |
| 0128 | `0128_notifications_add_workspace_id`                 | 1784898202325 |
| 0129 | `0129_workspace_members_unique_active_owner`          | 1784941780510 |
| 0130 | `0130_notifications_add_context`                      | 1785044468256 |
| 0131 | `0131_agents_add_name_column`                         | 1785648308270 |
| 0132 | `0132_add_agent_labels`                               | 1785715746144 |
| 0133 | `0133_common_veda`                                    | 1786032217905 |
| 0134 | `0134_add_projects`                                   | 1786064297919 |
| 0135 | `0135_api_keys_add_scopes`                            | 1786117168564 |
| 0136 | `0136_projects_add_identifier`                        | 1786138599832 |
| 0137 | `0137_agent_history_jobs_payload`                     | 1786151567302 |
| 0138 | `0138_agent_history_job_groups`                       | 1786166809665 |
| 0139 | `0139_projects_add_coordinator_agent`                 | 1786316226126 |
| 0140 | `0140_productive_madripoor`                           | 1786545606298 |
| 0141 | `0141_goals`                                          | 1786766455568 |
| 0142 | `0142_expertise_domain_tables`                        | 1786791246437 |
| 0143 | `0143_resource_transfer_requests`                     | 1786847279485 |
| 0144 | `0144_notifications_add_metadata_column`              | 1786968214710 |
| 0145 | `0145_agents_add_identity_columns`                    | 1787141104502 |
| 0146 | `0146_acceptance_project_association`                 | 1787188183549 |
| 0147 | `0147_resource_permissions_per_member_subject`        | 1787239313202 |
| 0148 | `0148_goal_graph`                                     | 1787376421190 |
| 0149 | `0149_goals_recovery_and_document_evidence`           | 1787542746291 |
| 0150 | `0150_agent_interventions_and_live_activity`          | 1787736410876 |
| 0151 | `0151_document_comments`                              | 1787815769048 |
| 0152 | `0152_trash_goal_traces_eval_dataset`                 | 1788016606062 |
| 0153 | `0153_fts_search_sync_outbox`                         | 1788108760793 |
| 0154 | `0154_goal_node_task_kind`                            | 1788141397076 |
| 0155 | `0155_document_likes`                                 | 1788177029327 |
| 0156 | `0156_project_working_directories`                    | 1788281814640 |
| 0157 | `0157_add_metrics_tables`                             | 1788399005304 |
| 0158 | `0158_file_upload_reservations`                       | 1788457369087 |
| 0159 | `0159_task_activities`                                | 1788751998345 |
| 0160 | `0160_acceptance_check_assets`                        | 1788849739068 |
| 0161 | `0161_acceptance_comments`                            | 1789038060245 |
| 0162 | `0162_fts_capture_version`                            | 1789308031904 |
| 0163 | `0163_task_position`                                  | 1789444882854 |
| 0164 | `0164_task_run_integration`                           | 1789488147365 |
| 0165 | `0165_task_reviewer_user_id`                          | 1789494600000 |
| 0166 | `0166_task_run_reservation`                           | 1789566739052 |
| 0167 | `0167_hatchet_dispatch_outbox`                        | 1789594629382 |
| 0168 | `0168_hatchet_workflow_steps`                         | 1789594764051 |
| 0169 | `0169_linear_workspace_sync`                          | 1789638417063 |
| 0170 | `0170_clever_night_nurse`                             | 1789638605128 |
| 0171 | `0171_linear_workspace_replanning`                    | 1789642602197 |
| 0172 | `0172_teammates_collaboration_data_layer`             | 1789658169031 |
| 0173 | `0173_flowery_doorman`                                | 1789703613449 |
| 0174 | `0174_workspace_ownership_transfers`                  | 1789742804948 |
| 0175 | `0175_task_pr_delivery_gate`                          | 1789770502747 |
| 0176 | `0176_task_topics_contract`                           | 1789857483828 |
| 0177 | `0177_shallow_gateway`                                | 1789871969944 |
| 0179 | `0179_task_workspace_claims`                          | 1789886344796 |
| 0180 | `0180_lean_metal_master`                              | 1789886344797 |
| 0181 | `0181_task_dispatch_origin`                           | 1789907068904 |
| 0182 | `0182_task_workspace_claim_identity`                  | 1789907379748 |
| 0183 | `0183_fence_seq_forward_repair`                       | 1789933086797 |
