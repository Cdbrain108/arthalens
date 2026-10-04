# Bulls Eye — API Specification (v1)

Base: `/api` — FastAPI, JSON, Pydantic v2 schemas. All timestamps ISO-8601 UTC.

## Research jobs

| Method | Path | Body / Params | Returns | Notes |
|---|---|---|---|---|
| POST | `/research` | `{ "query": str, "document_ids"?: [str], "mode"?: "auto" }` | `202 { job_id, status }` | idempotent via client-supplied `Idempotency-Key` header |
| GET | `/research/{job_id}` | — | full job object | includes report summary when done |
| GET | `/research/{job_id}/status` | — | `JobStatus` (below) | polled every 2s by UI; SSE at `/research/{job_id}/events` is the documented upgrade path |
| GET | `/research/{job_id}/report` | — | `ReportJSON` | available when `status=succeeded` |
| GET | `/research/{job_id}/pdf` | — | `application/pdf` file | 404 until ready |
| GET | `/research/history?limit=50` | pagination | `[JobSummary]` | newest first; limit clamped to 1–200 |

Jobs left in a non-terminal state by a previous run (crash or `--reload` restart) are marked `failed` with an `interrupted by server restart` error at startup — they never stay `running` forever.

## Documents (RAG)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/documents` | multipart file (PDF) + `{company?, doc_type?, period?}` | `{ document_id, chunks_indexed }` |
| GET | `/documents` | — | `[DocumentMeta]` |
| DELETE | `/documents/{id}` | — | `204` |

## Agents

| Method | Path | Returns |
|---|---|---|
| GET | `/agents` | registry: name, description, tools, status (enabled/optional) |

## JobStatus (the only thing the status UI may render)

```json
{
  "job_id": "research_123",
  "status": "queued|running|validating|synthesizing|rendering|succeeded|failed",
  "query": "Should I hold TCS for the next five years?",
  "current_node": "news_agent",
  "selected_agents": ["financial","valuation","market","news","growth","risk","document"],
  "completed_agents": ["financial","market"],
  "failed_agents": [],
  "steps": [
    {"node": "analyze_query", "state": "done", "at": "..."},
    {"node": "create_plan", "state": "done", "at": "..."},
    {"node": "news_agent", "state": "running", "at": null}
  ],
  "errors": []
}
```

## Error envelope (all endpoints)

```json
{ "error": { "code": "PROVIDER_UNAVAILABLE", "message": "...", "retryable": true } }
```

HTTP codes: `400` semantic validation (e.g. blank query), `422` request-body schema violations (FastAPI default), `404` unknown job/document, `409` duplicate idempotency key in-flight, `502` upstream provider failure (job may still be running — check `/status`).
