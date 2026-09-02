#!/usr/bin/env bash
set -euo pipefail


ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "missing .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a
# Test user for verifying the functionality.
USER_ID="11111111-1111-1111-1111-111111111111"
BROKER_HOST="${FITNESS_MQTT_HOST:-localhost}"
BROKER_PORT="${FITNESS_MQTT_PORT:-1883}"

if [[ -z "${FITNESS_DEVICE_TOKEN_SECRET:-}" ]]; then
  echo "FITNESS_DEVICE_TOKEN_SECRET is not set in .env" >&2
  exit 1
fi # fi closes if statements in shell scripts

TOKEN="$(printf '%s' "$USER_ID" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:${FITNESS_DEVICE_TOKEN_SECRET}" | awk '{print $NF}')"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DAY="$(date -u +%Y-%m-%d)"

steps_payload="$(printf '{"user_id":"%s","date":"%s","steps":8432,"goal":10000,"timestamp":"%s","device_token":"%s"}' "$USER_ID" "$DAY" "$STAMP" "$TOKEN")"
vitals_payload="$(printf '{"user_id":"%s","timestamp":"%s","bpm":72,"spo2":98,"device_token":"%s"}' "$USER_ID" "$STAMP" "$TOKEN")"
gps_payload="$(printf '{"user_id":"%s","timestamp":"%s","lat":55.6761,"lon":12.5683,"accuracy_m":8.5,"device_token":"%s"}' "$USER_ID" "$STAMP" "$TOKEN")"

echo "Publishing three fitness messages for $USER_ID"
echo "$steps_payload"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -q 1 -t "users/${USER_ID}/fitness/steps" -m "$steps_payload"
echo "$vitals_payload"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -q 1 -t "users/${USER_ID}/fitness/vitals" -m "$vitals_payload"
echo "$gps_payload"
mosquitto_pub -h "$BROKER_HOST" -p "$BROKER_PORT" -q 1 -t "users/${USER_ID}/fitness/gps" -m "$gps_payload"
echo "Done."
