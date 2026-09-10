SELECT 'CREATE DATABASE fitness'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fitness')\gexec

\c fitness

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_steps (
    user_id UUID NOT NULL REFERENCES users (id),
    day DATE NOT NULL,
    steps INTEGER DEFAULT 10000,
    goal INTEGER DEFAULT 10000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);

-- bpm/spo2 may be null when a sample has a time but no biometrics.
CREATE TABLE IF NOT EXISTS vitals (
    user_id UUID NOT NULL REFERENCES users (id),
    time TIMESTAMPTZ NOT NULL,
    bpm INTEGER,
    spo2 INTEGER,
    tracker_id TEXT,
    timestamp_estimated BOOLEAN NOT NULL DEFAULT false,
    temperature_c NUMERIC(4, 1),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, time)
);
CREATE INDEX IF NOT EXISTS vitals_user_time_idx
    ON vitals (user_id, time DESC);

CREATE TABLE IF NOT EXISTS gps_points (
    user_id UUID NOT NULL REFERENCES users (id),
    time TIMESTAMPTZ NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, time)
);

-- Optional user profile.
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users (id),
    display_name TEXT,
    sex TEXT,
    height_cm INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    profile_ciphertext BYTEA, -- Ciphers and nonce weren't used in the end
    profile_nonce BYTEA,      -- But we keep them for parity.
    profile_key_version INTEGER
);

-- For weighing in 1/day
CREATE TABLE IF NOT EXISTS weight_entries (
    user_id UUID NOT NULL REFERENCES users (id),
    day DATE NOT NULL,
    weight_kg NUMERIC(5, 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);

-- Opaque access tokens (15 min). Multiple rows per user so app + web can both stay logged in.
CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash BYTEA PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id);

-- Opaque refresh tokens (14 days). Same: one row per login, not unique on user_id.
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

-- Seed user for MQTT tests before register/login exists.
-- password_hash is unusable ('!'); tests use HMAC device_token, not a password.
INSERT INTO users (id, username, password_hash)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'seed',
    '!'
)
ON CONFLICT (id) DO NOTHING;

REVOKE CONNECT ON DATABASE fitness FROM PUBLIC;
GRANT CONNECT ON DATABASE fitness TO CURRENT_USER;
