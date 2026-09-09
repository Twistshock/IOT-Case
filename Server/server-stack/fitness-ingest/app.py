#!/usr/bin/env python3
"""HTTP ingest for the fitness database. Runs as nologin user fitness."""

from __future__ import annotations
# Imports and reqs are detailed in the fitness-ingest/README.md markdown file.
# They may also be briefly described where implemented.
import hmac # https://docs.python.org/3/library/hmac.html
import json
import os
import re
import hashlib # hashing functions
import secrets
import psycopg
from psycopg import sql

from defs import api_defs
from contextlib import asynccontextmanager  # for creating async context managers for resource setup/cleanup
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi import Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates # Web template engine
from pydantic import BaseModel, Field

# os.environ gets environment variables.
PG_HOST = os.environ["POSTGRES_HOST"]
FITNESS_DB = os.environ["FITNESS_DB"]
FITNESS_DB_USER = os.environ["FITNESS_DB_USER"]
FITNESS_DB_PASSWORD = os.environ["FITNESS_DB_PASSWORD"]
HTTP_HOST = os.environ.get("HTTP_HOST", "0.0.0.0") # 0.0.0.0 means all local traffic
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8080")) # 8080 is the default port for FastAPI
SEED_USER_ID = os.environ.get("SEED_USER_ID", "11111111-1111-1111-1111-111111111111")
PASSWORD_HASHER = PasswordHasher() # from argon2 import PasswordHasher, used for password hashing
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$") # re is for regex, here we allow lowercase a-z, 0-9, and .-_.

#Checks that our token secret in the ,env file is secure enough.
# Our token secret is used to generate a device token for the user.
TOKEN_SECRET = bytes.fromhex(os.environ["FITNESS_DEVICE_TOKEN_SECRET"])
if len(TOKEN_SECRET) != 32:
    raise SystemExit("FITNESS_DEVICE_TOKEN_SECRET must be 32 bytes (64 hex chars), you can generate one with '  ssl rand -hex 32'")

security = HTTPBearer()

# Access tokens are short-lived; refresh tokens last two weeks and are not extended on use.
ACCESS_TOKEN_TTL = timedelta(minutes=15)
REFRESH_TOKEN_TTL = timedelta(weeks=2)
ACCESS_TOKEN_MAX_AGE = int(ACCESS_TOKEN_TTL.total_seconds())
REFRESH_TOKEN_MAX_AGE = int(REFRESH_TOKEN_TTL.total_seconds())
# We.. should probably invalidate old tokens. But no time rn.


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

# Hashes the token using SHA-256.
def _token_hash(raw: str) -> bytes:
    return hashlib.sha256(raw.encode("utf-8")).digest()


# Normalizes the token by removing quotes and trailing whitespace.
def _normalize_token(raw: str) -> str:
    # Removes quotes, and trailing whitespace.
    token = raw.strip().strip('"').strip("'")
    return token


# Stores an opaque token in the database.
def _store_opaque_token(table: str, user_id: str, ttl: timedelta) -> str:
    # table is a hardcoded name (user_sessions / refresh_tokens), never user input.
    # an opaque token is an unreadable string of characters that act as a reference.
    raw = secrets.token_urlsafe(32)
    with db() as conn:
        conn.execute(
            sql.SQL(
                "INSERT INTO {table} (token_hash, user_id, expires_at) "
                "VALUES (%s, %s, %s)"
            ).format(table=sql.Identifier(table)),
            (_token_hash(raw), user_id, datetime.now(timezone.utc) + ttl),
        )
        conn.commit()
    return raw

# Creates an access token for the given user ID.
def create_access_token(user_id: str) -> str:
    return _store_opaque_token("user_sessions", user_id, ACCESS_TOKEN_TTL)

# Creates a refresh token for the given user ID.
def create_refresh_token(user_id: str) -> str:
    return _store_opaque_token("refresh_tokens", user_id, REFRESH_TOKEN_TTL)

# Issues a new access and refresh token pair for the given user ID.
def issue_tokens(user_id: str) -> tuple[str, str]:
    """New access + refresh pair. Does not revoke other logins (app and web can coexist)."""
    return create_access_token(user_id), create_refresh_token(user_id)

