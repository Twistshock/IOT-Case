#!/usr/bin/env python3
"""MQTT + HTTP ingest for the fitness database. Runs as nologin user fitness."""

from __future__ import annotations
# Imports and reqs are detailed in the fitness-ingest/README.md markdown file.
# They may also be briefly described where implemented.
import hmac
import json
import os
import re
import hashlib
import threading
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from uuid import UUID

import paho.mqtt.client as mqtt
import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
# os.environ gets environment variables.
MQTT_HOST = os.environ["MQTT_HOST"]
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
PG_HOST = os.environ["POSTGRES_HOST"]
FITNESS_DB = os.environ["FITNESS_DB"]
FITNESS_DB_USER = os.environ["FITNESS_DB_USER"]
FITNESS_DB_PASSWORD = os.environ["FITNESS_DB_PASSWORD"]
HTTP_HOST = os.environ.get("HTTP_HOST", "0.0.0.0")
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8080"))
SEED_USER_ID = os.environ.get("SEED_USER_ID", "11111111-1111-1111-1111-111111111111")
PASSWORD_HASHER = PasswordHasher()
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$") # re is for regex, here we allow lowercase a-z, 0-9, and .-_.

#Checks that our token secret in the ,env file is secure enough.
TOKEN_SECRET = bytes.fromhex(os.environ["FITNESS_DEVICE_TOKEN_SECRET"])
if len(TOKEN_SECRET) != 32:
    raise SystemExit("FITNESS_DEVICE_TOKEN_SECRET must be 32 bytes (64 hex chars), you can generate one with 'openssl rand -hex 32'")

MQTT_FILTER = "users/+/fitness/#"

# psychopg allows python to connect to a python database.
def db() -> psycopg.Connection:
    return psycopg.connect(
        host=PG_HOST,
        dbname=FITNESS_DB,
        user=FITNESS_DB_USER,
        password=FITNESS_DB_PASSWORD,
    )

# Creates a secure device token for the given user ID.
def device_token_for(user_id: str) -> str:
    return hmac.new(TOKEN_SECRET, user_id.encode("utf-8"), hashlib.sha256).hexdigest()


# Verifies the presence of the seed user to ensure the DB is up an running.
def seed_user_ready() -> None:
    with db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM users WHERE id = %s", (SEED_USER_ID,)
        ).fetchone()
        if not exists:
            print(f"seed user {SEED_USER_ID} missing — run migrate-fitness.sql")
            return
        print(f"seed user ready: {SEED_USER_ID}")

# Verifies that the topic is valid.
def parse_topic(topic: str) -> tuple[str, str] | None:
    parts = topic.split("/")
    if len(parts) != 4 or parts[0] != "users" or parts[2] != "fitness":
        return None
    kind = parts[3]
    if kind not in ("steps", "vitals", "gps"):
        return None
    try:
        UUID(parts[1])
    except ValueError:
        return None
    return parts[1], kind

# Checks that a provided device token matches the expected token for the user.
def require_token(user_id: str, token: Any) -> bool:
    if not isinstance(token, str) or not token:
        return False
    return hmac.compare_digest(token, device_token_for(user_id))

# Converts a timestamp to UTC and returns None if it is invalid.
def parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)

# Validates and stores a user's daily step count and goal.
def handle_steps(conn: psycopg.Connection, body: dict[str, Any]) -> str | None:
    try:
        day = date.fromisoformat(body["date"])
        steps = int(body["steps"])
        goal = int(body["goal"])
    except (KeyError, TypeError, ValueError):
        return "invalid steps fields"
    if steps < 0 or goal < 1:
        return "steps/goal out of range"
    conn.execute(
        """
        INSERT INTO daily_steps (user_id, day, steps, goal, updated_at)
        VALUES (%s, %s, %s, %s, now())
        ON CONFLICT (user_id, day) DO UPDATE SET
            steps = EXCLUDED.steps,
            goal = EXCLUDED.goal,
            updated_at = now()
        """,
        (body["user_id"], day, steps, goal),
    )
    return None

# Validates and stores a user's heart rate and blood oxygen readings.
def handle_vitals(conn: psycopg.Connection, body: dict[str, Any], ts: datetime) -> str | None:
    try:
        bpm = int(body["bpm"])
        spo2 = int(body["spo2"])
    except (KeyError, TypeError, ValueError):
        return "invalid vitals fields"
    if not (20 <= bpm <= 250 and 0 <= spo2 <= 100):
        return "bpm/spo2 out of range"
    conn.execute(
        """
        INSERT INTO vitals (user_id, time, bpm, spo2)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id, time) DO UPDATE SET
            bpm = EXCLUDED.bpm,
            spo2 = EXCLUDED.spo2
        """,
        (body["user_id"], ts, bpm, spo2),
    )
    return None

# Validates and stores a user's GPS location and accuracy.
def handle_gps(conn: psycopg.Connection, body: dict[str, Any], ts: datetime) -> str | None:
    try:
        lat = float(body["lat"])
        lon = float(body["lon"])
        accuracy = float(body.get("accuracy_m", 0))
    except (KeyError, TypeError, ValueError):
        return "invalid gps fields"
    if not (-90 <= lat <= 90 and -180 <= lon <= 180 and accuracy >= 0):
        return "gps out of range"
    conn.execute(
        """
        INSERT INTO gps_points (user_id, time, lat, lon, accuracy_m)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (user_id, time) DO UPDATE SET
            lat = EXCLUDED.lat,
            lon = EXCLUDED.lon,
            accuracy_m = EXCLUDED.accuracy_m
        """,
        (body["user_id"], ts, lat, lon, accuracy),
    )
    return None

