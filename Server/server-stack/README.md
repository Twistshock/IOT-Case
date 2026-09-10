# Server, API, and database

Podman Compose stack: **PostgreSQL** (fitness DB), **fitness-ingest** REST API on port 8080, plus Mosquitto, Telegraf, and Grafana from the original IoT server.

Run all commands from `server-stack/` on a Debian host with this folder copied onto the machine.

## 1. Install Podman

```bash
sudo apt-get update
sudo apt-get install -y podman podman-compose curl openssl
sudo loginctl enable-linger "$USER"
```

`enable-linger` keeps rootless containers running after you log out.

Check: `podman compose version`

## 2. Configure

`compose.yaml` publishes 1883, 5432, and 8080 on a single host IPv4 (the repo default is `192.168.104.10`). That address must already exist on this machine. Podman can only publish on an address the host has; binding one IPv4 keeps those ports off other interfaces.

Read your current addresses (use the IPv4 on your LAN interface):

```bash
ip a
```

Put that address in `compose.yaml`:

```bash
sudo nano compose.yaml
```

Find the three `192.168.104.10` `ports:` lines (Mosquitto 1883, Postgres 5432, fitness-ingest 8080). If you intend to use an address from`ip a` of `192.168.104.10`, leave them. Otherwise replace each with your IPv4. Save and exit.

Create `.env` from the example (do not commit this file):

```bash
cp .env.example .env
sudo nano .env
```

Replace the placeholder values:

- `POSTGRES_PASSWORD` and `GRAFANA_ADMIN_PASSWORD`: pick your own passwords
- `FITNESS_DB_PASSWORD`: pick a password, or generate one with `openssl rand -hex 16` and paste the output
- `FITNESS_DEVICE_TOKEN_SECRET`: must be **64 hex characters**. Generate one with `openssl rand -hex 32` and paste the output

Save and exit nano.

## 3. Start Postgres and create the fitness database

Postgres only creates the `iot` database by itself. The fitness schema and `fitness` role are applied next.

```bash
podman compose up -d postgres
until podman exec iot-postgres pg_isready -U iot; do sleep 1; done

set -a && . ./.env && set +a

podman exec -i iot-postgres psql -U iot -d postgres -v ON_ERROR_STOP=1 < postgres/fitness-setup.sql

podman exec -i iot-postgres psql -U iot -d postgres -v ON_ERROR_STOP=1 <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fitness') THEN
    CREATE ROLE fitness LOGIN PASSWORD '${FITNESS_DB_PASSWORD}';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE fitness TO fitness;
EOF

podman exec -i iot-postgres psql -U iot -d fitness -v ON_ERROR_STOP=1 <<'EOF'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT USAGE, CREATE ON SCHEMA public TO fitness;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fitness;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fitness;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO fitness;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fitness;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fitness;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO fitness;
EOF
```

Check: `podman exec iot-postgres psql -U iot -d fitness -c '\dt'` should list `users`, `vitals`, `daily_steps`, and the other fitness tables.

## 4. Start the rest of the stack

```bash
podman compose up -d --build
podman compose ps
```

All five containers (`iot-postgres`, `iot-fitness-ingest`, `iot-mosquitto`, `iot-telegraf`, `iot-grafana`) should be `Up`.

## 5. Verify the API

Use the same IPv4 as in `compose.yaml` (not `127.0.0.1`; published ports are bound to that address only):

```bash
curl -sS http://YOUR.IP.HERE:8080/health
```

Expect `{"status":"ok"}`. Interactive docs: `http://YOUR.IP.HERE:8080/docs`. Web login: `http://YOUR.IP.HERE:8080/web/login`.

Register a user, then read vitals (empty list is success: the route is authenticated and the DB is reachable):

```bash
curl -sS -X POST http://YOUR.IP.HERE:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo12345"}'
```

The response includes an `access_token`. Copy that value, then paste it in place of `PASTE_TOKEN_HERE`:

```bash
curl -sS -H "Authorization: Bearer PASTE_TOKEN_HERE" http://YOUR.IP.HERE:8080/me/vitals
```

Expect `[]`. Username: `a-z`, `0-9`, `.`, `_`, `-` (3–32 chars). Password: at least 8 characters.

Point the app at `http://YOUR.IP.HERE:8080`.