# Retrieves the user ID from the given token.
def _user_from_token(raw: str, table: str, error: str) -> str:
    raw = _normalize_token(raw)
    with db() as conn:
        row = conn.execute(
            sql.SQL(
                "SELECT user_id FROM {table} "
                "WHERE token_hash = %s AND expires_at > now()"
            ).format(table=sql.Identifier(table)),
            (_token_hash(raw),),
        ).fetchone()
    if not row:
        raise HTTPException(401, error)
    return str(row[0])

# Checks if the tokenuser_from_session_token is valid and returns the user ID.
def user_from_session_token(raw: str) -> str:
    raw = _normalize_token(raw)
    try:
        return _user_from_token(raw, "user_sessions", "invalid or expired token")
    except HTTPException as exc:
        if exc.status_code != 401:
            raise
        try:
            _user_from_token(raw, "refresh_tokens", "invalid or expired token")
        except HTTPException:
            raise exc
        raise HTTPException(
            401,
            "You may have submitted the wrong kind of token. Please try again.",
        )

# Retrieves the user ID from the given refresh token.
def user_from_refresh_token(raw: str) -> str:
    return _user_from_token(raw, "refresh_tokens", "invalid or expired refresh token")

# Revokes, used with logout.
def _revoke_token(raw: str, table: str) -> None:
    raw = _normalize_token(raw)
    with db() as conn:
        conn.execute(
            sql.SQL("DELETE FROM {table} WHERE token_hash = %s").format(
                table=sql.Identifier(table)
            ),
            (_token_hash(raw),),
        )
        conn.commit()


def revoke_session(raw: str) -> None:
    _revoke_token(raw, "user_sessions")


def revoke_refresh(raw: str) -> None:
    _revoke_token(raw, "refresh_tokens")

# The **kwargs parameter allows a function to accept any number of keyword arguments.
# https://www.w3schools.com/python/python_args_kwargs.asp
def _auth_cookie_kwargs(max_age: int) -> dict[str, Any]:
    return {
        "httponly": True,
        "secure": os.environ.get("COOKIE_SECURE", "false").lower() == "true",
        "samesite": "lax",
        "max_age": max_age,
    }


def user_from_web_request(request: Request) -> tuple[str | None, str | None]:
    # Returns (user_id, new_access_token). new_access_token is set when the 15-minute 
    # session cookie has expired but the 14-day refresh cookie is still valid.
    raw_access = request.cookies.get("session")
    if raw_access:
        try:
            return user_from_session_token(raw_access), None
        except HTTPException:
            pass

    raw_refresh = request.cookies.get("refresh")
    if raw_refresh:
        try:
            user_id = user_from_refresh_token(raw_refresh)
            return user_id, create_access_token(user_id)
        except HTTPException:
            pass
    return None, None


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
        day = raw_day if isinstance(raw_day, date) else date.fromisoformat(raw_day) # To handle both ISO dates and MQTT date strings. Leaving as-is after mqtt removal.
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

# Upsert - Update, or Insert if none exists.
# To update the steps for the day with the running total coming in from the tracker
# Or create a new with a standard goal of 10,000 steps
def upsert_daily_steps(
    conn: psycopg.Connection, user_id: str, day: date, steps: int
) -> None:
    # New days get goal 10000; existing rows keep their goal and overwrite steps.
    conn.execute("SELECT upsert_daily_steps(%s, %s, %s)", (user_id, day, steps))

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

# Creates the device, access, and refresh tokens for a user.
# User can't have a profile on first registration.
def token_gen(user_id: str, username: str | None = None) -> dict[str, Any]:
    tok = device_token_for(user_id)
    access, refresh = issue_tokens(user_id)
    return {
        "success": True,
        "message": "",
        "data": {
            "username": username or "",
            "user_id": user_id,
        },
        "device_token": tok,
        "access_token": access,
        "refresh_token": refresh,
    }

