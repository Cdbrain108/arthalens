# ArthaLens (Bullseye) — Production Deployment & Operations Guide

This guide documents the complete live production architecture, URLs, configurations, and step-by-step operational workflows for **ArthaLens (Bullseye)**.

---

## 1. Live Production Endpoints

| Component | Platform / Host | Production URL | Description |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | Firebase Hosting (Global CDN) | **https://arthalens.web.app** | Modern React + Vite SPA, dark theme, interactive research studio |
| **Backend API** | Google Cloud Run (Serverless) | **https://bullseye-backend-923160450523.us-central1.run.app** | FastAPI, LangGraph orchestrator, Python tools, WeasyPrint/fpdf2 |
| **API Health Check** | Google Cloud Run | **https://bullseye-backend-923160450523.us-central1.run.app/api/health** | Real-time status of all 11 specialist research agents |
| **Source Repository** | GitHub | **https://github.com/Cdbrain108/arthalens** | Version-controlled codebase with push protection |

---

## 2. Infrastructure Architecture & Configuration

```
                     +---------------------------------------+
                     |           User Browser / Mobile       |
                     +---------------------------------------+
                                         |
                     +-------------------+-------------------+
                     |                                       |
                     v                                       v
         [ Firebase Hosting CDN ]                 [ Google Cloud Run ]
        https://arthalens.web.app       https://bullseye-backend-...run.app
         (Static React SPA Assets)               (Containerized FastAPI)
                     |                                       |
                     v                                       v
          Firebase Authentication                 Multi-Agent Orchestration
           (Google & Email Auth)                             |
           Firestore & Storage             +-----------------+-----------------+
         (History & Report PDFs)           |                 |                 |
                                           v                 v                 v
                                      Market Data      Financial RAG       LLM Gateway
                                       (yfinance,      (SEC Filings,     (Gemini / SOTA,
                                      Google News)      FAISS index)      rate-limited)
```

### A. Frontend: Firebase Hosting
* **Firebase Project:** `samvaad-ai-db3a1`
* **Dedicated Hosting Site:** `arthalens`
* **Public Domains:**
  * `https://arthalens.web.app`
  * `https://arthalens.firebaseapp.com`
* **Authorized Auth Domains:** Whitelisted under Firebase Authentication -> Settings -> Authorized Domains.
* **Configuration File:** `firebase.json` (at project root).

### B. Backend: Google Cloud Run
* **GCP Project:** `nimble-artwork-384306`
* **Service Name:** `bullseye-backend`
* **Region:** `us-central1` (eligible for Google Cloud's **Always Free Tier**)
* **Container Specifications:**
  * **Memory:** `2 GiB` (provides headroom for PyTorch embeddings, FAISS, and WeasyPrint)
  * **vCPU:** `1` (with `--cpu-boost` enabled for fast container wake-up)
  * **Min Instances:** `0` (scales down to zero when idle for **$0.00 base cost**)
  * **Max Instances:** `1` (hard safety cap preventing runaway billing)
  * **Timeout:** `3600` seconds (60 minutes headroom for long multi-agent research runs)
  * **Concurrency:** `80` requests per instance

---

## 3. How to Update LLM API Keys & Environment Variables

The backend supports multiple model providers: `gemini`, `sota` (Vyce + Nvidia), `openrouter`, or `mock`.

### Method 1: Via Google Cloud Shell (Quickest)
Open Cloud Shell and run:
```bash
gcloud run services update bullseye-backend \
  --region us-central1 \
  --set-env-vars MODEL_PROVIDER=gemini,GEMINI_API_KEY="YOUR_KEY_HERE"
```

To add backup keys for round-robin rate limit rotation:
```bash
gcloud run services update bullseye-backend \
  --region us-central1 \
  --set-env-vars MODEL_PROVIDER=gemini,GEMINI_API_KEY="KEY_1",GEMINI_BACKUP_KEYS="KEY_2,KEY_3"
```

### Method 2: Via Google Cloud Web Console
1. Go to **[Google Cloud Run Console](https://console.cloud.google.com/run?project=nimble-artwork-384306)**.
2. Click on **`bullseye-backend`**.
3. Click **"Edit & Deploy New Revision"** at the top.
4. Navigate to the **"Variables & Secrets"** tab.
5. Click **"Add Variable"** and enter your key/value pairs.
6. Click **Deploy** (applies in ~10 seconds with zero downtime).

---

## 4. How to Deploy Updates in the Future

### A. Updating the Backend Code
Because your code is synced with GitHub:

1. **Commit and push changes locally:**
   ```powershell
   git add .
   git commit -m "feat: your new feature or bugfix"
   git push origin main
   ```

2. **Deploy to Cloud Run via Cloud Shell:**
   ```bash
   cd ~/arthalens && git pull origin main
   cd artha-ai/backend
   gcloud run deploy bullseye-backend \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --memory 2Gi \
     --cpu 1 \
     --cpu-boost \
     --timeout 3600 \
     --min-instances 0 \
     --max-instances 1 \
     --concurrency 80
   ```

### B. Updating the Frontend (React UI)
Whenever you change UI components, styling, or frontend logic:

1. **Rebuild the production bundle:**
   ```powershell
   cd d:\DATA_SCIENCE2.0\Projects\Stock_Researcher\artha-ai\frontend
   npm run build
   ```

2. **Deploy to Firebase Hosting:**
   ```powershell
   cd d:\DATA_SCIENCE2.0\Projects\Stock_Researcher
   npx firebase deploy --only hosting --project samvaad-ai-db3a1
   ```
*Changes are instantly published across Google's worldwide CDN.*

---

## 5. Security & Secret Protection Best Practices

* **`.gitignore` Rules:** All `.env`, `*API_KEYS*`, `*.sqlite`, and scratch test scripts are strictly excluded from git tracking.
* **GitHub Push Protection:** Active on `Cdbrain108/arthalens`. Never commit raw API keys into source files. Always use environment variables.
* **CORS Settings:** Configured in `backend/app/main.py` to allow cross-origin calls between `https://arthalens.web.app` and Cloud Run.

---

## 6. Verification Checklist

- [x] Cloud Run Admin API enabled on `nimble-artwork-384306`
- [x] Backend deployed with 2Gi RAM, 1 CPU, 3600s timeout, max 1 instance
- [x] Live `/api/health` returns `status: ok` and all 11 agents configured
- [x] Firebase Hosting multi-site `arthalens` created on `samvaad-ai-db3a1`
- [x] Production SPA bundle built and deployed to `https://arthalens.web.app`
- [x] Authorized domains `arthalens.web.app` & `arthalens.firebaseapp.com` added to Firebase Auth
- [x] Source code repository pushed to GitHub (`Cdbrain108/arthalens`)
