CREATE INDEX IF NOT EXISTS "account_providerId_accountId_idx" ON "accounts" USING btree ("provider_id","account_id");
