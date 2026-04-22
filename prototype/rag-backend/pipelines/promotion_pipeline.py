from __future__ import annotations

from pipelines.config import load_config
from pipelines.ops_store import fetch_latest_candidate, latest_eval_status, mark_active, mark_failed


def promote_latest_candidate() -> dict[str, str]:
    cfg = load_config()
    candidate = fetch_latest_candidate(cfg.database_url)
    if not candidate:
        raise RuntimeError("No candidate index available for promotion")

    index_version, _ = candidate
    eval_status = latest_eval_status(cfg.database_url, index_version=index_version)
    if eval_status != "passed":
        raise RuntimeError(f"Candidate {index_version} cannot be promoted because latest eval status is {eval_status!r}")
    mark_active(cfg.database_url, index_version=index_version)
    return {"status": "active", "index_version": index_version}


def fail_latest_candidate(reason: str) -> dict[str, str]:
    cfg = load_config()
    candidate = fetch_latest_candidate(cfg.database_url)
    if not candidate:
        raise RuntimeError("No candidate index available to fail")

    index_version, _ = candidate
    mark_failed(cfg.database_url, index_version=index_version, notes=reason)
    return {"status": "failed", "index_version": index_version}
