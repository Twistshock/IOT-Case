BEGIN;

ALTER TABLE vitals
    ADD COLUMN IF NOT EXISTS tracker_id TEXT,
    ADD COLUMN IF NOT EXISTS timestamp_estimated BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS temperature_c NUMERIC(4, 1),
    ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT now();

--  Allow null values. Could be useful diagnostics if we get a time but no biometrics
ALTER TABLE vitals
    ALTER COLUMN bpm DROP NOT NULL,
    ALTER COLUMN spo2 DROP NOT NULL;

CREATE INDEX IF NOT EXISTS vitals_user_time_idx
    ON vitals (user_id, time DESC);

-- Opaque access tokens (15 min). Live DB may already have this table.
CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash BYTEA PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id);

-- Opaque refresh tokens (14 days). Multiple rows per user (app + web).
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash BYTEA PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Cumulative steps belong on daily_steps, not on each vitals sample.
-- Preserve an existing custom goal; new days get 10000.
CREATE OR REPLACE FUNCTION upsert_daily_steps(
    p_user_id UUID,
    p_day DATE,
    p_steps INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO daily_steps (user_id, day, steps, goal, updated_at)
    VALUES (p_user_id, p_day, p_steps, 10000, now())
    ON CONFLICT (user_id, day) DO UPDATE SET
        steps = EXCLUDED.steps,
        updated_at = now();
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vitals'
          AND column_name = 'steps'
    ) THEN
        INSERT INTO daily_steps (user_id, day, steps, goal, updated_at)
        SELECT DISTINCT ON (user_id, (time AT TIME ZONE 'UTC')::date)
            user_id,
            (time AT TIME ZONE 'UTC')::date,
            steps::integer,
            10000,
            now()
        FROM vitals
        WHERE steps IS NOT NULL
        ORDER BY user_id, (time AT TIME ZONE 'UTC')::date, time DESC
        ON CONFLICT (user_id, day) DO UPDATE SET
            steps = EXCLUDED.steps,
            updated_at = now();
    END IF;
END $$;

ALTER TABLE vitals DROP CONSTRAINT IF EXISTS vitals_steps_nonnegative;
ALTER TABLE vitals DROP COLUMN IF EXISTS steps;
ALTER TABLE vitals DROP CONSTRAINT IF EXISTS vitals_step_delta_nonnegative;
ALTER TABLE vitals DROP COLUMN IF EXISTS step_delta;

DROP INDEX IF EXISTS vitals_tracker_sequence_unique;
ALTER TABLE vitals DROP CONSTRAINT IF EXISTS vitals_sequence_nonnegative;
ALTER TABLE vitals DROP COLUMN IF EXISTS sequence;

COMMIT;