# Processes an incoming MQTT message and stores its fitness data in the database.
def on_message(_client: mqtt.Client, _userdata: Any, msg: mqtt.MQTTMessage) -> None:
    parsed = parse_topic(msg.topic)
    if parsed is None:
        print(f"ignore topic {msg.topic}")
        return
    user_id, kind = parsed
    try:
        body = json.loads(msg.payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(f"bad json on {msg.topic}: {exc}")
        return
    if not isinstance(body, dict):
        print("payload is not an object")
        return
    if body.get("user_id") != user_id:
        print("user_id does not match topic")
        return
    if not require_token(user_id, body.get("device_token")):
        print(f"bad device_token for {user_id}")
        return
    ts = parse_timestamp(body.get("timestamp"))
    if ts is None:
        print("missing/invalid timestamp")
        return
    try:
        with db() as conn:
            owner = conn.execute(
                "SELECT 1 FROM users WHERE id = %s", (user_id,)
            ).fetchone()
            if not owner:
                print(f"unknown user {user_id}")
                return
            if kind == "steps":
                err = handle_steps(conn, body)
            elif kind == "vitals":
                err = handle_vitals(conn, body, ts)
            else:
                err = handle_gps(conn, body, ts)
            if err:
                print(err)
                conn.rollback()
                return
            conn.commit()
        print(f"stored {kind} for {user_id} at {ts.isoformat()}")
    except Exception as exc:
        print(f"handler error: {exc}")

# Handles a successful MQTT connection and subscribes to fitness messages.
def on_connect(client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any, _props: Any = None) -> None:
    print(f"mqtt connected: {reason_code}")
    client.subscribe(MQTT_FILTER, qos=1)

# Creates and starts the MQTT client in a background thread.
def start_mqtt() -> mqtt.Client:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="fitness-ingest")
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    thread = threading.Thread(target=client.loop_forever, daemon=True)
    thread.start()
    return client

# Cleans up a username by removing surrounding spaces and converting it to lowercase.
def clean_username(raw: str) -> str:
    return raw.strip().lower()

# Validates the username and password from an authentication request.
def parse_auth_body(body: dict[str, Any]) -> tuple[str, str]:
    username = clean_username(str(body["username"]))
    password = str(body["password"])
    if not USERNAME_RE.match(username):
        raise ValueError("invalid username, the username must be all lower case and only include a-z, 0-9 and -_.")
    if len(password) < 8:
        raise ValueError("your password must be at least 8 characters long")
    return username, password

# Creates the device and access tokens for a user.
def token_gen(user_id: str) -> dict[str, str]:
    tok = device_token_for(user_id)
    return {
        "user_id": user_id,
        "device_token": tok,
        "access_token": f"{user_id}.{tok}",
    }


def register_user(username: str, password: str) -> str:
    """Unknown username → INSERT a new user. Taken username → LookupError."""
    password_hash = PASSWORD_HASHER.hash(password)
    with db() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE username = %s", (username,)
        ).fetchone()
        if row:
            raise LookupError("username taken")
        row = conn.execute(
            """
            INSERT INTO users (id, username, password_hash)
            VALUES (gen_random_uuid(), %s, %s)
            RETURNING id
            """,
            (username, password_hash),
        ).fetchone()
        conn.commit()
        user_id = str(row[0])
        print(f"new user {user_id} username={username}")
        return user_id


def login_user(username: str, password: str) -> str:
    """Verify Argon2id hash. Never INSERT. Bad credentials → PermissionError."""
    with db() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = %s",
            (username,),
        ).fetchone()
        if not row:
            raise PermissionError("bad credentials")
        user_id, password_hash = str(row[0]), row[1]
        try:
            PASSWORD_HASHER.verify(password_hash, password)
        except (VerifyMismatchError, InvalidHashError):
            raise PermissionError("bad credentials")
        return user_id

# Handles HTTP request logging by printing the client's address and request details.
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), fmt % args))
# Sends an HTTP response with a JSON payload and the appropriate headers.
    def _send(self, code: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)
# Handles CORS(Cross-Origin Resource Sharing) preflight requests from the client.
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
# Handles GET requests, including the health check endpoint.
    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            self._send(200, {"status": "ok"})
            return
        self._send(404, {"error": "not found"})
# Handles registration and login POST requests.
    def do_POST(self) -> None:
        path = self.path.rstrip("/")
        if path not in ("/auth/register", "/auth/login"):
            self._send(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            username, password = parse_auth_body(body)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self._send(
                400,
                {"error": "expected JSON {\"username\": \"...\", \"password\": \"...\"}"},
            )
            return
        try:
            if path == "/auth/register":
                user_id = register_user(username, password)
            else:
                user_id = login_user(username, password)
        except LookupError:
            self._send(409, {"error": "username taken"})
            return
        except PermissionError:
            self._send(401, {"error": "bad credentials"})
            return
        self._send(200, token_gen(user_id))


def main() -> None:
    seed_user_ready()
    start_mqtt()
    print(f"http listening on {HTTP_HOST}:{HTTP_PORT}")
    ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