# Creates the device, access, and refresh tokens for a user.
def token_gen_login(user_id: str, username: str | None = None) -> dict[str, Any]:
    tok = device_token_for(user_id)
    access, refresh = issue_tokens(user_id)
    with db() as conn:
        profile_row = conn.execute(
            """
            SELECT display_name, sex, height_cm
            FROM user_profiles
            WHERE user_id = %s
            """,
            (user_id,),
        ).fetchone()
        weight_row = conn.execute("""
            SELECT day, weight_kg
            FROM weight_entries
            WHERE user_id = %s
            ORDER BY day DESC
            LIMIT 1
            """,
            (user_id,)
        ).fetchone()
        data:dict[str, Any] = {
            "username": username or "",
            "user_id": user_id,
        }
        if profile_row:
            data["profile"] = {
                "display_name": profile_row[0],
                "sex": profile_row[1],
                "height_cm": profile_row[2],
            }

        if weight_row:
            data.setdefault("profile", {})
            data["profile"]["weight_kg"] = float(weight_row[1])
            data["profile"]["weight_day"] = weight_row[0].isoformat()

    return {
        "success": True,
        "message": "",
        "data": data,
        "device_token": tok,
        "access_token": access,
        "refresh_token": refresh,
    }

# Registers a new user.
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
        assert row is not None
        user_id = str(row[0])
        print(f"new user {user_id} username={username}")
        return user_id

