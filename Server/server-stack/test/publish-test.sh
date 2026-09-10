#!/usr/bin/env bash
set -euo pipefail

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

payload="$(printf '{"device_id":"test-01","gateway_id":"bp-test","timestamp":"%s","temperature_c":21.5,"humidity_pct":48.0,"pressure_hpa":1012.3}' "$timestamp")"

echo "Publishing:"
echo "$payload"

mosquitto_pub   -h localhost   -p 1883   -t 'gateways/bp-test/weather'   -m "$payload"
