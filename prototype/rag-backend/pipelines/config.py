from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class PipelineConfig:
    database_url: str
    qdrant_url: str
    qdrant_api_key: str | None
    base_collection: str
    embedding_model: str
    prompt_version: str
    model_version: str
    artifacts_dir: Path


def load_config() -> PipelineConfig:
    return PipelineConfig(
        database_url=os.getenv("DATABASE_URL", ""),
        qdrant_url=os.getenv("QDRANT_URL", ""),
        qdrant_api_key=os.getenv("QDRANT_API_KEY") or None,
        base_collection=os.getenv("QDRANT_COLLECTION", "medical_kb"),
        embedding_model=os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3"),
        prompt_version=os.getenv("PROMPT_VERSION", "triage-v1"),
        model_version=os.getenv("SEALION_MODEL", "aisingapore/Gemma-SEA-LION-v4-27B-IT"),
        artifacts_dir=Path(os.getenv("PIPELINE_ARTIFACTS_DIR", "./artifacts")),
    )
