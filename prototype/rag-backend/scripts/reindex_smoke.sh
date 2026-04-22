#!/usr/bin/env bash
# Re-indexing pipeline smoke test
# Triggers the full dataset_refresh -> index_build -> offline_eval -> promote pipeline
# via the Airflow REST API.
set -euo pipefail

AIRFLOW_BASE="${AIRFLOW_BASE:-http://localhost:8081}"
AIRFLOW_USER="${AIRFLOW_USER:-admin}"
AIRFLOW_PASS="${AIRFLOW_PASS:-admin}"
POLL_INTERVAL="${POLL_INTERVAL:-10}"
POLL_TIMEOUT="${POLL_TIMEOUT:-300}"

curl_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  local curl_args=(
    -sS
    --connect-timeout 10
    --max-time 60
    -X "$method"
    -u "${AIRFLOW_USER}:${AIRFLOW_PASS}"
    -H "content-type: application/json"
  )

  if [[ -n "$body" ]]; then
    curl_args+=(-d "$body")
  fi

  curl "${curl_args[@]}" "${AIRFLOW_BASE}${path}"
}

wait_for_airflow() {
  echo "Waiting for Airflow webserver at ${AIRFLOW_BASE}..."
  local elapsed=0
  while [[ $elapsed -lt $POLL_TIMEOUT ]]; do
    if curl -sS -f -o /dev/null --connect-timeout 5 --max-time 10 \
      -u "${AIRFLOW_USER}:${AIRFLOW_PASS}" "${AIRFLOW_BASE}/health"; then
      echo "Airflow is ready."
      return 0
    fi
    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done
  echo "ERROR: Airflow did not become ready within ${POLL_TIMEOUT}s" >&2
  return 1
}

trigger_and_wait() {
  local dag_id="$1"
  local label="$2"

  echo "[trigger] ${label} (${dag_id})"

  local dag_run_id="${dag_id}-$(date +%s)"
  local response
  response="$(curl_json POST "/api/v1/dags/${dag_id}/dagRuns" "{\"dag_run_id\":\"${dag_run_id}\"}")"
  echo "  Triggered: $(echo "$response" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("dag_run_id","?"))' 2>/dev/null || echo "$response")"

  local elapsed=0
  while [[ $elapsed -lt $POLL_TIMEOUT ]]; do
    local state
    state="$(curl_json GET "/api/v1/dags/${dag_id}/dagRuns/${dag_run_id}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("state","unknown"))' 2>/dev/null || echo "unknown")"

    if [[ "$state" == "success" ]]; then
      echo "  ${label}: SUCCESS"
      return 0
    elif [[ "$state" == "failed" ]]; then
      echo "  ${label}: FAILED" >&2
      curl_json GET "/api/v1/dags/${dag_id}/dagRuns/${dag_run_id}/taskInstances" | python3 -c '
import json,sys
for ti in json.load(sys.stdin).get("task_instances",[]):
    print(f"    {ti["task_id"]}: {ti["state"]}")
' 2>/dev/null
      return 1
    fi

    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done

  echo "  ${label}: TIMEOUT after ${POLL_TIMEOUT}s" >&2
  return 1
}

echo "=== Re-indexing Pipeline Smoke Test ==="
echo ""

wait_for_airflow

echo ""
echo "--- Step 1: Dataset Refresh ---"
trigger_and_wait "dataset_refresh" "Dataset Refresh"

echo ""
echo "--- Step 2: Index Build ---"
trigger_and_wait "index_build" "Index Build"

echo ""
echo "--- Step 3: Offline Evaluation ---"
trigger_and_wait "offline_eval" "Offline Evaluation"

echo ""
echo "--- Step 4: Promote Candidate ---"
trigger_and_wait "promote_candidate" "Promote Candidate"

echo ""
echo "=== Re-indexing pipeline completed successfully ==="
