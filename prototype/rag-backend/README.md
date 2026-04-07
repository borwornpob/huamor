# RAG Backend (Hono + TypeScript + LangGraph + Qdrant)

This backend is designed for a Next.js frontend and keeps shared API types in TypeScript.

## Features

- Login backend for role-based access (patient/doctor)
- Chat backend with LangGraph orchestration
- Doctor checkpoint page backend (expert reviews and approves AI draft)
- Retrieval layer from self-hosted Qdrant (with local fallback in development)
- SEA-LION provider integration for contextual medical triage draft generation

## API Surface

- GET /api/docs
- GET /api/docs/openapi.json
- POST /api/auth/signup
- POST /api/auth/login
- GET /api/auth/me
- POST /api/chat/start
- POST /api/chat/:sessionId/message
- GET /api/chat/sessions
- GET /api/chat/sessions/:sessionId/history
- GET /api/chat/:sessionId
- GET /api/chat/:sessionId/history
- GET /api/expert/pending
- GET /api/expert/sessions
- GET /api/expert/sessions/:sessionId/history
- POST /api/expert/sessions/:sessionId/review
- POST /api/expert/:sessionId/approve

## Demo Accounts

- Patient: patient1 or patient1@example.com / patient123
- Doctor: doctor1 or doctor1@example.com / doctor123

## Auth Requests

Signup:

`POST /api/auth/signup`

```json
{
   "email": "patient@example.com",
   "firstName": "Jane",
   "lastName": "Doe",
   "birthDate": "1998-01-15",
   "gender": "female",
   "password": "secret123"
}
```

Login:

`POST /api/auth/login`

```json
{
   "email": "patient@example.com",
   "password": "secret123"
}
```

## Local Setup

1. Install dependencies:

   pnpm install

2. Configure env:

   cp .env.example .env

   For persistent chat history with Neon, set:
- `DATABASE_URL=postgresql://...` (your Neon connection string)

   If your Next App Router already handles login/signup, set:
- `TRUST_FORWARDED_USER_HEADERS=true`
- Forward these headers from Next server to this backend:
  - `x-user-id` (required)
  - `x-user-role` (`patient` or `doctor`, optional)
  - `x-user-name` (optional)

   Required for Qdrant retrieval:
- `QDRANT_URL`
- `QDRANT_COLLECTION`
- `EMBEDDING_PROVIDER` (`huggingface` or `sentence-transformers`)
- `EMBEDDING_MODEL` (`BAAI/bge-m3`)

   Optional:
- `QDRANT_API_KEY`
- `QDRANT_TEXT_PAYLOAD_KEY` (default: `text`)
- `QDRANT_VECTOR_NAME` (for named vectors)
- `QDRANT_SCORE_THRESHOLD`
- `HUGGINGFACE_API_KEY`
- `HUGGINGFACE_BASE_URL`

   SEA-LION LLM settings:
- `LLM_PROVIDER=sealion`
- `SEALION_API_KEY`
- `SEALION_BASE_URL` (default: `https://api.sea-lion.ai/v1`)
- `SEALION_MODEL` (default: `aisingapore/Gemma-SEA-LION-v4-27B-IT`)
- `LLM_TEMPERATURE`

   For local `sentence-transformers` mode:
- `PYTHON_EXECUTABLE` (default: `python3`)
- `SENTENCE_TRANSFORMERS_SCRIPT` (default: `./scripts/embed_query.py`)
- `SENTENCE_TRANSFORMERS_TIMEOUT_MS`

   Install local embedding dependencies:
1. `pip install sentence-transformers torch`

3. Run dev server:

   pnpm dev

4. Health check:

   GET http://localhost:8787/health

## Shared Types

Use the definitions in src/shared/types.ts in your Next.js app (copy directly or extract into a shared package/workspace).

## Doctor Checkpoint Flow

1. Patient sends message to /api/chat/start or /api/chat/:sessionId/message.
2. LangGraph runs retrieval + draft generation.
3. Assistant response is returned immediately and appended to the session.
4. Doctor can inspect all chat sessions via /api/expert/sessions, fetch session history, and submit review data via /api/expert/sessions/:sessionId/review.
5. Approved/corrected text is stored in session history and upserted to Qdrant.

You can optionally choose provider per chat call by adding `provider: "sealion"` in `/api/chat/start` and `/api/chat/:sessionId/message` request body.

For showing recent chats per user (multi-session), call `/api/chat/sessions?limit=20` as authenticated patient.

## API Test Pipeline

Run an end-to-end smoke test for auth, patient chat flow, expert review, and vector upsert:

1. Start server:

   `pnpm dev`

   If Neon is unreachable in your network, disable DB for smoke test:

   `DATABASE_URL= pnpm dev`

2. In a second terminal, run:

   `pnpm test:api`

Optional overrides:

- `BASE_URL` (default: `http://localhost:8787`)
- `PATIENT_USERNAME`, `PATIENT_PASSWORD`
- `DOCTOR_USERNAME`, `DOCTOR_PASSWORD`
- `ASSERT_QDRANT_UPSERT` (`false` by default; set `true` to fail when Qdrant upsert is unavailable)
- `CURL_CONNECT_TIMEOUT` (default: `10` seconds)
- `CURL_MAX_TIME` (default: `90` seconds per request)

Example:

`BASE_URL=http://localhost:8787 pnpm test:api`

## Notes

- Chat history is persisted in Neon when `DATABASE_URL` is set; otherwise in-memory fallback is used.
- Retrieval first queries Qdrant; if Qdrant is not reachable, it falls back to local `.md/.txt` documents from `data/pdfs`.
- Embedding provider can be remote Hugging Face inference or local sentence-transformers.
- Replace with production DB and real auth provider before deployment.

## Dataset Ingestion to Qdrant

To run a pipeline equivalent to the notebook (load -> parse -> filter -> dedupe -> chunk -> embed -> upsert):

1. Install Python dependencies:

   `pip install datasets pandas sentence-transformers qdrant-client python-dotenv tqdm`

2. Run ingestion script (full dataset):

   `python3 scripts/ingest_thai_med_pack_to_qdrant.py`

3. Optional test run with small subset first:

   `python3 scripts/ingest_thai_med_pack_to_qdrant.py --max-rows 200 --max-chunks 2000`

4. Verify Qdrant count:

   `curl -sS https://qdrant.taspolsd.dev/collections/medical_kb`