# Logs in a user.
def login_user(username: str, password: str) -> str:
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
def user_from_bearer(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    return user_from_session_token(creds.credentials)


## Defined bodies and fields using Pydantic.
class AuthBody(BaseModel):
    username: str
    password: str


class RefreshBody(BaseModel):
    refresh_token: str


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

# 25000 should cover a full day, so i made it 50k.
MEASUREMENT_BATCH_MAX = 50000
MEASUREMENT_BATCH_CHUNK = 500


# For batch ingestion of data.
class MeasurementBody(BaseModel):
    tracker_id: str = Field(pattern=r"^[0-9a-f]{12,32}$")
    captured_at: datetime
    timestamp_estimated: bool = False
    # Running daily total; written to daily_steps, not stored on vitals.
    steps: int = Field(ge=0)
    bpm: int | None = Field(default=None, ge=20, le=250)
    spo2: int | None = Field(default=None, ge=0, le=100)
    temperature_c: float | None = Field(default=None, ge=-20, le=80)

# Ingests a list of MeasurementBody. Large posts are split into smaller chunks.
class MeasurementBatchBody(BaseModel):
    measurements: list[MeasurementBody] = Field(
        min_length=1, max_length=MEASUREMENT_BATCH_MAX
    )

# Parses a timestamp query.
def _parse_rfc3339_timestamp_query(value: str | None) -> datetime | None: # RFC3339 is a standard timestamp format
    if value is None:
        return None
    ts = parse_timestamp(value)
    if ts is None:
        raise HTTPException(422, "from/to must be RFC3339 timestamps")
    return ts


# @asynccontextmanager makes this function run setup code when the app starts (before yield) 
# Here it starts the DB and verifies that it exists.
# A sample can be found at https://fastapi.tiangolo.com/advanced/events/#lifespan
@asynccontextmanager
async def lifespan(_app: FastAPI):
    seed_user_ready()
    yield


app = FastAPI(
    title="Fitness ingest",
    version="0.1.0",
    description="Per-user fitness API. Authorize with access_token from POST /auth/register, POST /auth/login, or POST /auth/refresh.",
    lifespan=lifespan,
)
# Defines the directories for our   
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

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
## If we add an endpoint, please run these commands:
## podman compose build fitness-ingest
## podman rm -f iot-fitness-ingest
## podman-compose up -d fitness-ingest
### Definitions are in api_defs.py
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
    return api_defs.auth_login(body, parse_auth_body, login_user, token_gen_login)


@app.post("/auth/refresh")
def auth_refresh(
    body: RefreshBody
):
    return api_defs.auth_refresh(
        body, user_from_refresh_token, create_access_token, ACCESS_TOKEN_MAX_AGE
    )


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

def _utc_captured_at(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def ingest_measurement_chunk(
    user_id: str, items: list[MeasurementBody]
) -> list[dict[str, str]]:
    timed_items: list[tuple[MeasurementBody, datetime]] = []
    for item in items:
        timed_items.append((item, _utc_captured_at(item.captured_at)))

    with db() as conn:
        # A tracker is not permanently assigned to an account. However, an
        # existing measurement that was already stored cannot change owners.
        for item, captured_at in timed_items:
            existing = conn.execute(
                """
                SELECT user_id
                FROM vitals
                WHERE tracker_id = %s AND time = %s
                """,
                (item.tracker_id, captured_at),
            ).fetchone()
            if existing and str(existing[0]) != user_id:
                raise HTTPException(
                    409,
                    "measurement was already uploaded by another account",
                )

        # Later samples overwrite daily_steps for that date.
        for item, captured_at in sorted(timed_items, key=lambda pair: pair[1]):
            conn.execute(
                """
                INSERT INTO vitals (
                    tracker_id, user_id, time,
                    timestamp_estimated, bpm, spo2, temperature_c
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, time)
                DO NOTHING
                """,
                (
                    item.tracker_id,
                    user_id,
                    captured_at,
                    item.timestamp_estimated,
                    item.bpm,
                    item.spo2,
                    item.temperature_c,
                ),
            )
            # Upserts the running total steps into our daily_steps tracker.
            upsert_daily_steps(conn, user_id, captured_at.date(), item.steps)

        confirmed: list[dict[str, str]] = []
        for item, captured_at in timed_items:
            row = conn.execute(
                """
                SELECT user_id
                FROM vitals
                WHERE user_id = %s AND time = %s
                """,
                (user_id, captured_at),
            ).fetchone()
            if row:
                confirmed.append(
                    {
                        "tracker_id": item.tracker_id,
                        "captured_at": captured_at.isoformat(),
                    }
                )

        conn.commit()

    return confirmed


# For batch ingestion. Posts larger than MEASUREMENT_BATCH_CHUNK are split
# so each DB transaction stays the original size.
@app.post("/me/measurements/batch")
def post_measurement_batch(
    body: MeasurementBatchBody,
    user_id: str = Depends(user_from_bearer),
):
    confirmed: list[dict[str, str]] = []
    items = body.measurements
    for i in range(0, len(items), MEASUREMENT_BATCH_CHUNK):
        confirmed.extend(
            ingest_measurement_chunk(user_id, items[i:i + MEASUREMENT_BATCH_CHUNK])
        )

    return {
        "ok": True,
        "confirmed_count": len(confirmed),
        "confirmed": confirmed,
    }

# Returns the authenticated user's measurements within an optional time range.
@app.get("/me/measurements")
def get_measurements(
    user_id: str = Depends(user_from_bearer),
    from_ts: str | None = Query(None, alias="from"),
    to_ts: str | None = Query(None, alias="to"),
    limit: int = Query(1000, ge=1, le=50000),
):
    end = _parse_rfc3339_timestamp_query(to_ts) or datetime.now(timezone.utc)
    start = _parse_rfc3339_timestamp_query(from_ts)
    if start is None:
        start = end.replace(microsecond=0) - timedelta(days=1)
    if start > end:
        raise HTTPException(422, "from must be on or before to")

    with db() as conn:
        rows = conn.execute(
            """
            SELECT v.time, v.timestamp_estimated,
                   d.steps, v.bpm, v.spo2, v.temperature_c
            FROM vitals v
            LEFT JOIN daily_steps d
              ON d.user_id = v.user_id
             AND d.day = (v.time AT TIME ZONE 'UTC')::date
            WHERE v.user_id = %s
              AND v.time >= %s
              AND v.time <= %s
            ORDER BY v.time DESC
            LIMIT %s
            """,
            (user_id, start, end, limit),
        ).fetchall()

    return [
        {
            "captured_at": row[0].isoformat(),
            "timestamp_estimated": row[1],
            "steps": row[2],
            "bpm": row[3],
            "spo2": row[4],
            "temperature_c": float(row[5]) if row[5] is not None else None,
        }
        for row in rows
    ]


# Returns step, heart-rate, oxygen, and sample-count totals for a time range.
@app.get("/me/summary")
def get_summary(
    user_id: str = Depends(user_from_bearer),
    from_ts: str | None = Query(None, alias="from"),
    to_ts: str | None = Query(None, alias="to"),
):
    end = _parse_rfc3339_timestamp_query(to_ts) or datetime.now(timezone.utc)
    start = _parse_rfc3339_timestamp_query(from_ts)
    if start is None:
        start = end.replace(microsecond=0) - timedelta(days=1)
    if start > end:
        raise HTTPException(422, "from must be on or before to")

    with db() as conn:
        steps_row = conn.execute(
            """
            SELECT COALESCE(SUM(steps), 0)
            FROM daily_steps
            WHERE user_id = %s
              AND day >= %s
              AND day <= %s
            """,
            (user_id, start.date(), end.date()),
        ).fetchone()
        row = conn.execute(
            """
            SELECT MIN(bpm), AVG(bpm), MAX(bpm),
                   MIN(spo2), AVG(spo2), MAX(spo2),
                   COUNT(*)
            FROM vitals
            WHERE user_id = %s
              AND time >= %s
              AND time <= %s
              AND tracker_id IS NOT NULL
            """,
            (user_id, start, end),
        ).fetchone()

    assert steps_row is not None
    assert row is not None

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "steps": int(steps_row[0]),
        "bpm": {
            "min": row[0],
            "avg": float(row[1]) if row[1] is not None else None,
            "max": row[2],
        },
        "spo2": {
            "min": row[3],
            "avg": float(row[4]) if row[4] is not None else None,
            "max": row[5],
        },
        "sample_count": row[6],
    }


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


#Web routes

@app.get("/web/login", response_class=HTMLResponse)
def web_login_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"error": None},
    )

