# REST API Specification (`backend/app/api/`)

## 1. Overview

The backend exposes a clean, asynchronous REST API contract used by the React frontend (`frontend/src/api/client.js`).

Base URL: `http://localhost:8000/api` (or `http://localhost:8001/api`)

---

## 2. Endpoints Summary

### Research Lifecycle Endpoints (`research_routes.py`)

| Method | Path | Description | Response Status |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/research` | Submits a natural-language query and enqueues a research job. | `202 Accepted` |
| `GET` | `/api/research/{job_id}/status` | Returns current execution status, in-flight node, steps array, and completed agents. | `200 OK` |
| `GET` | `/api/research/{job_id}/report` | Retrieves the finalized `ReportJSON` object. | `200 OK` |
| `GET` | `/api/research/{job_id}/pdf` | Downloads the generated research PDF report. | `200 OK` (binary application/pdf) |
| `POST` | `/api/research/{job_id}/ask` | Asks follow-up questions grounded strictly in the completed report and evidence. | `200 OK` |
| `GET` | `/api/research/history` | Returns the list of all historical research jobs. | `200 OK` |

---

### Document & RAG Endpoints (`document_routes.py`)

| Method | Path | Description | Response Status |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/documents` | Uploads a PDF (10-K, annual report, transcript) and indexes it into FAISS. | `201 Created` |
| `GET` | `/api/documents` | Lists all indexed documents and chunk statistics. | `200 OK` |

---

### Agent Registry Endpoints (`agent_routes.py`)

| Method | Path | Description | Response Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/agents` | Lists all 9 registered specialist agents, their goals, tools, and status (core vs optional). | `200 OK` |

---

## 3. Example Request & Polling Flow

```bash
# 1. Start a research job
curl -X POST http://localhost:8001/api/research \
     -H "Content-Type: application/json" \
     -d '{"query": "Should I hold TCS for the next 5 years?"}'

# Response:
# {"job_id": "c1f7a2b9-...", "status": "queued"}

# 2. Poll job status (React polls every 2 seconds)
curl http://localhost:8001/api/research/c1f7a2b9-.../status

# Response:
# {
#   "job_id": "c1f7a2b9-...",
#   "status": "running",
#   "current_node": "financial_agent",
#   "selected_agents": ["financial", "valuation", "market", "news", "risk", "growth"],
#   "completed_agents": ["market"],
#   "steps": [...]
# }

# 3. Download final PDF when status is "succeeded"
curl http://localhost:8001/api/research/c1f7a2b9-.../pdf --output TCS_Research.pdf
```
