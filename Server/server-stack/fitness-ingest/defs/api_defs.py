from __future__ import annotations

from datetime import date
from typing import Any, Callable

from fastapi import HTTPException
from fastapi.responses import JSONResponse


def auth_register(body: Any, parse_auth_body: Callable, register_user: Callable, token_gen: Callable):
    try:
        username, password = parse_auth_body(body.model_dump())
        user_id = register_user(username, password)
        return token_gen(user_id, username)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except LookupError:
        raise HTTPException(409, "username taken")


def auth_login(body: Any, parse_auth_body: Callable, login_user: Callable, token_gen: Callable):
    try:
        username, password = parse_auth_body(body.model_dump())
        user_id = login_user(username, password)
        return token_gen(user_id, username)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except PermissionError:
        raise HTTPException(401, "bad credentials")


def get_profile(user_id: str, db: Callable):
    with db() as conn:
        row = conn.execute("""
            SELECT display_name, sex, height_cm
            FROM user_profiles
            WHERE user_id = %s
            """, (user_id,)).fetchone()
        if not row:
            return JSONResponse({"error": "no profile yet"}, status_code=404)
        payload: dict[str, Any] = {"display_name": row[0], "sex": row[1], "height_cm": row[2]}
        weight = conn.execute("""
            SELECT day, weight_kg
            FROM weight_entries
            WHERE user_id = %s
            ORDER BY day DESC
            LIMIT 1
            """, (user_id,)).fetchone()
        if weight:
            payload["latest_weight_kg"] = float(weight[1])
            payload["latest_weight_day"] = weight[0].isoformat()
        return payload


def put_profile(body: Any, user_id: str, db: Callable):
    with db() as conn:
        conn.execute("""
            INSERT INTO user_profiles (user_id, display_name, sex, height_cm, updated_at)
            VALUES (%s, %s, %s, %s, now())
            ON CONFLICT (user_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                sex = EXCLUDED.sex,
                height_cm = EXCLUDED.height_cm,
                updated_at = now()
            """, (user_id, body.display_name, body.sex, body.height_cm))
        conn.commit()
    return {"display_name": body.display_name, "sex": body.sex, "height_cm": body.height_cm}


def get_weight(user_id: str, from_day: date | None, to_day: date | None, db: Callable):
    if from_day and to_day and from_day > to_day:
        raise HTTPException(422, "from must be on or before to")
    sql = """
        SELECT day, weight_kg
        FROM weight_entries
        WHERE user_id = %s
    """
    params: list[Any] = [user_id]
    if from_day:
        sql += " AND day >= %s"
        params.append(from_day)
    if to_day:
        sql += " AND day <= %s"
        params.append(to_day)
    sql += " ORDER BY day ASC"
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [{"day": row[0].isoformat(), "weight_kg": float(row[1])} for row in rows]


def put_weight(body: Any, user_id: str, db: Callable):
    with db() as conn:
        conn.execute("""
            INSERT INTO weight_entries (user_id, day, weight_kg, updated_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (user_id, day) DO UPDATE SET
                weight_kg = EXCLUDED.weight_kg,
                updated_at = now()
            """, (user_id, body.day, body.weight_kg))
        conn.commit()
    return {"day": body.day.isoformat(), "weight_kg": body.weight_kg}


