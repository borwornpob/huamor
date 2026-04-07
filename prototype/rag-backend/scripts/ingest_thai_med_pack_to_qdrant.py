#!/usr/bin/env python3
"""Ingest Thai medical QA corpus into Qdrant.

Pipeline mirrors notebook steps:
1) Load Thaweewat/thai-med-pack
2) Parse [INST] question/answer
3) PII + sensitive filtering
4) Dedupe
5) Chunk Q+A text
6) Embed with sentence-transformers (BAAI/bge-m3 by default)
7) Upsert to Qdrant collection
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from typing import Iterable

import pandas as pd
from datasets import load_dataset
from dotenv import load_dotenv
import requests
from sentence_transformers import SentenceTransformer
from tqdm.auto import tqdm


WS_RE = re.compile(r"\s+")
INST_RE = re.compile(r"\[INST\](.*?)\[/INST\](.*)", re.DOTALL)
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_RE = re.compile(r"\b(?:\+?\d{1,3}[- ]?)?(?:\(?\d{2,3}\)?[- ]?)?\d{3}[- ]?\d{4}\b")
THAI_ID_RE = re.compile(r"\b\d{1}-\d{4}-\d{5}-\d{2}-\d\b")
SENSITIVE_PATTERNS = [
    r"ฆ่าตัวตาย",
    r"ทำร้ายตัวเอง",
    r"กรีด",
    r"ผูกคอ",
    r"อยากตาย",
    r"ข่มขืน",
    r"ล่วงละเมิด",
]
SENSITIVE_RE = re.compile("|".join(SENSITIVE_PATTERNS))


@dataclass
class IngestConfig:
    qdrant_url: str
    qdrant_api_key: str | None
    collection: str
    model_name: str
    tenant_id: str
    batch_size: int
    max_rows: int | None
    max_chunks: int | None
    recreate: bool


def sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest()


def clean_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\u00a0", " ")
    return WS_RE.sub(" ", text).strip()


def parse_inst(sample: str):
    if not sample:
        return None, None
    match = INST_RE.search(sample)
    if not match:
        return None, None
    question = clean_text(match.group(1)).replace("<s>", "").replace("</s>", "").strip()
    answer = clean_text(match.group(2)).replace("<s>", "").replace("</s>", "").strip()
    return question, answer


def pii_risk_flag(text: str) -> bool:
    if not text:
        return False
    return bool(EMAIL_RE.search(text) or THAI_ID_RE.search(text) or PHONE_RE.search(text))


def sensitive_flag(text: str) -> bool:
    if not text:
        return False
    return bool(SENSITIVE_RE.search(text))


def chunk_text(text: str, max_chars: int = 900, overlap: int = 120) -> list[str]:
    text = clean_text(text)
    if not text:
        return []

    sents = re.split(r"(?<=[.!?。！？])\s+", text)
    chunks: list[str] = []
    current = ""
    for sent in sents:
        if not sent:
            continue
        if len(current) + 1 + len(sent) <= max_chars:
            current = (current + " " + sent).strip()
        else:
            if current:
                chunks.append(current)
            current = sent

    if current:
        chunks.append(current)

    final_chunks: list[str] = []
    for chunk in chunks:
        if len(chunk) <= max_chars:
            final_chunks.append(chunk)
        else:
            start = 0
            step = max(1, max_chars - overlap)
            while start < len(chunk):
                final_chunks.append(chunk[start : start + max_chars])
                start += step

    return final_chunks


def build_processed_df(max_rows: int | None) -> pd.DataFrame:
    ds = load_dataset("Thaweewat/thai-med-pack")
    df_raw = ds[list(ds.keys())[0]].to_pandas()

    text_col = "text" if "text" in df_raw.columns else df_raw.columns[0]
    parsed = df_raw[text_col].map(parse_inst)
    df = pd.DataFrame(parsed.tolist(), columns=["question", "answer"])
    df = df.dropna(subset=["question", "answer"]).reset_index(drop=True)

    flags_pii = df.apply(lambda row: pii_risk_flag(row["question"]) or pii_risk_flag(row["answer"]), axis=1)
    flags_sensitive = df.apply(
        lambda row: sensitive_flag(row["question"]) or sensitive_flag(row["answer"]),
        axis=1,
    )
    df = df[~(flags_pii | flags_sensitive)].copy().reset_index(drop=True)

    df["_key"] = (df["question"].fillna("") + "||" + df["answer"].fillna("")).map(sha1)
    df = df.drop_duplicates(subset=["_key"]).drop(columns=["_key"]).reset_index(drop=True)
    df = df[(df["question"].str.len() > 0) & (df["answer"].str.len() > 0)].reset_index(drop=True)

    df["source_id"] = [sha1(f"{q}||{a}||{i}") for i, (q, a) in enumerate(zip(df["question"], df["answer"]))]

    if max_rows is not None and max_rows > 0:
        df = df.head(max_rows).copy().reset_index(drop=True)

    return df


def build_corpus_rows(df: pd.DataFrame, max_chunks: int | None) -> list[dict]:
    rows: list[dict] = []
    for _, row in tqdm(df.iterrows(), total=len(df), desc="chunking"):
        source_id = row["source_id"]
        base = f"Q: {row['question']}\nA: {row['answer']}"
        chunks = chunk_text(base, max_chars=900, overlap=120)
        for idx, chunk in enumerate(chunks):
            chunk_id = f"{source_id}-{idx:03d}"
            rows.append(
                {
                    "source_id": source_id,
                    "chunk_id": chunk_id,
                    "question": row["question"],
                    "answer": row["answer"],
                    "text": chunk,
                }
            )
            if max_chunks is not None and len(rows) >= max_chunks:
                return rows
    return rows


class QdrantRest:
    def __init__(self, base_url: str, api_key: str | None = None, timeout: int = 60) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.timeout = timeout
        if api_key:
            self.session.headers.update({"api-key": api_key})
        self.session.headers.update({"Content-Type": "application/json"})

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def get_collections(self) -> list[str]:
        resp = self.session.get(self._url("/collections"), timeout=self.timeout)
        resp.raise_for_status()
        data = resp.json()
        return [c["name"] for c in data.get("result", {}).get("collections", [])]

    def delete_collection(self, collection: str) -> None:
        resp = self.session.delete(self._url(f"/collections/{collection}"), timeout=self.timeout)
        if resp.status_code not in (200, 202, 404):
            resp.raise_for_status()

    def create_collection(self, collection: str, vector_size: int) -> None:
        payload = {
            "vectors": {
                "size": vector_size,
                "distance": "Cosine",
            }
        }
        resp = self.session.put(self._url(f"/collections/{collection}"), json=payload, timeout=self.timeout)
        resp.raise_for_status()

    def get_collection(self, collection: str) -> dict:
        resp = self.session.get(self._url(f"/collections/{collection}"), timeout=self.timeout)
        resp.raise_for_status()
        return resp.json().get("result", {})

    def upsert_points(self, collection: str, points: list[dict]) -> None:
        payload = {"points": points}
        resp = self.session.put(self._url(f"/collections/{collection}/points?wait=true"), json=payload, timeout=self.timeout)
        resp.raise_for_status()


def extract_vector_size(collection_info: dict) -> int | None:
    vectors = collection_info.get("config", {}).get("params", {}).get("vectors")
    if isinstance(vectors, dict):
        if "size" in vectors:
            return int(vectors["size"])
        if "" in vectors and isinstance(vectors[""], dict) and "size" in vectors[""]:
            return int(vectors[""]["size"])
    return None


def ensure_collection(client: QdrantRest, collection: str, vector_size: int, recreate: bool) -> None:
    collections = set(client.get_collections())

    if recreate and collection in collections:
        client.delete_collection(collection)
        collections.remove(collection)

    if collection not in collections:
        client.create_collection(collection, vector_size)
        return

    details = client.get_collection(collection)
    existing_size = extract_vector_size(details)
    if existing_size is not None and existing_size != int(vector_size):
        raise ValueError(
            f"Collection {collection} has vector size {existing_size}, but model outputs {vector_size}. "
            "Use --recreate or choose a matching collection."
        )


def batched(items: list[dict], batch_size: int) -> Iterable[list[dict]]:
    for start in range(0, len(items), batch_size):
        yield items[start : start + batch_size]


def ingest(config: IngestConfig) -> None:
    print("[1/5] Loading + processing dataset...")
    processed_df = build_processed_df(config.max_rows)
    print(f"Processed rows: {len(processed_df):,}")

    print("[2/5] Building chunks...")
    corpus_rows = build_corpus_rows(processed_df, config.max_chunks)
    if not corpus_rows:
        raise RuntimeError("No chunks generated from dataset")
    print(f"Chunks to ingest: {len(corpus_rows):,}")

    print(f"[3/5] Loading embedding model: {config.model_name}")
    model = SentenceTransformer(config.model_name)
    dim = model.get_sentence_embedding_dimension()
    print(f"Embedding dimension: {dim}")

    print("[4/5] Preparing Qdrant collection...")
    client = QdrantRest(base_url=config.qdrant_url, api_key=config.qdrant_api_key)
    ensure_collection(client, config.collection, dim, config.recreate)

    print("[5/5] Embedding + upserting...")
    upserted = 0
    for chunk_batch in tqdm(list(batched(corpus_rows, config.batch_size)), desc="upsert batches"):
        texts = [row["text"] for row in chunk_batch]
        vectors = model.encode(
            texts,
            batch_size=min(64, len(texts)),
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )

        points: list[dict] = []
        for row, vector in zip(chunk_batch, vectors):
            point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, row["chunk_id"]))
            payload = {
                "doc_id": point_id,
                "tenant-id": config.tenant_id,
                "source_id": row["source_id"],
                "chunk_id": row["chunk_id"],
                "question": row["question"],
                "answer": row["answer"],
                "text": row["text"],
            }
            points.append({"id": point_id, "vector": vector.tolist(), "payload": payload})

        client.upsert_points(collection=config.collection, points=points)
        upserted += len(points)

    info = client.get_collection(config.collection)
    print("\nDone.")
    print(f"Upserted points: {upserted:,}")
    print(f"Collection points_count: {info.get('points_count')}")
    print(f"Collection indexed_vectors_count: {info.get('indexed_vectors_count')}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest Thai medical dataset into Qdrant")
    parser.add_argument("--qdrant-url", default=os.getenv("QDRANT_URL", ""))
    parser.add_argument("--qdrant-api-key", default=os.getenv("QDRANT_API_KEY", ""))
    parser.add_argument("--collection", default=os.getenv("QDRANT_COLLECTION", "medical_kb"))
    parser.add_argument("--model", default=os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3"))
    parser.add_argument("--tenant-id", default="huamor")
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--max-rows", type=int, default=None, help="Optional cap for processed QA rows")
    parser.add_argument("--max-chunks", type=int, default=None, help="Optional cap for corpus chunks")
    parser.add_argument("--recreate", action="store_true", help="Drop and recreate collection before ingest")
    return parser.parse_args()


def main() -> int:
    load_dotenv()
    args = parse_args()

    if not args.qdrant_url:
        raise SystemExit("Qdrant URL is required: set QDRANT_URL or pass --qdrant-url")

    cfg = IngestConfig(
        qdrant_url=args.qdrant_url,
        qdrant_api_key=args.qdrant_api_key or None,
        collection=args.collection,
        model_name=args.model,
        tenant_id=args.tenant_id,
        batch_size=max(1, args.batch_size),
        max_rows=args.max_rows,
        max_chunks=args.max_chunks,
        recreate=bool(args.recreate),
    )

    ingest(cfg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
