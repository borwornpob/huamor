from __future__ import annotations

import json
from datetime import datetime, timezone

from scripts.ingest_thai_med_pack_to_qdrant import build_corpus_rows, build_processed_df

from pipelines.config import load_config


def build_dataset_artifact(max_rows: int | None = 500, max_chunks: int | None = 2000) -> str:
    cfg = load_config()
    cfg.artifacts_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    artifact_path = cfg.artifacts_dir / f"dataset_{timestamp}.json"

    processed = build_processed_df(max_rows)
    chunks = build_corpus_rows(processed, max_chunks)
    payload = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "rows": len(processed),
        "chunks": len(chunks),
        "samples": chunks[: min(20, len(chunks))],
    }
    artifact_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(artifact_path)
