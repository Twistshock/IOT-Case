#!/usr/bin/env python3
"""MQTT + HTTP ingest for the fitness database. Runs as nologin user fitness."""

from __future__ import annotations
# Imports and reqs are detailed in the fitness-ingest/README.md markdown file.
# They may also be briefly described where implemented.
import hmac # https://docs.python.org/3/library/hmac.html
import json
import os
import re
import hashlib # hashing functions
import threading
from defs import api_defs
from contextlib import asynccontextmanager  # for creating async context managers for resource setup/cleanup
from datetime import date, datetime, timezone
from typing import Any, Literal
from uuid import UUID

import paho.mqtt.client as mqtt
import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
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
    raise SystemExit("FITNESS_DEVICE_TOKEN_SECRET must be 32 bytes (64 hex chars), you can generate one with '  ssl rand -hex 32'")

MQTT_FILTER = "users/+/fitness/#"
security = HTTPBearer()

# psychopg allows python to connect to a python database.
# https://www.psycopg.org/psycopg3/docs/api/connections.html
# Python note: -> = return type annotation
# ie db() returns a psycopg.Connection type.
# | None is appended in a lot of places to return None if items are invalid.
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


# Verifies the presence of the seed user to ensure the DB is up and running.
def seed_user_ready() -> None:
    with db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM users WHERE id = %s", (SEED_USER_ID,)    #%s is a psychopg parameter placeholder for SQL that helps to prevent sql injection
        ).fetchone()                                                #https://www.psycopg.org/psycopg3/docs/basic/params.html
        if not exists:
            print(f"seed user {SEED_USER_ID} missing — run migrate-fitness.sql")
            return
        print(f"seed user exists: {SEED_USER_ID}")

# Verifies that the topic is valid. Used for incoming messages.
def parse_topic(topic: str) -> tuple[str, str] | None:
    parts = topic.split("/") # Splits the topic
    if len(parts) != 4 or parts[0] != "users" or parts[2] != "fitness": #
        return None
    kind = parts[3]
    if kind not in ("steps", "vitals", "gps"): # Check the kind of topoic we have
        return None
    try:
        UUID(parts[1])  # Validate that the user ID is a valid UUID format
    except ValueError:
        return None
    return parts[1], kind

# Checks that a provided device token matches the expected token for the user.
def require_token(user_id: str, token: Any) -> bool:
    if not isinstance(token, str) or not token:
        return False
    return hmac.compare_digest(token, device_token_for(user_id))  # returns a==b, more details at https://docs.python.org/3/library/hmac.html#hmac.compare_digest

# Converts a timestamp to UTC and returns None if it is invalid.
def parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))   # fromisoformat converts a an ISO 8601 date to a python date format.
    except ValueError:                                              # RFC 3339 is a profile of ISO 8601
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc) # Assume UTC0 if no timezone is supplied.
    return ts.astimezone(timezone.utc)

