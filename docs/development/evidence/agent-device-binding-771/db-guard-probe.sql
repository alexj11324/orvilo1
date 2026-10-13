-- Dedicated local product database. All test mutations are rolled back.
BEGIN;
DO $$
BEGIN
  BEGIN
    INSERT INTO agents(id,user_id,workspace_id,agency_config)
    VALUES ('agt_binding_null_probe','user_agent_testing_001','1cyEyVj9Xztx4Xkh',NULL);
    RAISE EXCEPTION 'Unbound insert unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: direct NULL-device Agent INSERT rejected (23514)';
  END;
  BEGIN
    INSERT INTO agents(id,user_id,workspace_id,agency_config)
    VALUES ('agt_binding_missing_probe','user_agent_testing_001','1cyEyVj9Xztx4Xkh',
      '{"boundDeviceId":"missing-host","executionTarget":"device"}');
    RAISE EXCEPTION 'Missing-host insert unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: unknown-device Agent INSERT rejected (23514)';
  END;
  BEGIN
    UPDATE agents SET agency_config=agency_config-'boundDeviceId' WHERE id='agt_ROrvAGB6Qxqy';
    RAISE EXCEPTION 'Removing device binding unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: direct Agent UPDATE removing binding rejected (23514)';
  END;
  BEGIN
    DELETE FROM devices WHERE workspace_id='1cyEyVj9Xztx4Xkh'
      AND device_id='7622e30c796f5722db51a8c9d22a3096';
    RAISE EXCEPTION 'Referenced device deletion unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: referenced device DELETE rejected (23503)';
  END;
END $$;
SELECT count(*) AS agents, count(*) FILTER (WHERE bound_device_row_id IS NULL) AS unbound_agents
FROM agents;
ROLLBACK;
