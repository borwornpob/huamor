from __future__ import annotations

from datetime import datetime, timezone

from pipelines.config import load_config
from pipelines.ops_store import record_index_version


def build_candidate_index(
    max_rows: int | None = 500, max_chunks: int | None = 2000
) -> dict[str, str]:
    # Heavy imports deferred to execution time to avoid OOM / timeout during Airflow DAG parsing
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
    from scripts.ingest_thai_med_pack_to_qdrant import (
        build_corpus_rows,
        build_processed_df,
    )
    from sentence_transformers import SentenceTransformer

    cfg = load_config()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    index_version = f"{cfg.base_collection}_{timestamp}"
    processed = build_processed_df(max_rows)
    rows = build_corpus_rows(processed, max_chunks)
    if not rows:
        raise RuntimeError("No corpus rows generated for index build")

    model = SentenceTransformer(cfg.embedding_model)
    dim = model.get_sentence_embedding_dimension()
    client = QdrantClient(url=cfg.qdrant_url, api_key=cfg.qdrant_api_key)
    client.recreate_collection(
        collection_name=index_version,
        vectors_config=models.VectorParams(size=dim, distance=models.Distance.COSINE),
    )

    batch = rows[: min(500, len(rows))]
    embeddings = model.encode([row["text"] for row in batch], normalize_embeddings=True)
    points = []
    for idx, (row, vector) in enumerate(zip(batch, embeddings)):
        points.append(
            {
                "id": idx + 1,
                "vector": vector.tolist(),
                "payload": row,
            }
        )
    client.upsert(collection_name=index_version, points=points, wait=True)
    record_index_version(
        cfg.database_url,
        index_version=index_version,
        state="candidate",
        model_version=cfg.model_version,
        prompt_version=cfg.prompt_version,
        collection_name=index_version,
        notes=f"candidate index built with {len(batch)} rows",
    )
    return {"index_version": index_version, "collection_name": index_version}
