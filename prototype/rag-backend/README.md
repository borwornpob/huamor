# Medical Triage RAG Backend

Production-oriented medical triage backend built with Hono, TypeScript, LangGraph, Qdrant, and Airflow-managed offline pipelines.

## What is in this repo

- Online API for auth, patient chat, expert review, readiness, and metrics
- Runtime metadata capture for every generated answer
- Postgres-backed operational tables for inference events, review events, index versions, eval runs, and drift reports
- Qdrant-backed retrieval with local document fallback in development
- Docker-based deployment stack for API, Postgres, Qdrant, Nginx, and Airflow
- Airflow DAGs for dataset refresh, candidate index build, offline evaluation, drift reporting, promotion, and rollback

## API surface

- `GET /health`
- `GET /ready`
- `GET /metrics`
- `GET /api/docs`
- `GET /api/docs/openapi.json`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/chat/start`
- `POST /api/chat/:sessionId/message`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:sessionId/history`
- `GET /api/chat/:sessionId`
- `GET /api/chat/:sessionId/history`
- `GET /api/expert/pending`
- `GET /api/expert/sessions`
- `GET /api/expert/sessions/:sessionId/history`
- `POST /api/expert/sessions/:sessionId/review`
- `POST /api/expert/:sessionId/approve`

## Runtime behavior

- Every patient response stores `provider`, `modelVersion`, `promptVersion`, `indexVersion`, retrieval source/count, fallback reason, and latency.
- Every doctor review stores structured supervision fields including severity, escalation flag, outcome, and recommended department.
- In `prod` or with `STRICT_STARTUP=true`, the API fails fast if DB, Qdrant, or hosted model credentials are missing.
- In development, retrieval can fall back to local markdown/text files under `data/pdfs`.

## Local development

1. Install Node dependencies:

   ```bash
   pnpm install
   ```

2. Copy and edit env:

   ```bash
   cp .env.example .env
   ```

3. For local embedding mode, install Python dependencies you need:

   ```bash
   pip install sentence-transformers torch datasets pandas qdrant-client python-dotenv tqdm
   ```

4. Run the API:

   ```bash
   pnpm dev
   ```

5. Verify startup:

   ```bash
   curl http://localhost:8787/health
   curl http://localhost:8787/ready
   ```

## Docker deployment

The first deployment target is a VM running Docker.

1. Prepare `.env`.
2. Start the stack:

   ```bash
   docker compose up -d --build
   ```

3. Services:

- API: `http://localhost:8787`
- Nginx proxy: `http://localhost:8080`
- Airflow UI: `http://localhost:8081`
- Qdrant: `http://localhost:6333`
- Postgres: `localhost:5432`

## Airflow pipelines

Airflow DAGs live in `dags/` and call reusable Python code in `pipelines/`.

- `dataset_refresh`: build a cleaned dataset artifact
- `index_build`: create a candidate Qdrant collection and register it
- `offline_eval`: record evaluation metrics for the latest candidate
- `drift_report`: compute production drift indicators from inference/review events
- `promote_candidate`: switch the latest candidate to active
- `rollback_candidate`: mark the latest candidate as failed

This v1 treats “retrain” as dataset refresh + re-embedding + index rebuild + evaluation + promotion. It does not fine-tune model weights yet.

## Smoke test

Run an end-to-end flow for patient auth, chat, doctor review, readiness, and metrics:

```bash
pnpm test:api
```

Optional environment overrides:

- `BASE_URL`
- `PATIENT_USERNAME`, `PATIENT_PASSWORD`
- `DOCTOR_USERNAME`, `DOCTOR_PASSWORD`
- `ASSERT_QDRANT_UPSERT`
- `CURL_CONNECT_TIMEOUT`
- `CURL_MAX_TIME`

## Notes

- Demo users are enabled only when `ALLOW_DEMO_USERS=true`.
- Promotion is driven by rows in `index_versions`; the online API resolves the active collection from that table when DB is available.
- The Airflow/Python environment requires additional packages from `deploy/airflow/requirements.txt`.
- The repo currently contains both operational code and exploratory notebooks; only the code paths under `src/`, `pipelines/`, `dags/`, and `scripts/` are intended for deployment.