def post_steps(body: Any, user_id: str, db: Callable, handle_steps: Callable):
    payload = body.model_dump()
    payload["user_id"] = user_id
    with db() as conn:
        owner = conn.execute("SELECT 1 FROM users WHERE id = %s", (user_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "user not found")
        err = handle_steps(conn, payload)
        if err:
            raise HTTPException(400, err)
        conn.commit()
    return {"ok": True, "date": body.date.isoformat(), "steps": body.steps, "goal": body.goal}


def post_vitals(body: Any, user_id: str, db: Callable, parse_timestamp: Callable, handle_vitals: Callable):
    ts = parse_timestamp(body.timestamp.isoformat())
    if ts is None:
        raise HTTPException(422, "timestamp must be RFC3339")
    payload = {"user_id": user_id, "bpm": body.bpm, "spo2": body.spo2}
    with db() as conn:
        owner = conn.execute("SELECT 1 FROM users WHERE id = %s", (user_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "user not found")
        err = handle_vitals(conn, payload, ts)
        if err:
            raise HTTPException(400, err)
        conn.commit()
    return {"ok": True, "timestamp": ts.isoformat(), "bpm": body.bpm, "spo2": body.spo2}


def post_gps(body: Any, user_id: str, db: Callable, parse_timestamp: Callable, handle_gps: Callable):
    ts = parse_timestamp(body.timestamp.isoformat())
    if ts is None:
        raise HTTPException(422, "timestamp must be RFC3339")
    payload = {"user_id": user_id, "lat": body.lat, "lon": body.lon, "accuracy_m": body.accuracy_m}
    with db() as conn:
        owner = conn.execute("SELECT 1 FROM users WHERE id = %s", (user_id,)).fetchone()
        if not owner:
            raise HTTPException(404, "user not found")
        err = handle_gps(conn, payload, ts)
        if err:
            raise HTTPException(400, err)
        conn.commit()
    return {"ok": True, "timestamp": ts.isoformat(), "lat": body.lat, "lon": body.lon, "accuracy_m": body.accuracy_m}


def delete_weight(day: date, user_id: str, db: Callable):
    with db() as conn:
        conn.execute("DELETE FROM weight_entries WHERE user_id = %s AND day = %s", (user_id, day))
        conn.commit()
    return {"ok": True, "day": day.isoformat()}


def get_steps(user_id: str, from_day: date | None, to_day: date | None, db: Callable):
    if from_day and to_day and from_day > to_day:
        raise HTTPException(422, "from must be on or before to")
    sql = """
        SELECT day, steps, goal, updated_at
        FROM daily_steps
        WHERE user_id = %s
    """
    params: list[Any] = [user_id]
    if from_day:
        sql += " AND day >= %s"
        params.append(from_day)
    if to_day:
        sql += " AND day <= %s"
        params.append(to_day)
    sql += " ORDER BY day ASC"
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [{"date": row[0].isoformat(), "steps": row[1], "goal": row[2], "updated_at": row[3].isoformat() if row[3] else None} for row in rows]


def get_vitals(user_id: str, from_ts: str | None, to_ts: str | None, limit: int, db: Callable, parse_query_timestamp: Callable):
    start = parse_query_timestamp(from_ts)
    end = parse_query_timestamp(to_ts)
    if start and end and start > end:
        raise HTTPException(422, "from must match or precede the to-date")
    sql = """
        SELECT time, bpm, spo2
        FROM vitals
        WHERE user_id = %s
    """
    params: list[Any] = [user_id]
    if start:
        sql += " AND time >= %s"
        params.append(start)
    if end:
        sql += " AND time <= %s"
        params.append(end)
    sql += " ORDER BY time DESC LIMIT %s"
    params.append(limit)
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [{"timestamp": row[0].isoformat(), "bpm": row[1], "spo2": row[2]} for row in rows]


def get_gps(user_id: str, from_ts: str | None, to_ts: str | None, limit: int, db: Callable, parse_query_timestamp: Callable):
    start = parse_query_timestamp(from_ts)
    end = parse_query_timestamp(to_ts)
    if start and end and start > end:
        raise HTTPException(422, "from must be on or before to")
    sql = """
        SELECT time, lat, lon, accuracy_m
        FROM gps_points
        WHERE user_id = %s
    """
    params: list[Any] = [user_id]
    if start:
        sql += " AND time >= %s"
        params.append(start)
    if end:
        sql += " AND time <= %s"
        params.append(end)
    sql += " ORDER BY time DESC LIMIT %s"
    params.append(limit)
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [{"timestamp": row[0].isoformat(), "lat": row[1], "lon": row[2], "accuracy_m": row[3]} for row in rows]