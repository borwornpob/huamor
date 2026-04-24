from __future__ import annotations

"""Database migration for Airflow pipeline tables.

Creates the operational tables (inference_events, review_events,
index_versions, eval_runs, drift_reports) that the Node.js API also
creates at startup.  This allows Airflow containers to run independently
of the API service.

Usage:
    python -m pipelines.db_migration
"""

import os
import sys

import psycopg

MIGRATION_SQL = """
-- Inference events: one row per patient-facing LLM response
CREATE TABLE IF NOT EXISTS inference_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    user_message TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    index_version TEXT NOT NULL,
    retrieval_source TEXT NOT NULL,
    retrieval_count INTEGER NOT NULL,
    fallback_reason TEXT,
    latency_ms INTEGER NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL
);

-- Review events: one row per doctor review / supervision action
CREATE TABLE IF NOT EXISTS review_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    severity TEXT,
    recommended_department TEXT,
    requires_escalation BOOLEAN,
    review_outcome TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

-- Index version registry: tracks candidate / active / rolled_back / failed states
CREATE TABLE IF NOT EXISTS index_versions (
    id TEXT PRIMARY KEY,
    index_version TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL,
    model_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    collection_name TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- Offline evaluation runs
CREATE TABLE IF NOT EXISTS eval_runs (
    id TEXT PRIMARY KEY,
    index_version TEXT NOT NULL,
    status TEXT NOT NULL,
    metrics JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

-- Drift reports produced by the daily drift_report DAG
CREATE TABLE IF NOT EXISTS drift_reports (
    id TEXT PRIMARY KEY,
    index_version TEXT NOT NULL,
    status TEXT NOT NULL,
    metrics JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_inference_events_session_id  ON inference_events(session_id);
CREATE INDEX IF NOT EXISTS idx_inference_events_generated_at ON inference_events(generated_at);
CREATE INDEX IF NOT EXISTS idx_review_events_session_id     ON review_events(session_id);
CREATE INDEX IF NOT EXISTS idx_index_versions_state          ON index_versions(state);
CREATE INDEX IF NOT EXISTS idx_eval_runs_index_version       ON eval_runs(index_version);
CREATE INDEX IF NOT EXISTS idx_drift_reports_index_version   ON drift_reports(index_version);
"""


def run_migration(database_url: str | None = None) -> None:
    """Execute the idempotent migration against the target database."""
    url = database_url or os.getenv("DATABASE_URL", "")
    if not url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        sys.exit(1)

    print(f"Running migration against {url.split('@')[-1]} ...")
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(MIGRATION_SQL)
        conn.commit()
    print("Migration complete — all tables ready.")


if __name__ == "__main__":
    run_migration()
