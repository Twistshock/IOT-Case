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

CREATE TABLE IF NOT EXISTS vitals (
    user_id UUID NOT NULL REFERENCES users (id),
    time TIMESTAMPTZ NOT NULL,
    bpm INTEGER NOT NULL,
    spo2 INTEGER NOT NULL,
    PRIMARY KEY (user_id, time)
);

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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
