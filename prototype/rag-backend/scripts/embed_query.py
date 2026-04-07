#!/usr/bin/env python3
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Embed a single query using sentence-transformers")
    parser.add_argument("--model", required=True, help="Model name, e.g. BAAI/bge-m3")
    parser.add_argument("--query", required=True, help="Text query to embed")
    args = parser.parse_args()

    try:
        from sentence_transformers import SentenceTransformer
    except Exception as exc:
        print(f"Failed to import sentence_transformers: {exc}", file=sys.stderr)
        return 2

    try:
        model = SentenceTransformer(args.model)
        vec = model.encode([args.query], normalize_embeddings=True, show_progress_bar=False)
        out = vec[0].tolist() if hasattr(vec[0], "tolist") else list(vec[0])
        print(json.dumps(out, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(f"Embedding failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
