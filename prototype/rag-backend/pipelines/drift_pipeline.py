from __future__ import annotations

from statistics import mean

from pipelines.config import load_config
from pipelines.ops_store import fetch_inference_review_summary, record_drift_report


def run_drift_report() -> dict[str, float | str]:
    cfg = load_config()
    rows = fetch_inference_review_summary(cfg.database_url)
    if not rows:
        metrics = {"fallback_rate": 0.0, "escalation_rate": 0.0, "correction_rate": 0.0, "avg_retrieval_count": 0.0}
        status = "ok"
        record_drift_report(cfg.database_url, index_version=cfg.base_collection, status=status, metrics=metrics, notes="no production traffic yet")
        return {"status": status, **metrics}

    retrieval_counts = [float(row[1]) for row in rows]
    fallback_rate = mean(float(row[2]) for row in rows)
    escalation_rate = mean(float(row[3]) for row in rows)
    correction_rate = mean(float(row[4]) for row in rows)
    avg_retrieval_count = mean(retrieval_counts)
    status = "critical" if correction_rate > 0.35 or fallback_rate > 0.2 else "warn" if correction_rate > 0.2 or fallback_rate > 0.1 else "ok"
    metrics = {
        "fallback_rate": round(fallback_rate, 4),
        "escalation_rate": round(escalation_rate, 4),
        "correction_rate": round(correction_rate, 4),
        "avg_retrieval_count": round(avg_retrieval_count, 4),
    }
    record_drift_report(cfg.database_url, index_version=cfg.base_collection, status=status, metrics=metrics, notes="rolling production summary")
    return {"status": status, **metrics}
