#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
PATIENT_USERNAME="${PATIENT_USERNAME:-patient1}"
PATIENT_PASSWORD="${PATIENT_PASSWORD:-patient123}"
DOCTOR_USERNAME="${DOCTOR_USERNAME:-doctor1}"
DOCTOR_PASSWORD="${DOCTOR_PASSWORD:-doctor123}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-10}"
CURL_MAX_TIME="${CURL_MAX_TIME:-90}"
ASSERT_QDRANT_UPSERT="${ASSERT_QDRANT_UPSERT:-false}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

curl_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local auth_header="${4:-}"
  local outfile="$5"

  local curl_args=(
    -sS
    --connect-timeout "$CURL_CONNECT_TIMEOUT"
    --max-time "$CURL_MAX_TIME"
    -X "$method"
    -H "content-type: application/json"
  )

  if [[ -n "$auth_header" ]]; then
    curl_args+=(-H "$auth_header")
  fi
  if [[ -n "$body" ]]; then
    curl_args+=(-d "$body")
  fi

  curl "${curl_args[@]}" "${BASE_URL}${path}" >"$outfile"
}

extract_json() {
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json
import sys

path = sys.argv[2].split(".")
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    value = json.load(fh)
for part in path:
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value.get(part)
print("" if value is None else value)
PY
}

assert_true() {
  local condition="$1"
  local message="$2"
  if [[ "$condition" != "true" ]]; then
    echo "ASSERTION FAILED: $message" >&2
    exit 1
  fi
}

echo "[1/6] Checking health"
curl -fsS "${BASE_URL}/health" >"$tmpdir/health.json"

echo "[2/6] Logging in patient"
curl_json POST /api/auth/login "{\"username\":\"${PATIENT_USERNAME}\",\"password\":\"${PATIENT_PASSWORD}\"}" "" "$tmpdir/patient_login.json"
patient_token="$(extract_json "$tmpdir/patient_login.json" "token")"
if [[ -z "$patient_token" ]]; then
  echo "Patient login failed" >&2
  cat "$tmpdir/patient_login.json" >&2
  exit 1
fi

echo "[3/6] Starting patient chat"
curl_json POST /api/chat/start '{"message":"มีอาการเจ็บหน้าอกและหายใจลำบากควรทำอย่างไร"}' "authorization: Bearer ${patient_token}" "$tmpdir/chat_start.json"
session_id="$(extract_json "$tmpdir/chat_start.json" "session.id")"
runtime_provider="$(extract_json "$tmpdir/chat_start.json" "session.lastRuntimeMetadata.provider")"
if [[ -z "$session_id" ]]; then
  echo "Chat start failed" >&2
  cat "$tmpdir/chat_start.json" >&2
  exit 1
fi
assert_true "$([[ -n "$runtime_provider" ]] && echo true || echo false)" "runtime metadata missing"

echo "[4/6] Logging in doctor"
curl_json POST /api/auth/login "{\"username\":\"${DOCTOR_USERNAME}\",\"password\":\"${DOCTOR_PASSWORD}\"}" "" "$tmpdir/doctor_login.json"
doctor_token="$(extract_json "$tmpdir/doctor_login.json" "token")"
if [[ -z "$doctor_token" ]]; then
  echo "Doctor login failed" >&2
  cat "$tmpdir/doctor_login.json" >&2
  exit 1
fi

echo "[5/6] Reviewing session"
curl_json POST "/api/expert/sessions/${session_id}/review" '{"question":"มีอาการเจ็บหน้าอกและหายใจลำบากควรทำอย่างไร","answer":"ควรพบแพทย์ฉุกเฉินทันทีหากอาการเฉียบพลันหรือรุนแรง","severity":"critical","recommendedDepartment":"emergency","requiresEscalation":true,"reviewOutcome":"corrected","note":"smoke test"}' "authorization: Bearer ${doctor_token}" "$tmpdir/review.json"
review_status="$(extract_json "$tmpdir/review.json" "session.status")"
if [[ "$review_status" != "completed" ]]; then
  echo "Review flow failed" >&2
  cat "$tmpdir/review.json" >&2
  exit 1
fi

echo "[6/6] Verifying operational endpoints"
curl -fsS "${BASE_URL}/ready" >"$tmpdir/ready.json"
curl -fsS "${BASE_URL}/metrics" >"$tmpdir/metrics.txt"
if [[ "$ASSERT_QDRANT_UPSERT" == "true" ]]; then
  qdrant_ok="$(extract_json "$tmpdir/review.json" "qdrant.ok")"
  assert_true "$qdrant_ok" "expected Qdrant upsert to succeed"
fi

echo "Smoke pipeline passed for session ${session_id}"