DASHBOARD_RANGES = {
    "hour": timedelta(hours=1),
    "day": timedelta(days=1),
    "2days": timedelta(days=2),
    "week": timedelta(days=7),
}


@app.get("/web/dashboard", response_class=HTMLResponse)
def web_dashboard_page(
    request: Request,
    range_name: str = Query("day", alias="range"),
):
    user_id, new_access = user_from_web_request(request)
    if user_id is None:
        return RedirectResponse("/web/login", status_code=303)

    if range_name not in DASHBOARD_RANGES:
        range_name = "day"

    end = datetime.now(timezone.utc)
    start = end - DASHBOARD_RANGES[range_name]

    with db() as conn:
        user_row = conn.execute(
            "SELECT username FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        rows = conn.execute(
            """
            SELECT v.time, d.steps, v.bpm, v.spo2, v.temperature_c
            FROM vitals v
            LEFT JOIN daily_steps d
              ON d.user_id = v.user_id
             AND d.day = (v.time AT TIME ZONE 'UTC')::date
            WHERE v.user_id = %s
              AND v.time >= %s
              AND v.time <= %s
            ORDER BY v.time ASC
            LIMIT 5000
            """,
            (user_id, start, end),
        ).fetchall()

    points = [
        {
            "t": row[0].isoformat(),
            "steps": row[1],
            "bpm": row[2],
            "spo2": row[3],
            "temperature_c": float(row[4]) if row[4] is not None else None,
        }
        for row in rows
    ]

    response = templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={
            "username": user_row[0] if user_row else "",
            "range_name": range_name,
            "points_json": json.dumps(points).replace("<", "\\u003c"), # u003c = less than, <
        },
    )
    if new_access:
        response.set_cookie("session", new_access, **_auth_cookie_kwargs(ACCESS_TOKEN_MAX_AGE))
    return response

@app.post("/web/login")
def web_login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    try:
        user_id = login_user(clean_username(username), password)
    except PermissionError:
        return templates.TemplateResponse(
            request=request,
            name="login.html",
            context={"error": "Invalid username or password"},
            status_code=401,
        )

    access, refresh = issue_tokens(user_id)
    response = RedirectResponse("/web/dashboard", status_code=303)
    response.set_cookie("session", access, **_auth_cookie_kwargs(ACCESS_TOKEN_MAX_AGE))
    response.set_cookie("refresh", refresh, **_auth_cookie_kwargs(REFRESH_TOKEN_MAX_AGE))
    return response


@app.post("/web/logout")
def web_logout(request: Request):
    session = request.cookies.get("session")
    if session:
        revoke_session(session)
    refresh = request.cookies.get("refresh")
    if refresh:
        revoke_refresh(refresh)

    response = RedirectResponse("/web/login", status_code=303)
    response.delete_cookie("session")
    response.delete_cookie("refresh")
    return response
