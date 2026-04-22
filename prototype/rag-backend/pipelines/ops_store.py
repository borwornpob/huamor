from __future__ import annotations

import json
import uuid
from contextlib import contextmanager

import psycopg


@contextmanager
def connect(database_url: str):
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            yield conn, cur


def record_index_version(database_url: str, *, index_version: str, state: str, model_version: str, prompt_version: str, collection_name: str, notes: str | None = None) -> None:
    now_sql = "timezone('utc', now())"
    with connect(database_url) as (conn, cur):
        cur.execute(
            f"""
            INSERT INTO index_versions (id, index_version, state, model_version, prompt_version, collection_name, notes, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, {now_sql}, {now_sql})
            ON CONFLICT (index_version)
            DO UPDATE SET
              state = EXCLUDED.state,
              model_version = EXCLUDED.model_version,
              prompt_version = EXCLUDED.prompt_version,
              collection_name = EXCLUDED.collection_name,
              notes = EXCLUDED.notes,
              updated_at = EXCLUDED.updated_at
            """,
            (str(uuid.uuid4()), index_version, state, model_version, prompt_version, collection_name, notes),
        )
        conn.commit()


def record_eval_run(database_url: str, *, index_version: str, status: str, metrics: dict[str, float], notes: str | None = None) -> None:
    with connect(database_url) as (conn, cur):
        cur.execute(
            """
            INSERT INTO eval_runs (id, index_version, status, metrics, notes, created_at)
            VALUES (%s, %s, %s, %s::jsonb, %s, timezone('utc', now()))
            """,
            (str(uuid.uuid4()), index_version, status, json.dumps(metrics), notes),
        )
        conn.commit()


def record_drift_report(database_url: str, *, index_version: str, status: str, metrics: dict[str, float], notes: str | None = None) -> None:
    with connect(database_url) as (conn, cur):
        cur.execute(
            """
            INSERT INTO drift_reports (id, index_version, status, metrics, notes, created_at)
            VALUES (%s, %s, %s, %s::jsonb, %s, timezone('utc', now()))
            """,
            (str(uuid.uuid4()), index_version, status, json.dumps(metrics), notes),
        )
        conn.commit()


def fetch_latest_candidate(database_url: str) -> tuple[str, str] | None:
    with connect(database_url) as (_, cur):
        cur.execute(
            """
            SELECT index_version, collection_name
            FROM index_versions
            WHERE state = 'candidate'
            ORDER BY updated_at DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
        return (row[0], row[1]) if row else None


def mark_active(database_url: str, *, index_version: str) -> None:
    with connect(database_url) as (conn, cur):
        cur.execute("UPDATE index_versions SET state = 'rolled_back', updated_at = timezone('utc', now()) WHERE state = 'active'")
        cur.execute(
            "UPDATE index_versions SET state = 'active', updated_at = timezone('utc', now()) WHERE index_version = %s",
            (index_version,),
        )
        conn.commit()


def mark_failed(database_url: str, *, index_version: str, notes: str | None = None) -> None:
    with connect(database_url) as (conn, cur):
        cur.execute(
            "UPDATE index_versions SET state = 'failed', notes = %s, updated_at = timezone('utc', now()) WHERE index_version = %s",
            (notes, index_version),
        )
        conn.commit()


def fetch_inference_review_summary(database_url: str) -> list[tuple]:
    query = """
    SELECT
      ie.index_version,
      ie.retrieval_count,
      CASE WHEN ie.fallback_reason IS NULL THEN 0 ELSE 1 END AS fallback_flag,
      CASE WHEN re.requires_escalation IS TRUE THEN 1 ELSE 0 END AS escalation_flag,
      CASE WHEN re.review_outcome = 'corrected' THEN 1 ELSE 0 END AS corrected_flag
    FROM inference_events ie
    LEFT JOIN review_events re ON re.session_id = ie.session_id
    ORDER BY ie.generated_at DESC
    LIMIT 1000
    """
    with connect(database_url) as (_, cur):
        cur.execute(query)
        return cur.fetchall()


def latest_eval_status(database_url: str, *, index_version: str) -> str | None:
    with connect(database_url) as (_, cur):
        cur.execute(
            """
            SELECT status
            FROM eval_runs
            WHERE index_version = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (index_version,),
        )
        row = cur.fetchone()
        return row[0] if row else None
