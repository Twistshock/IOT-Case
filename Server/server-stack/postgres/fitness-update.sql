BEGIN;

ALTER TABLE vitals
    ADD COLUMN IF NOT EXISTS tracker_id TEXT,
    ADD COLUMN IF NOT EXISTS sequence BIGINT,
    ADD COLUMN IF NOT EXISTS timestamp_estimated BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS step_delta INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS steps BIGINT,
    ADD COLUMN IF NOT EXISTS temperature_c NUMERIC(4, 1),
    ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT now();

--  Allow null values. Could be useful diagnostics if we get a time but no biometrics
ALTER TABLE vitals
    ALTER COLUMN bpm DROP NOT NULL,
    ALTER COLUMN spo2 DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vitals_tracker_sequence_unique
    ON vitals (tracker_id, sequence)
    WHERE tracker_id IS NOT NULL AND sequence IS NOT NULL;

CREATE INDEX IF NOT EXISTS vitals_user_time_idx
    ON vitals (user_id, time DESC);

ALTER TABLE vitals
    DROP CONSTRAINT IF EXISTS vitals_sequence_nonnegative;
ALTER TABLE vitals
    ADD CONSTRAINT vitals_sequence_nonnegative
        CHECK (sequence IS NULL OR sequence >= 0);

ALTER TABLE vitals
    DROP CONSTRAINT IF EXISTS vitals_steps_nonnegative;
ALTER TABLE vitals
    ADD CONSTRAINT vitals_steps_nonnegative
        CHECK (steps IS NULL OR steps >= 0);

ALTER TABLE vitals
    DROP CONSTRAINT IF EXISTS vitals_step_delta_nonnegative;
ALTER TABLE vitals
    ADD CONSTRAINT vitals_step_delta_nonnegative
        CHECK (step_delta >= 0);

COMMIT;