# Validates and stores a user's daily step count and goal.
def handle_steps(conn: psycopg.Connection, body: dict[str, Any]) -> str | None:
    try:
        raw_day = body["date"]
        day = raw_day if isinstance(raw_day, date) else date.fromisoformat(raw_day) # To handle both ISO dates and MQTT date strings.
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
    user_id, kind = parsed #kind is steps, vitals, or gps from the MQTT topic
    try: # Tries to parse the incoming json to a python dict
        body = json.loads(msg.payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc: #Malformed JSON
        print(f"bad json on {msg.topic}: {exc}")
        return
    if not isinstance(body, dict): # Verifies that our body is a valid dict format.
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
    if not USERNAME_RE.match(username): # Checks our username against the regex requirements
        raise ValueError("invalid username, the username may only contain a-z, 0-9 and -_.")
    if len(password) < 8: # Simple password length check
        raise ValueError("your password must be at least 8 characters long")
    return username, password

# Creates the device and access tokens for a user.
def token_gen(user_id: str, username: str | None = None) -> dict[str, Any]:
    tok = device_token_for(user_id)
    return {
        "success": True,
        "message": "",
        "data": {
            "username": username or "",
            "user_id": user_id,
        },
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
            raise LookupError("username unavailable")
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




# https://fastapi.tiangolo.com/reference/security/#fastapi.security.HTTPBearer
def user_from_bearer(creds: HTTPAuthorizationCredentials = Depends(security)) -> str:
    raw = creds.credentials
    if not isinstance(raw, str) or "." not in raw:
        raise HTTPException(401, "invalid access_token")
    try:
        user_id, token = raw.split(".", 1)
        UUID(user_id)
    except ValueError:
        raise HTTPException(401, "invalid access_token")
    if not hmac.compare_digest(token, device_token_for(user_id)):
        raise HTTPException(401, "invalid access_token")
    return user_id


class AuthBody(BaseModel):
    username: str
    password: str


class ProfileBody(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    sex: Literal["female", "male", "other", "unspecified"]
    height_cm: int = Field(ge=50, le=250)


class WeightBody(BaseModel):
    day: date
    weight_kg: float = Field(ge=20, le=400)


class StepsBody(BaseModel):
    date: date
    steps: int = Field(ge=0)
    goal: int = Field(ge=1)


class VitalsBody(BaseModel):
    timestamp: datetime
    bpm: int = Field(ge=20, le=250)
    spo2: int = Field(ge=0, le=100)


class GPSBody(BaseModel):
    timestamp: datetime
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: float = Field(ge=0, default=0.0)


def _parse_rfc3339_timestamp_query(value: str | None) -> datetime | None: # RFC3339 is a standard timestamp format
    if value is None:
        return None
    ts = parse_timestamp(value)
    if ts is None:
        raise HTTPException(422, "from/to must be RFC3339 timestamps")
    return ts


# @asynccontextmanager makes this function run setup code when the app starts (before yield) 
# Here it starts the DB and MQTT client.
# A sample can be found at https://fastapi.tiangolo.com/advanced/events/#lifespan
@asynccontextmanager
async def lifespan(_app: FastAPI):
    seed_user_ready()
    start_mqtt()
    yield


app = FastAPI(
    title="Fitness ingest",
    version="0.1.0",
    description="Per-user fitness API. Authorize with access_token from POST /auth/register or POST /auth/login.",
    lifespan=lifespan,
)

# CORS (Cross-Origin Resource Sharing) middleware allows this API to accept requests from browsers
# running on different domains. allow_origins=["*"] permits requests from any origin (tighten up after development).
# https://fastapi.tiangolo.com/advanced/middleware/?h=add_middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow any origin to make requests
    allow_methods=["*"],  # Allow any HTTP method (GET, POST, etc.)
    allow_headers=["*"],  # Allow any headers in requests
)

# Swaggy endpoints (note: swaggy is a joke on swagger, and not a separate thing)
# The @ symbol (decorator) tells FastAPI to create an HTTP GET route at /health that calls health()
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register")
def auth_register(
    body: AuthBody
):
    return api_defs.auth_register(body, parse_auth_body, register_user, token_gen)


@app.post("/auth/login")
def auth_login(
    body: AuthBody
):
    return api_defs.auth_login(body, parse_auth_body, login_user, token_gen)


@app.get("/me/profile")
def get_profile(
    user_id: str = Depends(user_from_bearer)
):
    return api_defs.get_profile(user_id, db)


@app.put("/me/profile")
def put_profile(
    body: ProfileBody,
    user_id: str = Depends(user_from_bearer)
):
    return api_defs.put_profile(body, user_id, db)


@app.get("/me/weight")
def get_weight(
    user_id: str = Depends(user_from_bearer),
    from_day: date | None = Query(None, alias="from"),
    to_day: date | None = Query(None, alias="to"),
):
    return api_defs.get_weight(user_id, from_day, to_day, db)


@app.put("/me/weight")
def put_weight(
    body: WeightBody,
    user_id: str = Depends(user_from_bearer)
):
    return api_defs.put_weight(body, user_id, db)


@app.post("/me/steps")
def post_steps(
    body: StepsBody,
    user_id: str = Depends(user_from_bearer)
    ):
    return api_defs.post_steps(body, user_id, db, handle_steps)


@app.post("/me/vitals")
def post_vitals(
    body: VitalsBody,
    user_id:str = Depends(user_from_bearer)
):
    return api_defs.post_vitals(body, user_id, db, parse_timestamp, handle_vitals)


@app.post("/me/gps")
def post_gps(
    body: GPSBody,
    user_id: str = Depends(user_from_bearer)
):
    return api_defs.post_gps(body, user_id, db, parse_timestamp, handle_gps)


@app.delete("/me/weight/{day}")
def delete_weight(
    day: date,
    user_id: str = Depends(user_from_bearer)
):
    return api_defs.delete_weight(day, user_id, db)


@app.get("/me/steps")
def get_steps(
    user_id: str = Depends(user_from_bearer),
    from_day: date | None = Query(None, alias="from"),
    to_day: date | None = Query(None, alias="to"),
):
    return api_defs.get_steps(user_id, from_day, to_day, db)


@app.get("/me/vitals")
def get_vitals(
    user_id: str = Depends(user_from_bearer),
    from_ts: str | None = Query(None, alias="from"),
    to_ts: str | None = Query(None, alias="to"),
    limit: int = Query(500, ge=1, le=5000),
):
    return api_defs.get_vitals(user_id, from_ts, to_ts, limit, db, _parse_rfc3339_timestamp_query)


@app.get("/me/gps")
def get_gps(
    user_id: str = Depends(user_from_bearer),
    from_ts: str | None = Query(None, alias="from"),
    to_ts: str | None = Query(None, alias="to"),
    limit: int = Query(500, ge=1, le=5000),
):
    return api_defs.get_gps(user_id, from_ts, to_ts, limit, db, _parse_rfc3339_timestamp_query)
